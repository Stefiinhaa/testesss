from datetime import date, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, cast, func, or_, String
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .common_utils import ensure_admin, parse_values
from .delete_utils import DeleteBlockedError, delete_or_soft_delete, get_delete_capability
from shared.auth_utils import get_current_user
from shared.database import get_session
from shared.models import Aluno, Chamada, Curso, Matricula, StatusMatriculaEnum, Turma

router = APIRouter(prefix="/cursos", tags=["Cursos"])


def display_status_matricula(value: str | StatusMatriculaEnum | None) -> str:
    normalized = normalize_status_matricula(value)
    labels = {
        StatusMatriculaEnum.ativo: 'Ativo',
        StatusMatriculaEnum.trancado: 'Trancado',
        StatusMatriculaEnum.concluido: 'Concluído',
        StatusMatriculaEnum.cancelado: 'Cancelado',
    }
    return labels.get(normalized, 'Ativo')


def normalize_status_matricula(value: str | StatusMatriculaEnum | None) -> StatusMatriculaEnum:
    if isinstance(value, StatusMatriculaEnum):
        return value

    normalized = str(value or '').strip()
    if not normalized:
        return StatusMatriculaEnum.ativo
    lowered = normalized.lower()
    if lowered in {'concluido', 'concluído'}:
        return StatusMatriculaEnum.concluido
    if lowered == 'trancado':
        return StatusMatriculaEnum.trancado
    if lowered == 'cancelado':
        return StatusMatriculaEnum.cancelado
    if lowered == 'ativo':
        return StatusMatriculaEnum.ativo

    for candidate in StatusMatriculaEnum:
        if lowered == candidate.value.lower() or lowered == candidate.name.lower():
            return candidate

    return StatusMatriculaEnum.ativo


def serialize_curso(curso: Curso) -> dict[str, object]:
    return {
        "IdCurso": curso.IdCurso,
        "NomeCurso": curso.NomeCurso,
        "DescricaoCurso": curso.DescricaoCurso,
        "ativo": curso.DeletedAt is None
    }


def serialize_matricula(
    matricula: Matricula,
    aluno_nome: str | None = None,
    curso_nome: str | None = None,
    turma_nome: str | None = None,
    related_chamadas: int = 0,
) -> dict[str, object]:
    return {
        "IdMatricula": matricula.IdMatricula,
        "IdAluno": matricula.IdAluno,
        "IdCurso": matricula.IdCurso,
        "IdTurma": matricula.IdTurma,
        "DataMatricula": matricula.DataMatricula,
        "DataConclusao": matricula.DataConclusao,
        "StatusMatricula": display_status_matricula(getattr(matricula.StatusMatricula, "value", matricula.StatusMatricula)),
        "DataAtualizacao": matricula.DataAtualizacao,
        "NomeAluno": aluno_nome,
        "NomeCurso": curso_nome,
        "NomeTurma": turma_nome,
        "RelatedChamadas": int(related_chamadas or 0),
        "ativo": getattr(matricula, "DeletedAt", None) is None,
    }


def serialize_matricula_response(matricula: Matricula) -> dict[str, object]:
    return serialize_matricula(matricula)


def parse_optional_date(raw_value):
    if raw_value in (None, ""):
        return None
    if isinstance(raw_value, date):
        return raw_value
    return date.fromisoformat(str(raw_value))


def parse_query_date(raw_value: str | None, field_name: str) -> date | None:
    if raw_value is None:
        return None
    normalized = str(raw_value).strip()
    if not normalized:
        return None
    try:
        return date.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} deve estar no formato YYYY-MM-DD",
        ) from exc


def normalize_legacy_fk_id(value: str | None) -> str:
    normalized = str(value or '').strip()
    if not normalized:
        return ''
    return normalized


def resolve_existing_fk_id(session: Session, model, value: str | None) -> str:
    raw_value = str(value or '').strip()
    if not raw_value:
        return ''
    if session.get(model, raw_value):
        return raw_value
    legacy_value = normalize_legacy_fk_id(raw_value)
    if legacy_value != raw_value and session.get(model, legacy_value):
        return legacy_value
    return raw_value


@router.get("/")
def listar_cursos(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=5000),
    skip: int | None = Query(None, ge=0),
    limit: int | None = Query(None, ge=1, le=500),
    q: str | None = None,
    nome_in: str | None = Query(None),
    descricao_in: str | None = Query(None),
    ativo_in: str | None = None,
    nome: str | None = Query(None),
    sort_by: str | None = Query("nome"),
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
    if q:
        conditions.append(or_(Curso.NomeCurso.contains(q), Curso.DescricaoCurso.contains(q)))

    nome_values = parse_values(nome_in or nome)
    if nome_values:
        conditions.append(Curso.NomeCurso.in_(nome_values))

    descricao_values = parse_values(descricao_in)
    if descricao_values:
        conditions.append(Curso.DescricaoCurso.in_(descricao_values))

    ativo_values = [str(value).strip().lower() for value in parse_values(ativo_in) if str(value).strip()]
    if ativo_values:
        wants_active = any(value in {'ativo', 'ativa', 'sim', 'true', '1'} for value in ativo_values)
        wants_inactive = any(value in {'inativo', 'inativa', 'nao', 'não', 'false', '0'} for value in ativo_values)
        if wants_active and not wants_inactive:
            conditions.append(Curso.DeletedAt.is_(None))
        elif wants_inactive and not wants_active:
            conditions.append(Curso.DeletedAt.is_not(None))
    else:
        if not include_inativos:
            conditions.append(Curso.DeletedAt.is_(None))

    where_clause = and_(*conditions) if conditions else None

    count_query = select(func.count()).select_from(Curso)
    if where_clause is not None:
        count_query = count_query.where(where_clause)
    total_row = session.exec(count_query).first()
    total = int(total_row[0] if isinstance(total_row, (tuple, list)) else (total_row or 0))

    sort_key = str(sort_by or order_by or "nome").strip().lower()
    direction = "desc" if desc is True else str(sort_dir or "asc").strip().lower()
    sort_field_map = {
        "id": Curso.IdCurso,
        "id_curso": Curso.IdCurso,
        "idcurso": Curso.IdCurso,
        "nome": Curso.NomeCurso,
        "nomecurso": Curso.NomeCurso,
        "descricao": Curso.DescricaoCurso,
        "descricaocurso": Curso.DescricaoCurso,
    }
    order_column = sort_field_map.get(sort_key, Curso.NomeCurso)
    order_clause = order_column.desc() if direction == "desc" else order_column.asc()

    offset = (page - 1) * per_page
    query = select(Curso)
    if where_clause is not None:
        query = query.where(where_clause)
    rows = session.exec(query.order_by(order_clause).offset(offset).limit(per_page)).all()

    return {
        "items": [serialize_curso(curso) for curso in rows],
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

    query = select(Curso.NomeCurso).where(Curso.NomeCurso.is_not(None))
    descricao_query = select(Curso.DescricaoCurso).where(Curso.DescricaoCurso.is_not(None))
    if not include_inativos:
        query = query.where(Curso.DeletedAt.is_(None))
        descricao_query = descricao_query.where(Curso.DeletedAt.is_(None))

    nome_rows = session.exec(query.distinct().order_by(Curso.NomeCurso.asc())).all()
    descricao_rows = session.exec(descricao_query.distinct().order_by(Curso.DescricaoCurso.asc())).all()
    return {
        "options": {
            "nome": [str(value).strip() for value in nome_rows if value and str(value).strip()],
            "descricao": [str(value).strip() for value in descricao_rows if value and str(value).strip()],
        }
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def cadastrar_curso(
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    nome = str(payload.get("NomeCurso") or "").strip()
    if not nome:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NomeCurso é obrigatório")

    curso = Curso(
        IdCurso=str(payload.get("IdCurso") or str(uuid4())).strip(),
        NomeCurso=nome,
        DescricaoCurso=(payload.get("DescricaoCurso") or None),
    )
    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        curso.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()
    session.add(curso)
    session.commit()
    session.refresh(curso)
    return curso


# ==========================================
# ROTAS DE MATRÍCULAS
# ==========================================

@router.get("/matriculas")
def listar_matriculas(
    curso_id: str | None = Query(None),
    q: str | None = None,
    data_matricula_start: str | None = Query(None),
    data_matricula_end: str | None = Query(None),
    ativo_in: str | None = Query(None),
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
    include_inativos: bool = False,
):
    ensure_admin(usuario_logado)

    statement = select(Matricula)
    if curso_id:
        statement = statement.where(Matricula.IdCurso == curso_id)

    start_date = parse_query_date(data_matricula_start, 'data_matricula_start')
    end_date = parse_query_date(data_matricula_end, 'data_matricula_end')
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='data_matricula_start nao pode ser maior que data_matricula_end',
        )
    if start_date:
        statement = statement.where(Matricula.DataMatricula >= start_date)
    if end_date:
        statement = statement.where(Matricula.DataMatricula <= end_date)

    if hasattr(Matricula, 'DeletedAt'):
        if ativo_in:
            ativo_values = [str(v).strip().lower() for v in parse_values(ativo_in) if str(v).strip()]
            if ativo_values:
                wants_active = any(v in {'ativo', 'sim', 'true', '1'} for v in ativo_values)
                wants_inactive = any(v in {'inativo', 'nao', 'não', 'false', '0'} for v in ativo_values)
                if wants_active and not wants_inactive:
                    statement = statement.where(Matricula.DeletedAt.is_(None))
                elif wants_inactive and not wants_active:
                    statement = statement.where(Matricula.DeletedAt.is_not(None))
        else:
            if not include_inativos:
                statement = statement.where(Matricula.DeletedAt.is_(None))

    matriculas = session.exec(statement.order_by(Matricula.DataMatricula.desc(), Matricula.DataAtualizacao.desc())).all()
    if not matriculas:
        return {"items": []}

    aluno_ids = list(dict.fromkeys([matricula.IdAluno for matricula in matriculas if matricula.IdAluno]))
    curso_ids = list(dict.fromkeys([matricula.IdCurso for matricula in matriculas if matricula.IdCurso]))
    turma_ids = list(dict.fromkeys([matricula.IdTurma for matricula in matriculas if matricula.IdTurma]))

    alunos = session.exec(select(Aluno.IdAluno, Aluno.NomeAluno).where(Aluno.IdAluno.in_(aluno_ids))).all() if aluno_ids else []
    cursos = session.exec(select(Curso.IdCurso, Curso.NomeCurso).where(Curso.IdCurso.in_(curso_ids))).all() if curso_ids else []
    turmas = session.exec(select(Turma.IdTurma, Turma.NomeTurma).where(Turma.IdTurma.in_(turma_ids))).all() if turma_ids else []
    chamada_counts = session.exec(
        select(Chamada.IdMatricula, func.count())
        .where(Chamada.IdMatricula.in_([matricula.IdMatricula for matricula in matriculas]))
        .group_by(Chamada.IdMatricula)
    ).all() if matriculas else []

    aluno_map = {row[0]: row[1] for row in alunos if row and row[0]}
    curso_map = {row[0]: row[1] for row in cursos if row and row[0]}
    turma_map = {row[0]: row[1] for row in turmas if row and row[0]}
    chamada_count_map = {row[0]: int(row[1] or 0) for row in chamada_counts if row and row[0]}

    items = [
        serialize_matricula(
            matricula,
            aluno_map.get(matricula.IdAluno),
            curso_map.get(matricula.IdCurso),
            turma_map.get(matricula.IdTurma),
            chamada_count_map.get(matricula.IdMatricula, 0),
        )
        for matricula in matriculas
    ]
    if q:
        needle = str(q).strip().lower()
        items = [
            item for item in items
            if needle in str(item.get("NomeAluno") or "").lower()
            or needle in str(item.get("NomeCurso") or "").lower()
            or needle in str(item.get("NomeTurma") or "").lower()
            or needle in str(item.get("StatusMatricula") or "").lower()
        ]
    return {"items": items}


@router.get("/matriculas/options")
def listar_opcoes_matriculas(
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)
    alunos = session.exec(select(Aluno.IdAluno, Aluno.NomeAluno).where(Aluno.DeletedAt.is_(None)).order_by(Aluno.NomeAluno.asc())).all()
    cursos = session.exec(select(Curso.IdCurso, Curso.NomeCurso).where(Curso.DeletedAt.is_(None)).order_by(Curso.NomeCurso.asc())).all()
    turmas = session.exec(select(Turma.IdTurma, Turma.NomeTurma).where(Turma.DeletedAt.is_(None)).order_by(Turma.NomeTurma.asc())).all()
    return {
        "alunos": [{"id": row[0], "nome": row[1]} for row in alunos if row and row[0]],
        "cursos": [{"id": row[0], "nome": row[1]} for row in cursos if row and row[0]],
        "turmas": [{"id": row[0], "nome": row[1]} for row in turmas if row and row[0]],
        "status": ["Ativo", "Trancado", "Concluído", "Cancelado"],
    }


@router.post("/matriculas", status_code=status.HTTP_201_CREATED)
def cadastrar_matricula(
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    id_aluno = resolve_existing_fk_id(session, Aluno, payload.get("IdAluno"))
    id_curso = resolve_existing_fk_id(session, Curso, payload.get("IdCurso"))
    id_turma = resolve_existing_fk_id(session, Turma, payload.get("IdTurma"))
    data_matricula = parse_optional_date(payload.get("DataMatricula"))
    if not id_aluno or not id_curso or not id_turma or not data_matricula:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IdAluno, IdCurso, IdTurma e DataMatricula são obrigatórios")

    matricula = Matricula(
        IdMatricula=str(payload.get("IdMatricula") or str(uuid4())).strip(),
        IdAluno=id_aluno,
        IdCurso=id_curso,
        IdTurma=id_turma,
        DataMatricula=data_matricula,
        DataConclusao=parse_optional_date(payload.get("DataConclusao")),
        StatusMatricula=normalize_status_matricula(payload.get("StatusMatricula")),
        DataAtualizacao=datetime.utcnow(),
    )
    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        matricula.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()

    response_payload = serialize_matricula_response(matricula)
    session.add(matricula)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Nao foi possivel criar a matricula com os dados informados',
        ) from exc
    return response_payload


@router.get("/matriculas/{id_matricula}/delete-capability")
def obter_delete_capability_matricula(
    id_matricula: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    matricula = session.get(Matricula, id_matricula)
    if not matricula:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matrícula não encontrada")

    return get_delete_capability(session, matricula)


@router.put("/matriculas/{id_matricula}")
def atualizar_matricula(
    id_matricula: str,
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    matricula = session.get(Matricula, id_matricula)
    if not matricula:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matrícula não encontrada")

    if "IdAluno" in payload and payload.get("IdAluno"):
        matricula.IdAluno = resolve_existing_fk_id(session, Aluno, payload.get("IdAluno"))
    if "IdCurso" in payload and payload.get("IdCurso"):
        matricula.IdCurso = resolve_existing_fk_id(session, Curso, payload.get("IdCurso"))
    if "IdTurma" in payload and payload.get("IdTurma"):
        matricula.IdTurma = resolve_existing_fk_id(session, Turma, payload.get("IdTurma"))
    if "DataMatricula" in payload:
        parsed = parse_optional_date(payload.get("DataMatricula"))
        if parsed is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="DataMatricula é obrigatória")
        matricula.DataMatricula = parsed
    if "DataConclusao" in payload:
        matricula.DataConclusao = parse_optional_date(payload.get("DataConclusao"))
    if "StatusMatricula" in payload and payload.get("StatusMatricula"):
        matricula.StatusMatricula = normalize_status_matricula(payload.get("StatusMatricula"))

    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        matricula.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()

    matricula.DataAtualizacao = datetime.utcnow()
    response_payload = serialize_matricula_response(matricula)
    session.add(matricula)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Nao foi possivel atualizar a matricula com os dados informados',
        ) from exc
    return response_payload


@router.delete("/matriculas/{id_matricula}")
def remover_matricula(
    id_matricula: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    matricula = session.get(Matricula, id_matricula)
    if not matricula:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matrícula não encontrada")

    if getattr(matricula, "DeletedAt", None) is not None:
        return {"message": "Matrícula já está inativa"}

    try:
        # REGRA: Forçando o Soft Delete para que não suma do histórico de inativos!
        matricula.DeletedAt = datetime.utcnow()
        session.add(matricula)
        session.commit()
        return {"message": "Matrícula inativada com sucesso"}
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao inativar matrícula") from exc


# ==========================================
# ROTAS DE CURSO
# ==========================================

@router.get("/{id_curso}/delete-capability")
def obter_delete_capability_curso(
    id_curso: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    curso = session.get(Curso, id_curso)
    if not curso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curso não encontrado")

    return get_delete_capability(session, curso)


@router.put("/{id_curso}")
def atualizar_curso(
    id_curso: str,
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    curso = session.get(Curso, id_curso)
    if not curso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curso não encontrado")

    if "NomeCurso" in payload and payload.get("NomeCurso"):
        curso.NomeCurso = str(payload.get("NomeCurso")).strip()
    if "DescricaoCurso" in payload:
        curso.DescricaoCurso = payload.get("DescricaoCurso") or None

    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        curso.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()
    session.add(curso)
    session.commit()
    session.refresh(curso)
    return curso


@router.delete("/{id_curso}")
def remover_curso(
    id_curso: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    curso = session.get(Curso, id_curso)
    if not curso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curso não encontrado")

    if getattr(curso, "DeletedAt", None) is not None:
        return {"message": "Curso já está inativo"}

    try:
        # REGRA: Forçando o Soft Delete para que não suma do histórico de inativos!
        curso.DeletedAt = datetime.utcnow()
        session.add(curso)
        session.commit()
        return {"message": "Curso inativado com sucesso"}
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao inativar curso") from exc
