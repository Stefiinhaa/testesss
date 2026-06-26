from datetime import date, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from .common_utils import ensure_admin, parse_values
from .delete_utils import DeleteBlockedError, get_delete_capability
from shared.auth_utils import get_current_user
from shared.database import get_session
from shared.models import Matricula, Professor, Turma

router = APIRouter(prefix="/turmas", tags=["Turmas"])


def ensure_unique_turma_name(session: Session, nome: str, current_id: str | None = None):
    normalized_name = (nome or '').strip()
    existing = session.exec(
        select(Turma)
        .where(func.lower(Turma.NomeTurma) == normalized_name.lower())
    ).all()
    for turma in existing:
        if current_id and turma.IdTurma == current_id:
            continue
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Já existe uma turma cadastrada com esse nome")


@router.get("/")
def listar_turmas(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=5000),
    q: str | None = None,
    nome_in: str | None = None,
    ano_in: str | None = None,
    professor_in: str | None = None,
    status_turma_in: str | None = None,
    sort_by: str = Query("nome"),
    sort_dir: str = Query("asc"),
    include_inativos: bool = False,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    conclusao_subquery = (
        select(
            Matricula.IdTurma.label("id_turma"),
            func.max(Matricula.DataConclusao).label("data_conclusao"),
        )
        .where(Matricula.DataConclusao.is_not(None))
        .group_by(Matricula.IdTurma)
        .subquery()
    )

    conditions = []

    # Tratamento da flag de Ativo/Inativo para a Turma
    status_values = parse_values(status_turma_in)
    if status_values:
        status_str = [str(a).strip().lower() for a in status_values]
        want_active = any(val in status_str for val in ['ativa', 'ativo', 'true', '1', 'sim'])
        want_inactive = any(val in status_str for val in ['inativa', 'inativo', 'false', '0', 'não', 'nao'])

        if want_active and not want_inactive:
            conditions.append(Turma.DeletedAt.is_(None))
        elif want_inactive and not want_active:
            conditions.append(Turma.DeletedAt.is_not(None))
    else:
        if not include_inativos:
            conditions.append(Turma.DeletedAt.is_(None))

    if q:
        professor_ids_for_q = session.exec(
            select(Professor.IdProfessor)
            .where(Professor.NomeProfessor.contains(q))
            .where(Professor.DeletedAt.is_(None))
        ).all()
        q_conditions = [Turma.NomeTurma.contains(q)]
        if professor_ids_for_q:
            q_conditions.append(Turma.IdProfessor.in_(professor_ids_for_q))
        conditions.append(q_conditions[0] if len(q_conditions) == 1 else (q_conditions[0] | q_conditions[1]))

    nome_values = parse_values(nome_in)
    if nome_values:
        conditions.append(Turma.NomeTurma.in_(nome_values))

    anos_values = parse_values(ano_in)
    if anos_values:
        year_ranges = []
        for year_text in anos_values:
            try:
                year_int = int(year_text)
                year_ranges.append((date(year_int, 1, 1), date(year_int, 12, 31)))
            except ValueError:
                continue
        if year_ranges:
            conditions.append(or_(*[Turma.AnoTurma.between(start, end) for start, end in year_ranges]))

    professor_values = parse_values(professor_in)
    if professor_values:
        professor_ids = session.exec(
            select(Professor.IdProfessor).where(Professor.NomeProfessor.in_(professor_values))
        ).all()
        ids = [value for value in professor_ids if value]
        if ids:
            conditions.append(Turma.IdProfessor.in_(ids))
        else:
            conditions.append(Turma.IdTurma == "__NO_MATCH__")

    where_clause = and_(*conditions) if conditions else None

    count_query = select(func.count()).select_from(Turma)
    if where_clause is not None:
        count_query = count_query.where(where_clause)
    total_row = session.exec(count_query).first()
    total = int(total_row[0] if isinstance(total_row, (tuple, list)) else (total_row or 0))

    sort_key = str(sort_by or "").strip().lower()
    direction = str(sort_dir or "asc").strip().lower()

    offset = (page - 1) * per_page
    query = select(Turma, conclusao_subquery.c.data_conclusao)
    query = query.outerjoin(conclusao_subquery, Turma.IdTurma == conclusao_subquery.c.id_turma)
    if where_clause is not None:
        query = query.where(where_clause)

    if sort_key == "professor":
        order_column = Professor.NomeProfessor
        query = query.outerjoin(Professor, Turma.IdProfessor == Professor.IdProfessor)
    elif sort_key == "data_conclusao":
        order_column = conclusao_subquery.c.data_conclusao
    else:
        sort_field_map = {
            "id_turma": Turma.IdTurma,
            "nome": Turma.NomeTurma,
            "ano": Turma.AnoTurma,
            "ativo": Turma.DeletedAt,
        }
        order_column = sort_field_map.get(sort_key, Turma.NomeTurma)

    order_clause = order_column.desc() if direction == "desc" else order_column.asc()
    query = query.order_by(order_clause).offset(offset).limit(per_page)
    rows = session.exec(query).all()

    turmas = [row[0] for row in rows]
    data_conclusao_by_turma = {
        row[0].IdTurma: row[1]
        for row in rows
        if row and row[0]
    }

    professor_ids_page = [t.IdProfessor for t in turmas if t.IdProfessor]
    professor_map = {}
    if professor_ids_page:
        professor_rows = session.exec(
            select(Professor.IdProfessor, Professor.NomeProfessor).where(Professor.IdProfessor.in_(professor_ids_page))
        ).all()
        professor_map = {row[0]: row[1] for row in professor_rows if row and row[0]}

    items = [
        {
            "id_turma": t.IdTurma,
            "nome": t.NomeTurma,
            "ano": t.AnoTurma,
            "id_professor": t.IdProfessor,
            "nome_professor": professor_map.get(t.IdProfessor),
            "data_conclusao": data_conclusao_by_turma.get(t.IdTurma),
            "ativo": t.DeletedAt is None,
        }
        for t in turmas
    ]
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/filter-options")
def listar_opcoes_filtro(
    include_inativos: bool = False,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    turma_where = []
    professor_where = [Professor.DeletedAt.is_(None)]
    if not include_inativos:
        turma_where.append(Turma.DeletedAt.is_(None))

    nomes_query = select(Turma.NomeTurma).where(Turma.NomeTurma.is_not(None))
    anos_query = select(Turma.AnoTurma).where(Turma.AnoTurma.is_not(None))
    if turma_where:
        nomes_query = nomes_query.where(*turma_where)
        anos_query = anos_query.where(*turma_where)

    nome_rows = session.exec(nomes_query.distinct().order_by(Turma.NomeTurma.asc())).all()
    ano_rows = session.exec(anos_query.distinct().order_by(Turma.AnoTurma.asc())).all()
    professor_rows = session.exec(
        select(Professor.NomeProfessor)
        .where(Professor.NomeProfessor.is_not(None))
        .where(*professor_where)
        .distinct()
        .order_by(Professor.NomeProfessor.asc())
    ).all()

    return {
        "options": {
            "nome": [str(value).strip() for value in nome_rows if value and str(value).strip()],
            "ano": [str(value.year) for value in ano_rows if value],
            "professor": [str(value).strip() for value in professor_rows if value and str(value).strip()],
            "status_turma": ["Ativa", "Inativa"] if include_inativos else ["Ativa"]
        }
    }


@router.get("/professores")
def listar_professores_para_turma(
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    professores = session.exec(
        select(Professor)
        .where(Professor.DeletedAt.is_(None))
        .order_by(Professor.NomeProfessor.asc())
    ).all()
    return {
        "items": [
            {"id_professor": p.IdProfessor, "nome": p.NomeProfessor}
            for p in professores
        ]
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def cadastrar_turma(
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    nome = (payload.get("NomeTurma") or "").strip()
    ano = payload.get("AnoTurma")
    id_professor = payload.get("IdProfessor") or None

    if not nome:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NomeTurma é obrigatório")
    if not ano:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AnoTurma é obrigatório")

    ensure_unique_turma_name(session, nome)

    if id_professor:
        professor = session.get(Professor, id_professor)
        if not professor or professor.DeletedAt is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Professor inválido para a turma")

    turma = Turma(
        IdTurma=(payload.get("IdTurma") or str(uuid4())).strip(),
        NomeTurma=nome,
        AnoTurma=ano,
        IdProfessor=id_professor,
        DeletedAt=None,
    )

    session.add(turma)
    try:
        session.commit()
        session.refresh(turma)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não foi possível criar a turma com os dados informados")
    except Exception:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao criar turma")
    return turma


@router.put("/{id_turma}")
def atualizar_turma(
    id_turma: str,
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    turma = session.get(Turma, id_turma)
    if not turma:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Turma não encontrada")

    if "NomeTurma" in payload and payload.get("NomeTurma"):
        novo_nome = str(payload.get("NomeTurma")).strip()
        ensure_unique_turma_name(session, novo_nome, current_id=id_turma)
        turma.NomeTurma = novo_nome

    if "AnoTurma" in payload and payload.get("AnoTurma"):
        turma.AnoTurma = payload.get("AnoTurma")

    if "IdProfessor" in payload:
        id_professor = payload.get("IdProfessor") or None
        if id_professor:
            professor = session.get(Professor, id_professor)
            if not professor or professor.DeletedAt is not None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Professor inválido para a turma")
            turma.IdProfessor = id_professor
        else:
            turma.IdProfessor = None

    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        turma.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()

    session.add(turma)
    session.commit()
    session.refresh(turma)
    return turma


@router.get("/{id_turma}/delete-capability")
def obter_delete_capability_turma(
    id_turma: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    turma = session.get(Turma, id_turma)
    if not turma:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Turma não encontrada")

    return get_delete_capability(session, turma)


@router.delete("/{id_turma}")
def inativar_turma(
    id_turma: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    turma = session.get(Turma, id_turma)
    if not turma:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Turma não encontrada")

    # Tenta excluir fisicamente primeiro. Se houver restrições de FK, inativa (soft delete).
    try:
        session.delete(turma)
        session.commit()
        return {"message": "Turma removida"}
    except IntegrityError:
        session.rollback()
        # Existe vinculação, então inativa
        if turma.DeletedAt is not None:
            return {"message": "Turma já está inativa"}
        turma.DeletedAt = datetime.utcnow()
        session.add(turma)
        session.commit()
        return {"message": "Turma inativada"}
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao processar remoção")
