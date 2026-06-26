from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from .common_utils import ensure_admin, parse_values
from .delete_utils import DeleteBlockedError, delete_or_soft_delete, get_delete_capability
from shared.auth_utils import get_current_user
from shared.database import get_session
from shared.models import Aluno, AlunoInteresse, Interesse

router = APIRouter(prefix="/alunos-interesses", tags=["Alunos Interesses"])


def serialize_aluno_interesse(
    item: AlunoInteresse,
    alunos_map: dict[str, Aluno] | None = None,
    interesses_map: dict[str, Interesse] | None = None,
) -> dict[str, object]:
    aluno = (alunos_map or {}).get(item.IdAluno)
    interesse = (interesses_map or {}).get(item.IdInteresse)
    return {
        "IdAlunoInteresse": item.IdAlunoInteresse,
        "IdAluno": item.IdAluno,
        "NomeAluno": aluno.NomeAluno if aluno else None,
        "IdInteresse": item.IdInteresse,
        "DescricaoInteresse": interesse.Descricao if interesse else None,
        "ativo": item.DeletedAt is None
    }


def has_active_duplicate(session: Session, aluno_id: str, interesse_id: str, current_id: str | None = None) -> bool:
    statement = (
        select(AlunoInteresse)
        .where(AlunoInteresse.IdAluno == aluno_id)
        .where(AlunoInteresse.IdInteresse == interesse_id)
        .where(AlunoInteresse.DeletedAt.is_(None))
    )
    if current_id:
        statement = statement.where(AlunoInteresse.IdAlunoInteresse != current_id)
    return session.exec(statement).first() is not None


@router.get("/")
def listar_alunos_interesses(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=5000),
    skip: int | None = Query(None, ge=0),
    limit: int | None = Query(None, ge=1, le=500),
    q: str | None = None,
    id_aluno: str | None = Query(None),
    id_interesse: str | None = Query(None),
    sort_by: str | None = Query("id_aluno_interesse"),
    sort_dir: str = Query("asc"),
    order_by: str | None = Query(None),
    desc: bool | None = Query(None),
    include_inativos: bool = False,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    if limit is not None:
        per_page = limit
    if skip is not None:
        page = (skip // per_page) + 1

    conditions = []
    if not include_inativos:
        conditions.append(AlunoInteresse.DeletedAt.is_(None))
    if q:
        q_text = str(q).strip()
        matching_aluno_ids = session.exec(
            select(Aluno.IdAluno).where(Aluno.NomeAluno.contains(q_text))
        ).all()
        matching_interesse_ids = session.exec(
            select(Interesse.IdInteresse).where(Interesse.Descricao.contains(q_text))
        ).all()
        conditions.append(
            or_(
                AlunoInteresse.IdAlunoInteresse.contains(q_text),
                AlunoInteresse.IdAluno.in_(matching_aluno_ids or ['']),
                AlunoInteresse.IdInteresse.in_(matching_interesse_ids or ['']),
            )
        )

    aluno_values = parse_values(id_aluno)
    if aluno_values:
        aluno_ids = session.exec(
            select(Aluno.IdAluno).where(
                or_(
                    Aluno.IdAluno.in_(aluno_values),
                    Aluno.NomeAluno.in_(aluno_values),
                )
            )
        ).all()
        conditions.append(AlunoInteresse.IdAluno.in_(aluno_ids or ['']))
    interesse_values = parse_values(id_interesse)
    if interesse_values:
        interesse_ids = session.exec(
            select(Interesse.IdInteresse).where(
                or_(
                    Interesse.IdInteresse.in_(interesse_values),
                    Interesse.Descricao.in_(interesse_values),
                )
            )
        ).all()
        conditions.append(AlunoInteresse.IdInteresse.in_(interesse_ids or ['']))

    where_clause = and_(*conditions) if conditions else None
    count_query = select(func.count()).select_from(AlunoInteresse)
    if where_clause is not None:
        count_query = count_query.where(where_clause)
    total_row = session.exec(count_query).first()
    total = int(total_row[0] if isinstance(total_row, (tuple, list)) else (total_row or 0))

    sort_key = str(sort_by or order_by or "id_aluno_interesse").strip().lower()
    direction = "desc" if desc is True else str(sort_dir or "asc").strip().lower()
    sort_field_map = {
        "id": AlunoInteresse.IdAlunoInteresse,
        "id_aluno_interesse": AlunoInteresse.IdAlunoInteresse,
        "idalunointeresse": AlunoInteresse.IdAlunoInteresse,
        "id_aluno": AlunoInteresse.IdAluno,
        "id_interesse": AlunoInteresse.IdInteresse,
    }
    order_column = sort_field_map.get(sort_key, AlunoInteresse.IdAlunoInteresse)
    order_clause = order_column.desc() if direction == "desc" else order_column.asc()

    offset = (page - 1) * per_page
    query = select(AlunoInteresse)
    if where_clause is not None:
        query = query.where(where_clause)
    rows = session.exec(query.order_by(order_clause).offset(offset).limit(per_page)).all()

    aluno_ids = {row.IdAluno for row in rows if row.IdAluno}
    interesse_ids = {row.IdInteresse for row in rows if row.IdInteresse}
    alunos_map = {
        item.IdAluno: item
        for item in session.exec(select(Aluno).where(Aluno.IdAluno.in_(aluno_ids))).all()
    } if aluno_ids else {}
    interesses_map = {
        item.IdInteresse: item
        for item in session.exec(select(Interesse).where(Interesse.IdInteresse.in_(interesse_ids))).all()
    } if interesse_ids else {}

    return {
        "items": [serialize_aluno_interesse(item, alunos_map, interesses_map) for item in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/filter-options")
def listar_opcoes_filtro(
    include_inativos: bool = False,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    base_conditions = []
    if not include_inativos:
        base_conditions.append(AlunoInteresse.DeletedAt.is_(None))

    aluno_query = select(Aluno.NomeAluno).join(AlunoInteresse, AlunoInteresse.IdAluno == Aluno.IdAluno).where(AlunoInteresse.IdAluno.is_not(None))
    interesse_query = select(Interesse.Descricao).join(AlunoInteresse, AlunoInteresse.IdInteresse == Interesse.IdInteresse).where(AlunoInteresse.IdInteresse.is_not(None))
    if base_conditions:
        aluno_query = aluno_query.where(*base_conditions)
        interesse_query = interesse_query.where(*base_conditions)

    aluno_rows = session.exec(aluno_query.distinct().order_by(Aluno.NomeAluno.asc())).all()
    interesse_rows = session.exec(interesse_query.distinct().order_by(Interesse.Descricao.asc())).all()
    return {
        "options": {
            "id_aluno": [str(value).strip() for value in aluno_rows if value and str(value).strip()],
            "id_interesse": [str(value).strip() for value in interesse_rows if value and str(value).strip()],
        }
    }


@router.get("/form-options")
def listar_opcoes_formulario(
    aluno_id: str | None = Query(None),
    current_id: str | None = Query(None),
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    alunos = session.exec(
        select(Aluno.IdAluno, Aluno.NomeAluno)
        .where(Aluno.DeletedAt.is_(None))
        .order_by(Aluno.NomeAluno.asc())
    ).all()
    interesses = session.exec(
        select(Interesse.IdInteresse, Interesse.Descricao)
        .where(Interesse.DeletedAt.is_(None))
        .order_by(Interesse.Descricao.asc())
    ).all()
    blocked_interesse_ids = set()
    if aluno_id:
        query = (
            select(AlunoInteresse.IdInteresse)
            .where(AlunoInteresse.IdAluno == aluno_id)
            .where(AlunoInteresse.DeletedAt.is_(None))
        )
        if current_id:
            query = query.where(AlunoInteresse.IdAlunoInteresse != current_id)
        blocked_interesse_ids = set(session.exec(query).all())
    return {
        "alunos": [{"id": row[0], "nome": row[1]} for row in alunos if row and row[0] and row[1]],
        "interesses": [{"id": row[0], "nome": row[1]} for row in interesses if row and row[0] and row[1] and row[0] not in blocked_interesse_ids],
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def cadastrar_aluno_interesse(
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    if not payload.get("IdAluno"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IdAluno é obrigatório")
    if not payload.get("IdInteresse"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IdInteresse é obrigatório")
    if has_active_duplicate(session, payload.get("IdAluno"), payload.get("IdInteresse")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este interesse já está vinculado ao aluno")

    item = AlunoInteresse(
        IdAlunoInteresse=str(payload.get("IdAlunoInteresse") or str(uuid4())).strip(),
        IdAluno=payload.get("IdAluno"),
        IdInteresse=payload.get("IdInteresse"),
    )
    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        item.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return serialize_aluno_interesse(item)


@router.put("/{id_aluno_interesse}")
def atualizar_aluno_interesse(
    id_aluno_interesse: str,
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    item = session.get(AlunoInteresse, id_aluno_interesse)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vínculo não encontrado")

    if "IdAluno" in payload and payload.get("IdAluno"):
        item.IdAluno = payload.get("IdAluno")
    if "IdInteresse" in payload and payload.get("IdInteresse"):
        item.IdInteresse = payload.get("IdInteresse")
    if has_active_duplicate(session, item.IdAluno, item.IdInteresse, item.IdAlunoInteresse):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este interesse já está vinculado ao aluno")

    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        item.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return serialize_aluno_interesse(item)


@router.get("/{id_aluno_interesse}/delete-capability")
def obter_delete_capability_aluno_interesse(
    id_aluno_interesse: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    item = session.get(AlunoInteresse, id_aluno_interesse)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vínculo não encontrado")

    return get_delete_capability(session, item)


@router.delete("/{id_aluno_interesse}")
def remover_aluno_interesse(
    id_aluno_interesse: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    item = session.get(AlunoInteresse, id_aluno_interesse)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vínculo não encontrado")

    try:
        outcome = delete_or_soft_delete(session, item)
    except DeleteBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if outcome == "already_inactive":
        return {"message": "Vínculo já está inativo"}
    if outcome == "hard_deleted":
        return {"message": "Vínculo removido"}
    return {"message": "Vínculo inativado"}
