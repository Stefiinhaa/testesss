from datetime import datetime
from uuid import uuid4
import os
import shutil

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_, func
from sqlmodel import Session, select

from .common_utils import ensure_admin, parse_values
from .delete_utils import DeleteBlockedError, delete_or_soft_delete, get_delete_capability
from shared.auth_utils import get_current_user
from shared.database import get_session
from shared.models import Professor
from shared.phone_utils import normalize_phone_storage

router = APIRouter(prefix="/professores", tags=["Professores"])


def delete_local_media_file(media_url: str | None):
    raw_value = str(media_url or "").strip()
    if not raw_value.startswith("/api/static/professores/"):
        return
    filename = os.path.basename(raw_value)
    if not filename:
        return
    file_path = os.path.join("uploads", "professores", filename)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass


def normalize_media_reference(value: str | None) -> str | None:
    normalized = str(value or '').strip()
    if not normalized:
        return None
    if normalized.startswith('data:'):
        return None
    if normalized.lower().startswith(('http://', 'https://')):
        return normalized
    filename = os.path.basename(normalized.replace('\\', '/'))
    return f'/api/static/professores/{filename}' if filename else None

@router.post("/{professor_id}/imagem")
def upload_imagem_professor(
    professor_id: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    usuario_logado: dict = Depends(get_current_user)
):
    ensure_admin(usuario_logado)

    professor = session.get(Professor, professor_id)
    if not professor:
        raise HTTPException(status_code=404, detail="Professor não encontrado")

    os.makedirs("uploads/professores", exist_ok=True)
    extension = os.path.splitext(file.filename)[1]
    filename = f"{professor_id}{extension}"
    file_location = f"uploads/professores/{filename}"

    if professor.Foto:
        delete_local_media_file(professor.Foto)

    with open(file_location, "wb+") as buffer:
        shutil.copyfileobj(file.file, buffer)

    image_url_path = f"/api/static/professores/{filename}"

    professor.Foto = image_url_path
    session.add(professor)
    session.commit()
    session.refresh(professor)

    return {"status": "ok", "url": image_url_path}


@router.get("/")
def listar_professores(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=5000),
    q: str | None = None,
    nome_in: str | None = None,
    email_in: str | None = None,
    telefone_in: str | None = None,
    endereco_in: str | None = None,
    foto_in: str | None = None,
    ativo_in: str | None = None,
    sort_by: str = Query("nome"),
    sort_dir: str = Query("asc"),
    include_inativos: bool = False,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    conditions = []
    if not include_inativos:
        conditions.append(Professor.DeletedAt.is_(None))

    if q:
        q_conditions = [
            Professor.NomeProfessor.contains(q),
            Professor.EmailProfessor.contains(q),
        ]
        q_conditions.append(Professor.Telefone.contains(q))
        conditions.append(q_conditions[0] | q_conditions[1] | q_conditions[2])

    nome_values = parse_values(nome_in)
    if nome_values:
        conditions.append(Professor.NomeProfessor.in_(nome_values))

    email_values = parse_values(email_in)
    if email_values:
        conditions.append(Professor.EmailProfessor.in_(email_values))

    telefone_values = parse_values(telefone_in)
    if telefone_values:
        conditions.append(Professor.Telefone.in_(telefone_values))

    endereco_values = parse_values(endereco_in)
    if endereco_values:
        conditions.append(Professor.Endereco.in_(endereco_values))

    foto_values = [str(value).strip().lower() for value in parse_values(foto_in) if str(value).strip()]
    if foto_values:
        wants_photo = any(value in {'sim', 'true', '1', 'com foto', 'foto'} for value in foto_values)
        wants_without_photo = any(value in {'nao', 'não', 'false', '0', 'sem foto'} for value in foto_values)
        if wants_photo and not wants_without_photo:
            conditions.append(Professor.Foto.is_not(None))
        elif wants_without_photo and not wants_photo:
            conditions.append(Professor.Foto.is_(None))

    ativo_values = [str(value).strip().lower() for value in parse_values(ativo_in) if str(value).strip()]
    if ativo_values:
        wants_active = any(value in {'ativo', 'ativa', 'sim', 'true', '1'} for value in ativo_values)
        wants_inactive = any(value in {'inativo', 'inativa', 'nao', 'não', 'false', '0'} for value in ativo_values)
        if wants_active and not wants_inactive:
            conditions.append(Professor.DeletedAt.is_(None))
        elif wants_inactive and not wants_active:
            conditions.append(Professor.DeletedAt.is_not(None))

    where_clause = and_(*conditions) if conditions else None

    count_query = select(func.count()).select_from(Professor)
    if where_clause is not None:
        count_query = count_query.where(where_clause)
    total_row = session.exec(count_query).first()
    total = int(total_row[0] if isinstance(total_row, (tuple, list)) else (total_row or 0))

    sort_key = str(sort_by or "nome").strip().lower()
    direction = str(sort_dir or "asc").strip().lower()
    sort_field_map = {
        "id_professor": Professor.IdProfessor,
        "nome": Professor.NomeProfessor,
        "email": Professor.EmailProfessor,
        "telefone": Professor.Telefone,
        "endereco": Professor.Endereco,
        "ativo": Professor.DeletedAt,
    }
    order_column = sort_field_map.get(sort_key, Professor.NomeProfessor)
    if sort_key == "ativo":
        order_clause = order_column.desc() if direction == "asc" else order_column.asc()
    else:
        order_clause = order_column.desc() if direction == "desc" else order_column.asc()

    offset = (page - 1) * per_page
    query = select(Professor)
    if where_clause is not None:
        query = query.where(where_clause)
    rows = session.exec(query.order_by(order_clause).offset(offset).limit(per_page)).all()

    items = [
        {
            "id_professor": p.IdProfessor,
            "nome": p.NomeProfessor,
            "email": p.EmailProfessor,
            "telefone": p.Telefone,
            "telefone_ddi": getattr(p, 'TelefoneDDI', None),
            "telefone_ddd": getattr(p, 'TelefoneDDD', None),
            "telefone_numero": getattr(p, 'TelefoneNumero', None),
            "whatsapp": bool(p.WhatsApp),
            "endereco": p.Endereco,
            "foto": p.Foto,
            "ativo": p.DeletedAt is None,
        }
        for p in rows
    ]
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/filter-options")
def listar_opcoes_filtro(
    include_inativos: bool = False,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    base_where = []
    if not include_inativos:
        base_where.append(Professor.DeletedAt.is_(None))

    name_query = select(Professor.NomeProfessor).where(Professor.NomeProfessor.is_not(None))
    email_query = select(Professor.EmailProfessor).where(Professor.EmailProfessor.is_not(None))
    telefone_query = select(Professor.Telefone).where(Professor.Telefone.is_not(None))
    endereco_query = select(Professor.Endereco).where(Professor.Endereco.is_not(None))
    foto_query = select(Professor.Foto).where(Professor.Foto.is_not(None))
    if base_where:
        name_query = name_query.where(*base_where)
        email_query = email_query.where(*base_where)
        telefone_query = telefone_query.where(*base_where)
        endereco_query = endereco_query.where(*base_where)
        foto_query = foto_query.where(*base_where)

    nome_rows = session.exec(name_query.distinct().order_by(Professor.NomeProfessor.asc())).all()
    email_rows = session.exec(email_query.distinct().order_by(Professor.EmailProfessor.asc())).all()
    telefone_rows = session.exec(telefone_query.distinct().order_by(Professor.Telefone.asc())).all()
    endereco_rows = session.exec(endereco_query.distinct().order_by(Professor.Endereco.asc())).all()
    foto_rows = session.exec(foto_query.distinct().order_by(Professor.Foto.asc())).all()

    return {
        "options": {
            "nome": [str(value).strip() for value in nome_rows if value and str(value).strip()],
            "email": [str(value).strip() for value in email_rows if value and str(value).strip()],
            "telefone": [str(value).strip() for value in telefone_rows if value and str(value).strip()],
            "endereco": [str(value).strip() for value in endereco_rows if value and str(value).strip()],
            "foto": ["Com foto", "Sem foto"] if foto_rows is not None else ["Com foto", "Sem foto"],
        }
    }


def parse_whatsapp_flag(payload: dict) -> bool:
    raw_value = payload.get("WhatsApp")
    if isinstance(raw_value, bool):
        return raw_value
    if raw_value is None:
        return False
    normalized = str(raw_value).strip().lower()
    return normalized in {"1", "true", "sim", "yes", "y", "whatsapp"}


@router.post("/", status_code=status.HTTP_201_CREATED)
def cadastrar_professor(
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    nome = (payload.get("NomeProfessor") or "").strip()
    email = (payload.get("EmailProfessor") or "").strip()
    telefone = normalize_phone_storage(
        phone=payload.get('Telefone'),
        ddi=payload.get('TelefoneDDI'),
        ddd=payload.get('TelefoneDDD'),
        number=payload.get('TelefoneNumero'),
    )
    if not nome:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NomeProfessor é obrigatório")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="EmailProfessor é obrigatório")
    if not telefone['local']:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Telefone é obrigatório")

    professor = Professor(
        IdProfessor=(payload.get("IdProfessor") or str(uuid4())).strip(),
        NomeProfessor=nome,
        EmailProfessor=email,
        Telefone=telefone['local'],
        TelefoneDDI=telefone['ddi'],
        TelefoneDDD=telefone['ddd'],
        TelefoneNumero=telefone['number'],
        WhatsApp=parse_whatsapp_flag(payload),
        Endereco=(payload.get("Endereco") or None),
        Foto=normalize_media_reference(payload.get("Foto")),
        DeletedAt=None,
    )
    session.add(professor)
    try:
        session.commit()
        session.refresh(professor)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não foi possível criar o professor com os dados informados")
    except Exception:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao criar professor")
    return professor


@router.put("/{id_professor}")
def atualizar_professor(
    id_professor: str,
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    professor = session.get(Professor, id_professor)
    if not professor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor não encontrado")

    previous_photo = professor.Foto

    if "NomeProfessor" in payload and payload.get("NomeProfessor"):
        professor.NomeProfessor = str(payload.get("NomeProfessor")).strip()
    if "EmailProfessor" in payload and payload.get("EmailProfessor"):
        professor.EmailProfessor = str(payload.get("EmailProfessor")).strip()
    if any(key in payload for key in ["Telefone", "TelefoneDDI", "TelefoneDDD", "TelefoneNumero"]):
        telefone = normalize_phone_storage(
            phone=payload.get('Telefone', professor.Telefone),
            ddi=payload.get('TelefoneDDI', professor.TelefoneDDI),
            ddd=payload.get('TelefoneDDD', professor.TelefoneDDD),
            number=payload.get('TelefoneNumero', professor.TelefoneNumero),
        )
        professor.Telefone = telefone['local']
        professor.TelefoneDDI = telefone['ddi']
        professor.TelefoneDDD = telefone['ddd']
        professor.TelefoneNumero = telefone['number']
    if "WhatsApp" in payload:
        professor.WhatsApp = parse_whatsapp_flag(payload)
    if "Endereco" in payload:
        professor.Endereco = payload.get("Endereco") or None
    if "Foto" in payload:
        professor.Foto = normalize_media_reference(payload.get("Foto"))
    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        professor.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()

    session.add(professor)
    session.commit()
    session.refresh(professor)

    if previous_photo and professor.Foto != previous_photo:
        delete_local_media_file(previous_photo)

    return professor


@router.get("/{id_professor}/delete-capability")
def obter_delete_capability_professor(
    id_professor: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    professor = session.get(Professor, id_professor)
    if not professor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor não encontrado")

    return get_delete_capability(session, professor)


@router.delete("/{id_professor}")
def inativar_professor(
    id_professor: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    professor = session.get(Professor, id_professor)
    if not professor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor não encontrado")

    previous_photo = professor.Foto
    try:
        outcome = delete_or_soft_delete(session, professor)
    except DeleteBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if outcome == "already_inactive":
        return {"message": "Professor já está inativo"}
    if outcome == "hard_deleted":
        delete_local_media_file(previous_photo)
        return {"message": "Professor removido"}
    return {"message": "Professor inativado"}
