from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from .common_utils import ensure_admin, parse_values
from .delete_utils import DeleteBlockedError, delete_or_soft_delete, get_delete_capability
from shared.auth_utils import get_current_user
from shared.database import get_session
from shared.models import Trilha, AlunoTrilha

router = APIRouter(prefix="/trilhas", tags=["Trilhas"])


def serialize_trilha(trilha: Trilha) -> dict[str, object]:
    return {
        "IdTrilha": trilha.IdTrilha,
        "NomeTrilha": trilha.NomeTrilha,
        "DescricaoTrilha": trilha.DescricaoTrilha,
        "CursosOnline": trilha.CursosOnline,
        "QtdCursos": trilha.QtdCursos,
        "ativo": trilha.DeletedAt is None
    }


@router.get("/")
def listar_trilhas(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=5000),
    skip: int | None = Query(None, ge=0),
    limit: int | None = Query(None, ge=1, le=500),
    q: str | None = None,
    nome_in: str | None = Query(None),
    nome: str | None = Query(None),
    descricao: str | None = Query(None),
    ativo_in: str | None = None,
    qtd_cursos: str | None = Query(None),
    cursos_online: str | None = Query(None),
    qtd_cursos_min: int | None = Query(None, ge=0),
    qtd_cursos_max: int | None = Query(None, le=999),
    sort_by: str | None = Query("nome_trilha"),
    sort_dir: str = Query("asc"),
    order_by: str | None = Query(None),
    desc: bool | None = Query(None),
    include_inativos: bool = False,
    session: Session = Depends(get_session),
):
    if limit is not None:
        per_page = limit
    if skip is not None:
        page = (skip // per_page) + 1

    conditions = []
    if not include_inativos:
        conditions.append(Trilha.DeletedAt.is_(None))
    if q:
        conditions.append(or_(
            Trilha.NomeTrilha.contains(q),
            Trilha.DescricaoTrilha.contains(q)
        ))

    nome_values = parse_values(nome_in or nome)
    if nome_values:
        conditions.append(Trilha.NomeTrilha.in_(nome_values))

    if descricao:
        descricao_values = parse_values(descricao)
        conditions.append(Trilha.DescricaoTrilha.in_(descricao_values))

    ativo_values = [str(value).strip().lower() for value in parse_values(ativo_in) if str(value).strip()]
    if ativo_values:
        wants_active = any(value in {'ativo', 'ativa', 'sim', 'true', '1'} for value in ativo_values)
        wants_inactive = any(value in {'inativo', 'inativa', 'nao', 'não', 'false', '0'} for value in ativo_values)
        if wants_active and not wants_inactive:
            conditions.append(Trilha.DeletedAt.is_(None))
        elif wants_inactive and not wants_active:
            conditions.append(Trilha.DeletedAt.is_not(None))

    # Filtro cursos_online: busca no campo CursosOnline da trilha
    cursos_online_values = parse_values(cursos_online)
    if cursos_online_values:
        cursos_conditions = [Trilha.CursosOnline.contains(v) for v in cursos_online_values if v.strip()]
        if cursos_conditions:
            conditions.append(or_(*cursos_conditions))

    qtd_cursos_values = []
    for raw_value in parse_values(qtd_cursos):
        try:
            qtd_cursos_values.append(int(raw_value))
        except (TypeError, ValueError):
            continue
    if qtd_cursos_values:
        conditions.append(Trilha.QtdCursos.in_(qtd_cursos_values))

    if qtd_cursos_min is not None:
        conditions.append(Trilha.QtdCursos >= qtd_cursos_min)

    if qtd_cursos_max is not None:
        conditions.append(Trilha.QtdCursos <= qtd_cursos_max)

    where_clause = and_(*conditions) if conditions else None
    count_query = select(func.count()).select_from(Trilha)
    if where_clause is not None:
        count_query = count_query.where(where_clause)
    total_row = session.exec(count_query).first()
    total = int(total_row[0] if isinstance(total_row, (tuple, list)) else (total_row or 0))

    sort_key = str(sort_by or order_by or "nome_trilha").strip().lower()
    direction = "desc" if desc is True else str(sort_dir or "asc").strip().lower()
    sort_field_map = {
        "id": Trilha.IdTrilha,
        "id_trilha": Trilha.IdTrilha,
        "idtrilha": Trilha.IdTrilha,
        "nome": Trilha.NomeTrilha,
        "nome_trilha": Trilha.NomeTrilha,
        "nometrilha": Trilha.NomeTrilha,
        "descricao": Trilha.DescricaoTrilha,
        "descricao_trilha": Trilha.DescricaoTrilha,
        "descricaotrilha": Trilha.DescricaoTrilha,
        "qtd_cursos": Trilha.QtdCursos,
        "qtdcursos": Trilha.QtdCursos,
    }
    order_column = sort_field_map.get(sort_key, Trilha.NomeTrilha)
    order_clause = order_column.desc() if direction == "desc" else order_column.asc()

    offset = (page - 1) * per_page
    query = select(Trilha)
    if where_clause is not None:
        query = query.where(where_clause)
    rows = session.exec(query.order_by(order_clause).offset(offset).limit(per_page)).all()

    return {
        "items": [serialize_trilha(trilha) for trilha in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/filter-options")
def listar_opcoes_filtro(
    include_inativos: bool = False,
    session: Session = Depends(get_session),
):

    nome_query = select(Trilha.NomeTrilha).where(Trilha.NomeTrilha.is_not(None))
    if not include_inativos:
        nome_query = nome_query.where(Trilha.DeletedAt.is_(None))
    nome_rows = session.exec(nome_query.distinct().order_by(Trilha.NomeTrilha.asc())).all()

    descricao_query = select(Trilha.DescricaoTrilha).where(Trilha.DescricaoTrilha.is_not(None))
    if not include_inativos:
        descricao_query = descricao_query.where(Trilha.DeletedAt.is_(None))
    descricao_rows = session.exec(descricao_query.distinct().order_by(Trilha.DescricaoTrilha.asc())).all()

    qtd_cursos_query = select(Trilha.QtdCursos)
    if not include_inativos:
        qtd_cursos_query = qtd_cursos_query.where(Trilha.DeletedAt.is_(None))
    qtd_cursos_rows = session.exec(qtd_cursos_query.distinct().order_by(Trilha.QtdCursos.asc())).all()

    cursos_online_query = select(Trilha.CursosOnline).where(Trilha.CursosOnline.is_not(None))
    if not include_inativos:
        cursos_online_query = cursos_online_query.where(Trilha.DeletedAt.is_(None))
    cursos_online_rows = session.exec(cursos_online_query.distinct().order_by(Trilha.CursosOnline.asc())).all()

    return {
        "options": {
            "nome_trilha": [str(value).strip() for value in nome_rows if value and str(value).strip()],
            "descricao_trilha": [str(value).strip() for value in descricao_rows if value and str(value).strip()],
            "qtd_cursos": sorted(set(qtd_cursos_rows)) if qtd_cursos_rows else [],
            "cursos_online": [str(value).strip() for value in cursos_online_rows if value and str(value).strip()],
        }
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def cadastrar_trilha(
    payload: dict = Body(...),
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    nome_trilha = str(payload.get("NomeTrilha") or "").strip()
    if not nome_trilha:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NomeTrilha é obrigatória")

    qtd_cursos_raw = payload.get("QtdCursos")
    if qtd_cursos_raw is None or str(qtd_cursos_raw).strip() == '':
        qtd_cursos = 0
    else:
        try:
            qtd_cursos = int(qtd_cursos_raw)
            if qtd_cursos < 0 or qtd_cursos > 999:
                raise ValueError
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="QtdCursos deve ser um número entre 0 e 999"
            )

    trilha = Trilha(
        IdTrilha=str(payload.get("IdTrilha") or str(uuid4())).strip(),
        NomeTrilha=nome_trilha,
        DescricaoTrilha=str(payload.get("DescricaoTrilha") or "").strip() or None,
        QtdCursos=qtd_cursos,
    )
    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        trilha.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()
    session.add(trilha)
    session.commit()
    session.refresh(trilha)
    return serialize_trilha(trilha)


@router.get("/{id_trilha}")
def obter_trilha(
    id_trilha: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    trilha = session.get(Trilha, id_trilha)
    if not trilha:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trilha não encontrada")

    return serialize_trilha(trilha)


@router.put("/{id_trilha}")
def atualizar_trilha(
    id_trilha: str,
    payload: dict = Body(...),
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    trilha = session.get(Trilha, id_trilha)
    if not trilha:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trilha não encontrada")

    if "NomeTrilha" in payload and payload.get("NomeTrilha"):
        trilha.NomeTrilha = str(payload.get("NomeTrilha")).strip()

    if "DescricaoTrilha" in payload:
        trilha.DescricaoTrilha = str(payload.get("DescricaoTrilha") or "").strip() or None

    if "QtdCursos" in payload:
        qtd_cursos_raw = payload.get("QtdCursos")
        if qtd_cursos_raw is None or str(qtd_cursos_raw).strip() == '':
            trilha.QtdCursos = 0
        else:
            try:
                qtd_cursos = int(qtd_cursos_raw)
                if qtd_cursos < 0 or qtd_cursos > 999:
                    raise ValueError
                trilha.QtdCursos = qtd_cursos
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="QtdCursos deve ser um número entre 0 e 999"
                )

    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        trilha.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()

    session.add(trilha)
    session.commit()
    session.refresh(trilha)
    return serialize_trilha(trilha)


@router.get("/{id_trilha}/delete-capability")
def obter_delete_capability_trilha(
    id_trilha: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    trilha = session.get(Trilha, id_trilha)
    if not trilha:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trilha não encontrada")

    return get_delete_capability(session, trilha)

@router.delete("/{id_trilha}")
def remover_trilha(
    id_trilha: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    trilha = session.get(Trilha, id_trilha)
    if not trilha:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trilha não encontrada")

    if getattr(trilha, "DeletedAt", None) is not None:
        return {"message": "Trilha já está inativa"}

    # VERIFICAÇÃO EXPLÍCITA: Quantos alunos estão vinculados a essa Trilha?
    vinculos = session.exec(
        select(func.count()).select_from(AlunoTrilha).where(AlunoTrilha.IdTrilha == id_trilha)
    ).first()

    total_vinculos = int(vinculos[0] if isinstance(vinculos, (tuple, list)) else (vinculos or 0))

    try:
        if total_vinculos > 0:
            # Tem aluno usando essa trilha -> INATIVA (Soft Delete)
            trilha.DeletedAt = datetime.utcnow()
            session.add(trilha)
            session.commit()
            return {"message": "Trilha inativada pois possui alunos vinculados"}
        else:
            # Ninguém usa essa trilha -> APAGA (Hard Delete)
            session.delete(trilha)
            session.commit()
            return {"message": "Trilha removida definitivamente"}

    except Exception as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro interno ao processar a exclusão da trilha."
        ) from exc
