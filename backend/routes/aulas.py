"""CRUD e calendário de Aulas."""
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from .common_utils import ensure_admin, parse_values
from shared.auth_utils import get_current_user
from shared.database import get_session
from shared.models import Aula, Chamada, Turma

router = APIRouter(prefix="/aulas", tags=["Aulas"])


def serialize_aula(aula: Aula, turma_nome: str | None = None) -> dict:
    duracao = None
    if aula.HoraInicio and aula.HoraFim:
        try:
            delta = aula.HoraFim - aula.HoraInicio
            duracao = max(0, int(delta.total_seconds() // 60))
        except (TypeError, AttributeError):
            pass
    inicio = aula.HoraInicio
    fim = aula.HoraFim
    return {
        "IdAula": aula.IdAula,
        "NomeAula": aula.NomeAula,
        "DescricaoAula": getattr(aula, 'DescricaoAula', None),
        "HoraInicio": inicio.isoformat() if hasattr(inicio, 'isoformat') else inicio,
        "HoraFim": fim.isoformat() if hasattr(fim, 'isoformat') else fim,
        "DuracaoMinutos": duracao,
        "IdTurma": aula.IdTurma,
        "NomeTurma": turma_nome,
        "NumeroDeAulas": aula.NumeroDeAulas,
        "IntervaloEntreAulas": aula.IntervaloEntreAulas,
        "LimitAulas": aula.LimitAulas,
        "StatusChamada": aula.StatusChamada,
        "Observacao": getattr(aula, 'Observacao', None),
    }


@router.get("/")
def listar_aulas(
    start: str | None = Query(None),
    end: str | None = Query(None),
    turma_in: str | None = Query(None),
    q: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(500, ge=1, le=5000),
    sort_by: str = Query("hora_inicio"),
    sort_dir: str = Query("asc"),
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Lista aulas para o calendário. Aceita intervalo de datas (start/end)."""
    ensure_admin(usuario_logado)

    conditions = []

    if start:
        try:
            start_dt = datetime.fromisoformat(start)
            conditions.append(Aula.HoraInicio >= start_dt)
        except ValueError:
            pass

    if end:
        try:
            end_dt = datetime.fromisoformat(end)
            conditions.append(Aula.HoraFim <= end_dt)
        except ValueError:
            pass

    if q:
        conditions.append(or_(
            Aula.NomeAula.contains(q),
            Aula.IdTurma.contains(q),
        ))

    turma_values = parse_values(turma_in)
    if turma_values:
        turma_ids = session.exec(
            select(Turma.IdTurma).where(Turma.NomeTurma.in_(turma_values))
        ).all()
        if turma_ids:
            conditions.append(Aula.IdTurma.in_(turma_ids))
        else:
            conditions.append(Aula.IdAula == '__NO_MATCH__')

    where_clause = and_(*conditions) if conditions else None

    count_query = select(func.count()).select_from(Aula)
    if where_clause is not None:
        count_query = count_query.where(where_clause)
    total = int(session.exec(count_query).first() or 0)

    query = select(Aula)
    if where_clause is not None:
        query = query.where(where_clause)

    sort_map = {
        "hora_inicio": Aula.HoraInicio,
        "nome": Aula.NomeAula,
        "turma": Aula.IdTurma,
    }
    col = sort_map.get(sort_by, Aula.HoraInicio)
    query = query.order_by(col.desc() if sort_dir == "desc" else col.asc())

    offset = (page - 1) * per_page
    rows = session.exec(query.offset(offset).limit(per_page)).all()

    turma_ids_page = list({a.IdTurma for a in rows if a.IdTurma})
    turma_map = {}
    if turma_ids_page:
        turma_rows = session.exec(
            select(Turma.IdTurma, Turma.NomeTurma).where(Turma.IdTurma.in_(turma_ids_page))
        ).all()
        turma_map = {r[0]: r[1] for r in turma_rows if r and r[0]}

    items = [serialize_aula(a, turma_map.get(a.IdTurma)) for a in rows]

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/{id_aula}")
def obter_aula(
    id_aula: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Detalhe da aula com chamadas relacionadas."""
    ensure_admin(usuario_logado)

    aula = session.get(Aula, id_aula)
    if not aula:
        raise HTTPException(status_code=404, detail="Aula não encontrada")

    turma = session.get(Turma, aula.IdTurma) if aula.IdTurma else None
    item = serialize_aula(aula, turma.NomeTurma if turma else None)

    chamadas = session.exec(
        select(Chamada).where(Chamada.Aula == id_aula).order_by(Chamada.Data.desc())
    ).all()

    # Resolve nomes de alunos
    from shared.models import Aluno
    aluno_ids = list({c.IdAluno for c in chamadas if c.IdAluno})
    aluno_map = {}
    if aluno_ids:
        aluno_rows = session.exec(
            select(Aluno.IdAluno, Aluno.NomeAluno).where(Aluno.IdAluno.in_(aluno_ids))
        ).all()
        aluno_map = {r[0]: r[1] for r in aluno_rows if r and r[0]}

    item["chamadas"] = [
        {
            "IdChamada": c.IdChamada,
            "Data": c.Data,
            "IdAluno": c.IdAluno,
            "NomeAluno": aluno_map.get(c.IdAluno, c.IdAluno),
            "Presenca": c.Presenca,
            "IdMatricula": c.IdMatricula,
        }
        for c in chamadas
    ]

    return {"item": item}


@router.post("/", status_code=status.HTTP_201_CREATED)
def cadastrar_aula(
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    nome = str(payload.get("NomeAula") or "").strip()
    if not nome:
        raise HTTPException(status_code=400, detail="NomeAula é obrigatório")

    aula = Aula(
        IdAula=str(payload.get("IdAula") or str(uuid4())).strip(),
        NomeAula=nome,
        HoraInicio=payload.get("HoraInicio"),
        HoraFim=payload.get("HoraFim"),
        IdTurma=str(payload.get("IdTurma") or "").strip() or None,
        NumeroDeAulas=payload.get("NumeroDeAulas"),
        IntervaloEntreAulas=payload.get("IntervaloEntreAulas"),
        LimitAulas=payload.get("LimitAulas"),
        StatusChamada=payload.get("StatusChamada"),
    )
    # Campos opcionais que podem não aceitar NULL no banco
    if hasattr(aula, 'DescricaoAula'):
        aula.DescricaoAula = str(payload.get("DescricaoAula") or "").strip() or None
    session.add(aula)
    session.commit()
    session.refresh(aula)
    return serialize_aula(aula)


@router.put("/{id_aula}")
def atualizar_aula(
    id_aula: str,
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    aula = session.get(Aula, id_aula)
    if not aula:
        raise HTTPException(status_code=404, detail="Aula não encontrada")

    for field in ["NomeAula", "HoraInicio", "HoraFim", "IdTurma",
                  "NumeroDeAulas", "IntervaloEntreAulas", "LimitAulas",
                  "StatusChamada"]:
        if field in payload:
            value = payload[field]
            if field == "IdTurma":
                value = str(value or "").strip() or None
            setattr(aula, field, value)

    session.add(aula)
    session.commit()
    session.refresh(aula)
    return serialize_aula(aula)


@router.delete("/{id_aula}")
def remover_aula(
    id_aula: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    aula = session.get(Aula, id_aula)
    if not aula:
        raise HTTPException(status_code=404, detail="Aula não encontrada")

    session.delete(aula)
    session.commit()
    return {"message": "Aula removida"}


@router.get("/health")
def health():
    return {"status": "ok"}
