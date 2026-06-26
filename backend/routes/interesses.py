from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .common_utils import ensure_admin, parse_values
from .delete_utils import DeleteBlockedError, delete_or_soft_delete, get_delete_capability
from shared.auth_utils import get_current_user
from shared.database import get_session
from shared.models import Interesse

router = APIRouter(prefix="/interesses", tags=["Interesses"])


def serialize_interesse(interesse: Interesse) -> dict[str, object]:
    return {
        "IdInteresse": interesse.IdInteresse,
        "Descricao": interesse.Descricao,
        "ativo": interesse.DeletedAt is None
    }


@router.get("/")
def listar_interesses(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=5000),
    skip: int | None = Query(None, ge=0),
    limit: int | None = Query(None, ge=1, le=500),
    q: str | None = None,
    descricao_in: str | None = Query(None),
    descricao: str | None = Query(None),
    ativo_in: str | None = Query(None),
    sort_by: str | None = Query("descricao"),
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

    # Tratamento da flag de Ativo/Inativo
    ativo_values = parse_values(ativo_in)
    if ativo_values:
        ativos_str = [str(a).strip().lower() for a in ativo_values]
        want_active = any(val in ativos_str for val in ['ativo', 'true', '1', 'sim'])
        want_inactive = any(val in ativos_str for val in ['inativo', 'false', '0', 'não', 'nao'])

        if want_active and not want_inactive:
            conditions.append(Interesse.DeletedAt.is_(None))
        elif want_inactive and not want_active:
            conditions.append(Interesse.DeletedAt.is_not(None))
    else:
        if not include_inativos:
            conditions.append(Interesse.DeletedAt.is_(None))

    if q:
        conditions.append(Interesse.Descricao.contains(q))

    descricao_values = parse_values(descricao_in or descricao)
    if descricao_values:
        conditions.append(Interesse.Descricao.in_(descricao_values))

    where_clause = and_(*conditions) if conditions else None

    count_query = select(func.count()).select_from(Interesse)
    if where_clause is not None:
        count_query = count_query.where(where_clause)
    total_row = session.exec(count_query).first()
    total = int(total_row[0] if isinstance(total_row, (tuple, list)) else (total_row or 0))

    sort_key = str(sort_by or order_by or "descricao").strip().lower()
    direction = "desc" if desc is True else str(sort_dir or "asc").strip().lower()
    sort_field_map = {
        "id": Interesse.IdInteresse,
        "id_interesse": Interesse.IdInteresse,
        "idinteresse": Interesse.IdInteresse,
        "descricao": Interesse.Descricao,
    }
    order_column = sort_field_map.get(sort_key, Interesse.Descricao)
    order_clause = order_column.desc() if direction == "desc" else order_column.asc()

    offset = (page - 1) * per_page
    query = select(Interesse)
    if where_clause is not None:
        query = query.where(where_clause)
    rows = session.exec(query.order_by(order_clause).offset(offset).limit(per_page)).all()

    return {
        "items": [serialize_interesse(interesse) for interesse in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/filter-options")
def listar_opcoes_filtro(
    include_inativos: bool = False,
    session: Session = Depends(get_session),
):
    query = select(Interesse.Descricao).where(Interesse.Descricao.is_not(None))
    if not include_inativos:
        query = query.where(Interesse.DeletedAt.is_(None))

    descricao_rows = session.exec(query.distinct().order_by(Interesse.Descricao.asc())).all()
    return {
        "options": {
            "descricao": [str(value).strip() for value in descricao_rows if value and str(value).strip()],
            "ativo": ["Ativo", "Inativo"] if include_inativos else ["Ativo"]
        }
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def cadastrar_interesse(
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    descricao = str(payload.get("Descricao") or "").strip()
    if not descricao:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Descricao é obrigatória")

    interesse = Interesse(
        IdInteresse=str(payload.get("IdInteresse") or str(uuid4())).strip(),
        Descricao=descricao,
    )
    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        interesse.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()
    session.add(interesse)
    session.commit()
    session.refresh(interesse)
    return interesse


@router.put("/{id_interesse}")
def atualizar_interesse(
    id_interesse: str,
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    interesse = session.get(Interesse, id_interesse)
    if not interesse:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interesse não encontrado")

    if "Descricao" in payload and payload.get("Descricao"):
        interesse.Descricao = str(payload.get("Descricao")).strip()

    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        interesse.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()
    session.add(interesse)
    session.commit()
    session.refresh(interesse)
    return interesse


@router.get("/{id_interesse}/delete-capability")
def obter_delete_capability_interesse(
    id_interesse: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    interesse = session.get(Interesse, id_interesse)
    if not interesse:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interesse não encontrado")

    return get_delete_capability(session, interesse)


@router.delete("/{id_interesse}")
def remover_interesse(
    id_interesse: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    interesse = session.get(Interesse, id_interesse)
    if not interesse:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interesse não encontrado")

    # Verifica na hora da deleção. Se estourar Constraint do BD (IntegrityError),
    # significa que tem vinculação, portanto nós fazemos um soft delete no fallback.
    try:
        session.delete(interesse)
        session.commit()
        return {"message": "Interesse removido"}
    except IntegrityError:
        session.rollback()
        # Tem vinculo, entao só inativa
        if interesse.DeletedAt is not None:
            return {"message": "Interesse já está inativo"}
        interesse.DeletedAt = datetime.utcnow()
        session.add(interesse)
        session.commit()
        return {"message": "Interesse inativado"}
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao processar remoção")
