from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from datetime import datetime
from sqlmodel import Session, select
from sqlalchemy import and_, func
from shared.database import get_session
from shared.models import Usuario, Aluno
from backend.schemas import UsuarioCreate
from shared.security import gerar_hash_senha
from shared.auth_utils import get_current_user, require_admin
from shared.rate_limit import enforce_rate_limit
from .common_utils import ensure_admin, parse_values
from .delete_utils import DeleteBlockedError, delete_or_soft_delete, get_delete_capability

router = APIRouter(prefix="/usuarios", tags=["Usuários"])

ALLOWED_UPDATE_ME_FIELDS = {"senha", "user"}
ALLOWED_UPDATE_USUARIO_FIELDS = {"senha", "senha_hash", "login", "user", "perfil", "id_aluno", "ativo"}


def parse_ativo_values(raw: str | None) -> list[bool]:
    values = parse_values(raw)
    mapped: list[bool] = []
    for value in values:
        normalized = value.strip().lower()
        if normalized in {"true", "1", "sim", "ativo", "ativos"}:
            mapped.append(True)
        elif normalized in {"false", "0", "nao", "não", "inativo", "inativos"}:
            mapped.append(False)
    return list(dict.fromkeys(mapped))


def rate_limit_cadastrar_usuario(request: Request):
    enforce_rate_limit(request, scope="admin-create-user", limit=20, window_seconds=60)




def _ensure_allowed_fields(dados: dict, allowed_fields: set[str], contexto: str):
    unknown_fields = sorted(set(dados.keys()) - allowed_fields)
    if unknown_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Campos não permitidos em {contexto}: {', '.join(unknown_fields)}",
        )

@router.post("/cadastrar", status_code=status.HTTP_201_CREATED)
def cadastrar_usuario(
    dados: UsuarioCreate,
    session: Session = Depends(get_session),
    _: None = Depends(rate_limit_cadastrar_usuario),
    usuario_logado: dict = Depends(require_admin),
):
    """
    Cria um novo usuário no sistema com senha criptografada.
    """
    # 1. Verificar se o usuário já existe pelo e-mail/login
    login = str(dados.login or dados.user or "").strip()
    senha = str(dados.senha or dados.senha_hash or "")

    if not login:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Login é obrigatório."
        )
    if not senha:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha é obrigatória."
        )

    usuario_existente = session.exec(
        select(Usuario).where(Usuario.User == login)
    ).first()

    if usuario_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este login já está cadastrado no sistema."
        )

    # 2. Validar vínculo com aluno (apenas para perfil aluno)
    perfil = (dados.perfil or "aluno").strip()
    perfil_norm = perfil.lower()
    if perfil_norm == "aluno":
        if not dados.id_aluno:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="id_aluno é obrigatório para usuários com perfil aluno."
            )
        aluno = session.get(Aluno, dados.id_aluno)
        if not aluno:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="id_aluno informado não existe."
            )
        id_aluno = dados.id_aluno
    else:
        if dados.id_aluno:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="IdAluno só é permitido quando o perfil é aluno."
            )
        id_aluno = None

    # 3. Criar a instância do novo usuário
    novo_usuario = Usuario(
        User=login,
        Senha=gerar_hash_senha(senha),  # Hashing da senha para segurança
        Perfil=perfil,
        IdAluno=id_aluno,
        Ativo=True
    )

    try:
        session.add(novo_usuario)
        session.commit()
        session.refresh(novo_usuario)

        return {
            "message": "Usuário criado com sucesso!",
            "id": novo_usuario.IdUsuario
        }
    except Exception as e:
        session.rollback()
        # Se for erro de validação vindo do gerador de hash (ex: senha > 72 bytes), convertemos para 400
        if isinstance(e, ValueError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao processar o cadastro no banco de dados."
        )

@router.get("/me")
def obter_perfil_atual(usuario_logado: dict = Depends(get_current_user)):
    """
    Retorna os dados do usuário contidos no Token JWT.
    Permite ao Frontend identificar quem está logado.
    """
    return {
        "id": usuario_logado.get("id"),
        "user": usuario_logado.get("sub"),
        "perfil": usuario_logado.get("perfil")
    }


@router.put('/me')
def update_my_profile(dados: dict, usuario_logado: dict = Depends(get_current_user), session: Session = Depends(get_session)):
    """Permite ao usuário alterar seus próprios dados básicos (login/email e senha)."""
    _ensure_allowed_fields(dados, ALLOWED_UPDATE_ME_FIELDS, "update_my_profile")

    user_id = usuario_logado.get('id')
    usuario = session.get(Usuario, user_id)
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Usuário não encontrado')

    changed = False
    if 'senha' in dados and dados['senha']:
        usuario.Senha = gerar_hash_senha(dados['senha'])
        changed = True
    if 'user' in dados and dados['user']:
        usuario.User = dados['user']
        changed = True

    if changed:
        try:
            session.add(usuario)
            session.commit()
            session.refresh(usuario)
        except Exception:
            session.rollback()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Erro ao atualizar usuário')

    return {"id": usuario.IdUsuario, "user": usuario.User, "perfil": usuario.Perfil, "ativo": bool(usuario.Ativo)}


@router.get("/", response_model=dict)
def listar_usuarios(
    include_inativos: bool = False,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=5000),
    q: str | None = None,
    login_in: str | None = Query(None),
    perfil_in: str | None = Query(None),
    id_aluno_in: str | None = Query(None),
    ativo_in: str | None = Query(None),
    sort_by: str = Query("id"),
    sort_dir: str = Query("asc"),
    usuario_logado: dict = Depends(require_admin),
    session: Session = Depends(get_session)
):
    """
    Lista usuários — apenas administradores podem ver todos os usuários.
    Suporta paginação via `page` e `per_page` e busca com `q`.
    """
    base_condition = []
    if not include_inativos:
        base_condition.append(Usuario.Ativo == True)
    if q:
        base_condition.append(Usuario.User.contains(q))

    login_values = parse_values(login_in)
    if login_values:
        base_condition.append(Usuario.User.in_(login_values))

    perfil_values = parse_values(perfil_in)
    if perfil_values:
        base_condition.append(Usuario.Perfil.in_(perfil_values))

    id_aluno_values = parse_values(id_aluno_in)
    if id_aluno_values:
        base_condition.append(Usuario.IdAluno.in_(id_aluno_values))

    ativo_values = parse_ativo_values(ativo_in)
    if ativo_values:
        if len(ativo_values) == 1:
            base_condition.append(Usuario.Ativo == ativo_values[0])
        else:
            base_condition.append(Usuario.Ativo.in_(ativo_values))

    where_clause = and_(*base_condition) if base_condition else None

    # total count
    if where_clause is not None:
        total_row = session.exec(select(func.count()).select_from(Usuario).where(where_clause)).first()
    else:
        total_row = session.exec(select(func.count()).select_from(Usuario)).first()
    if total_row is None:
        total = 0
    elif isinstance(total_row, (tuple, list)):
        total = int(total_row[0])
    else:
        total = int(total_row)

    sort_key = str(sort_by or "").strip().lower()
    direction = str(sort_dir or "asc").strip().lower()

    query = select(Usuario)
    if where_clause is not None:
        query = query.where(where_clause)

    if sort_key == "nome_aluno":
        order_column = Aluno.NomeAluno
        query = query.outerjoin(Aluno, Usuario.IdAluno == Aluno.IdAluno)
    else:
        sort_field_map = {
            "id": Usuario.IdUsuario,
            "login": Usuario.User,
            "user": Usuario.User,
            "perfil": Usuario.Perfil,
            "id_aluno": Usuario.IdAluno,
            "ativo": Usuario.Ativo,
        }
        order_column = sort_field_map.get(sort_key, Usuario.IdUsuario)

    order_clause = order_column.desc() if direction == "desc" else order_column.asc()

    offset = (page - 1) * per_page
    query = query.order_by(order_clause).offset(offset).limit(per_page)

    results = session.exec(query).all()
    aluno_ids = [u.IdAluno for u in results if getattr(u, 'IdAluno', None)]
    alunos_por_id: dict[str, str] = {}
    if aluno_ids:
        alunos = session.exec(select(Aluno).where(Aluno.IdAluno.in_(aluno_ids))).all()
        alunos_por_id = {a.IdAluno: a.NomeAluno for a in alunos}

    items = [
        {
            "id": u.IdUsuario,
            "login": u.User,
            "user": u.User,
            "perfil": u.Perfil,
            "ativo": bool(u.Ativo),
            "id_aluno": getattr(u, 'IdAluno', None),
            "nome_aluno": alunos_por_id.get(getattr(u, 'IdAluno', None), None),
        }
        for u in results
    ]

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/filter-options")
def listar_opcoes_filtro_usuarios(
    include_inativos: bool = False,
    usuario_logado: dict = Depends(require_admin),
    session: Session = Depends(get_session)
):
    where_clause = []
    if not include_inativos:
        where_clause.append(Usuario.Ativo == True)

    perfil_query = select(Usuario.Perfil).where(Usuario.Perfil.is_not(None))
    if where_clause:
        perfil_query = perfil_query.where(*where_clause)

    perfil_rows = session.exec(
        perfil_query.distinct().order_by(Usuario.Perfil.asc())
    ).all()
    login_query = select(Usuario.User).where(Usuario.User.is_not(None))
    id_aluno_query = select(Usuario.IdAluno).where(Usuario.IdAluno.is_not(None))
    if where_clause:
        login_query = login_query.where(*where_clause)
        id_aluno_query = id_aluno_query.where(*where_clause)

    login_rows = session.exec(
        login_query.distinct().order_by(Usuario.User.asc())
    ).all()
    id_aluno_rows = session.exec(
        id_aluno_query.distinct().order_by(Usuario.IdAluno.asc())
    ).all()

    perfis = [str(value).strip() for value in perfil_rows if value is not None and str(value).strip()]
    return {
        "options": {
            "login": [str(value).strip() for value in login_rows if value is not None and str(value).strip()],
            "perfil": perfis,
            "id_aluno": [str(value).strip() for value in id_aluno_rows if value is not None and str(value).strip()],
            "ativo": ["Ativo", "Inativo"],
        }
    }


@router.get("/{usuario_id}")
def obter_usuario(usuario_id: int, usuario_logado: dict = Depends(require_admin), session: Session = Depends(get_session)):
    usuario = session.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    nome_aluno = None
    if getattr(usuario, 'IdAluno', None):
        aluno = session.get(Aluno, usuario.IdAluno)
        if aluno:
            nome_aluno = aluno.NomeAluno
    return {
        "id": usuario.IdUsuario,
        "login": usuario.User,
        "user": usuario.User,
        "perfil": usuario.Perfil,
        "ativo": bool(usuario.Ativo),
        "id_aluno": getattr(usuario, 'IdAluno', None),
        "nome_aluno": nome_aluno,
    }


@router.get("/{usuario_id}/delete-capability")
def obter_delete_capability_usuario(usuario_id: int, usuario_logado: dict = Depends(require_admin), session: Session = Depends(get_session)):
    usuario = session.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    return get_delete_capability(session, usuario)


@router.put("/{usuario_id}")
def atualizar_usuario(usuario_id: int, dados: dict, usuario_logado: dict = Depends(require_admin), session: Session = Depends(get_session)):
    """Atualiza campos permitidos de um usuário (senha, perfil, ativo)."""
    _ensure_allowed_fields(dados, ALLOWED_UPDATE_USUARIO_FIELDS, "atualizar_usuario")

    usuario = session.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    changed = False
    if 'senha' in dados and dados['senha']:
        usuario.Senha = gerar_hash_senha(dados['senha'])
        changed = True
    if 'senha_hash' in dados and dados['senha_hash']:
        usuario.Senha = gerar_hash_senha(dados['senha_hash'])
        changed = True
    login = dados.get('login') or dados.get('user')
    if login:
        login = str(login).strip()
        existente = session.exec(
            select(Usuario).where(Usuario.User == login).where(Usuario.IdUsuario != usuario_id)
        ).first()
        if existente:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este login já está cadastrado no sistema.")
        usuario.User = login
        changed = True
    novo_perfil = dados.get('perfil')
    id_aluno_req = dados.get('id_aluno')

    if novo_perfil:
        perfil_norm = str(novo_perfil).strip().lower()
        if perfil_norm == 'aluno':
            if id_aluno_req:
                aluno = session.get(Aluno, id_aluno_req)
                if not aluno:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IdAluno informado não existe.")
                usuario.IdAluno = id_aluno_req
                changed = True
        else:
            if id_aluno_req:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IdAluno só é permitido quando o perfil é aluno.")
            usuario.IdAluno = None
            changed = True

        usuario.Perfil = str(novo_perfil).strip()
        changed = True

    if id_aluno_req and not novo_perfil:
        if str(usuario.Perfil).lower() != 'aluno':
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IdAluno só é permitido quando o perfil é aluno.")
        aluno = session.get(Aluno, id_aluno_req)
        if not aluno:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IdAluno informado não existe.")
        usuario.IdAluno = id_aluno_req
        changed = True
    if 'ativo' in dados and isinstance(dados['ativo'], bool):
        usuario.Ativo = dados['ativo']
        changed = True

    if changed:
        try:
            session.add(usuario)
            session.commit()
            session.refresh(usuario)
        except Exception:
            session.rollback()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao atualizar usuário")

    return {
        "id": usuario.IdUsuario,
        "login": usuario.User,
        "user": usuario.User,
        "perfil": usuario.Perfil,
        "ativo": bool(usuario.Ativo),
        "id_aluno": getattr(usuario, 'IdAluno', None),
    }


@router.delete("/{usuario_id}")
def soft_delete_usuario(usuario_id: int, usuario_logado: dict = Depends(require_admin), session: Session = Depends(get_session)):
    """Remove totalmente quando possível; caso contrário, marca o usuário como inativo."""
    usuario = session.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    try:
        outcome = delete_or_soft_delete(session, usuario)
    except DeleteBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao remover usuário")
    if outcome == "already_inactive":
        return {"message": "Usuário já está inativo"}
    if outcome == "hard_deleted":
        return {"message": "Usuário removido"}
    return {"message": "Usuário marcado como inativo"}
