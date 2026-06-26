from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, and_, cast, func, or_
from sqlmodel import Session, select

from .common_utils import ensure_admin, parse_values
from .delete_utils import DeleteBlockedError, delete_or_soft_delete, get_delete_capability
from shared.auth_utils import get_current_user
from shared.database import get_session
from shared.models import Aluno, Avaliacao, Curso, Matricula, Turma

router = APIRouter(prefix="/avaliacoes", tags=["Avaliações"])


def parse_nota_values(raw: str | None) -> list[float]:
    values = []
    for value in parse_values(raw):
        normalized = value.replace(',', '.').strip()
        if not normalized:
            continue
        try:
            values.append(float(normalized))
        except ValueError:
            continue
    return values


def serialize_avaliacao(
    avaliacao: Avaliacao,
    alunos_map: dict[str, Aluno] | None = None,
    cursos_map: dict[str, Curso] | None = None,
    matriculas_map: dict[tuple[str, str], dict[str, object]] | None = None,
) -> dict[str, object]:
    aluno = (alunos_map or {}).get(avaliacao.IdAluno)
    curso = (cursos_map or {}).get(avaliacao.IdCurso)
    matricula = (matriculas_map or {}).get((avaliacao.IdAluno, avaliacao.IdCurso))

    # REGRA DE NEGÓCIO: É inativo se a própria avaliação foi deletada OU se o aluno dono foi deletado.
    aluno_deletado = getattr(aluno, 'DeletedAt', None)
    is_ativo = avaliacao.DeletedAt is None and (aluno_deletado is None if aluno is not None else True)

    return {
        "IdAvaliacao": avaliacao.IdAvaliacao,
        "IdAluno": avaliacao.IdAluno,
        "NomeAluno": aluno.NomeAluno if aluno else None,
        "Nota": avaliacao.Nota,
        "Status": avaliacao.Status,
        "OBS": avaliacao.OBS,
        "IdCurso": avaliacao.IdCurso,
        "NomeCurso": curso.NomeCurso if curso else None,
        "DataIngresso": matricula.get("DataMatricula") if matricula else None,
        "DataConclusao": matricula.get("DataConclusao") if matricula else None,
        "ativo": is_ativo
    }


@router.get("/")
def listar_avaliacoes(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=5000),
    skip: int | None = Query(None, ge=0),
    limit: int | None = Query(None, ge=1, le=500),
    q: str | None = None,
    nota_in: str | None = None,
    status_in: str | None = None,
    obs_in: str | None = None,
    id_aluno: str | None = None,
    id_curso: str | None = None,
    turma_in: str | None = None,
    data_ingresso_in: str | None = None,
    data_conclusao_in: str | None = None,
    sort_by: str | None = Query("nota"),
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
        conditions.append(Avaliacao.DeletedAt.is_(None))
        # REGRA DE NEGÓCIO: Filtra avaliações onde o Aluno também está ativo
        conditions.append(
            Avaliacao.IdAluno.in_(
                select(Aluno.IdAluno).where(Aluno.DeletedAt.is_(None))
            )
        )

    if q:
        q_text = str(q)
        conditions.append(
            or_(
                Avaliacao.OBS.contains(q_text),
                Avaliacao.IdAluno.contains(q_text),
                Avaliacao.IdCurso.contains(q_text),
            )
        )

    nota_raw_values = [value.replace(',', '.').strip() for value in parse_values(nota_in) if value and value.strip()]
    nota_values = parse_nota_values(nota_in)
    nota_conditions = []
    if nota_values:
        nota_conditions.append(Avaliacao.Nota.in_(nota_values))
    if nota_raw_values:
        nota_conditions.append(cast(Avaliacao.Nota, String).in_(nota_raw_values))
    if nota_conditions:
        conditions.append(or_(*nota_conditions))

    status_values = parse_values(status_in)
    if status_values:
        conditions.append(Avaliacao.Status.in_(status_values))

    obs_values = parse_values(obs_in)
    if obs_values:
        conditions.append(Avaliacao.OBS.in_(obs_values))

    if id_aluno:
        aluno_values = parse_values(id_aluno)
        matching_ids = set(aluno_values)
        if aluno_values:
            matching_ids.update(session.exec(select(Aluno.IdAluno).where(Aluno.NomeAluno.in_(aluno_values))).all())
        conditions.append(Avaliacao.IdAluno.in_(list(matching_ids or [''])))
    if id_curso:
        curso_values = parse_values(id_curso)
        matching_ids = set(curso_values)
        if curso_values:
            matching_ids.update(session.exec(select(Curso.IdCurso).where(Curso.NomeCurso.in_(curso_values))).all())
        conditions.append(Avaliacao.IdCurso.in_(list(matching_ids or [''])))

    matricula_filters = []
    turma_values = parse_values(turma_in)
    if turma_values:
        turma_ids = session.exec(select(Turma.IdTurma).where(Turma.NomeTurma.in_(turma_values))).all()
        turma_ids = [value for value in turma_ids if value]
        if turma_ids:
            matricula_filters.append(Matricula.IdTurma.in_(turma_ids))
        else:
            conditions.append(Avaliacao.IdAvaliacao == '__NO_MATCH__')

    data_ingresso_values = parse_values(data_ingresso_in)
    if data_ingresso_values:
        matricula_filters.append(cast(Matricula.DataMatricula, String).in_(data_ingresso_values))

    data_conclusao_values = parse_values(data_conclusao_in)
    if data_conclusao_values:
        matricula_filters.append(cast(Matricula.DataConclusao, String).in_(data_conclusao_values))
    if matricula_filters:
        matching_pairs = session.exec(
            select(Matricula.IdAluno, Matricula.IdCurso)
            .where(and_(*matricula_filters))
        ).all()
        pair_clauses = [and_(Avaliacao.IdAluno == aluno_id, Avaliacao.IdCurso == curso_id) for aluno_id, curso_id in matching_pairs if aluno_id and curso_id]
        if pair_clauses:
            conditions.append(or_(*pair_clauses))
        else:
            conditions.append(Avaliacao.IdAvaliacao == '__NO_MATCH__')

    where_clause = and_(*conditions) if conditions else None
    count_query = select(func.count()).select_from(Avaliacao)
    if where_clause is not None:
        count_query = count_query.where(where_clause)
    total_row = session.exec(count_query).first()
    total = int(total_row[0] if isinstance(total_row, (tuple, list)) else (total_row or 0))

    sort_key = str(sort_by or order_by or "nota").strip().lower()
    direction = "desc" if desc is True else str(sort_dir or "asc").strip().lower()
    sort_field_map = {
        "id": Avaliacao.IdAvaliacao,
        "id_avaliacao": Avaliacao.IdAvaliacao,
        "idavaliacao": Avaliacao.IdAvaliacao,
        "nota": Avaliacao.Nota,
        "obs": Avaliacao.OBS,
        "id_aluno": Avaliacao.IdAluno,
        "id_curso": Avaliacao.IdCurso,
    }
    order_column = sort_field_map.get(sort_key, Avaliacao.Nota)
    order_clause = order_column.desc() if direction == "desc" else order_column.asc()

    offset = (page - 1) * per_page
    query = select(Avaliacao)
    if where_clause is not None:
        query = query.where(where_clause)
    rows = session.exec(query.order_by(order_clause).offset(offset).limit(per_page)).all()

    aluno_ids = {row.IdAluno for row in rows if row.IdAluno}
    curso_ids = {row.IdCurso for row in rows if row.IdCurso}
    alunos_map = {
        item.IdAluno: item
        for item in session.exec(select(Aluno).where(Aluno.IdAluno.in_(aluno_ids))).all()
    } if aluno_ids else {}
    cursos_map = {
        item.IdCurso: item
        for item in session.exec(select(Curso).where(Curso.IdCurso.in_(curso_ids))).all()
    } if curso_ids else {}
    matriculas_map = {}
    if aluno_ids and curso_ids:
        matricula_rows = session.exec(
            select(
                Matricula.IdAluno,
                Matricula.IdCurso,
                Matricula.DataMatricula,
                Matricula.DataConclusao,
            )
            .where(Matricula.IdAluno.in_(aluno_ids))
            .where(Matricula.IdCurso.in_(curso_ids))
            .order_by(Matricula.DataMatricula.desc(), Matricula.DataAtualizacao.desc())
        ).all()
        for row in matricula_rows:
            key = (row[0], row[1])
            if key not in matriculas_map:
                matriculas_map[key] = {
                    "DataMatricula": row[2],
                    "DataConclusao": row[3],
                }

    return {
        "items": [serialize_avaliacao(avaliacao, alunos_map, cursos_map, matriculas_map) for avaliacao in rows],
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
        base_conditions.append(Avaliacao.DeletedAt.is_(None))
        # REGRA DE NEGÓCIO: Filtra opções onde o Aluno também está ativo
        base_conditions.append(
            Avaliacao.IdAluno.in_(
                select(Aluno.IdAluno).where(Aluno.DeletedAt.is_(None))
            )
        )

    status_query = select(Avaliacao.Status).where(Avaliacao.Status.is_not(None))
    obs_query = select(Avaliacao.OBS).where(Avaliacao.OBS.is_not(None))
    nota_query = select(Avaliacao.Nota).where(Avaliacao.Nota.is_not(None))
    if base_conditions:
        status_query = status_query.where(*base_conditions)
        obs_query = obs_query.where(*base_conditions)
        nota_query = nota_query.where(*base_conditions)

    status_rows = session.exec(status_query.distinct().order_by(Avaliacao.Status.asc())).all()
    obs_rows = session.exec(obs_query.distinct().order_by(Avaliacao.OBS.asc())).all()
    nota_rows = session.exec(nota_query.distinct().order_by(Avaliacao.Nota.asc())).all()
    return {
        "options": {
            "nota": [str(value) for value in nota_rows if value is not None],
            "status": [str(value).strip() for value in status_rows if value and str(value).strip()],
            "obs": [str(value).strip() for value in obs_rows if value and str(value).strip()],
            "turma": [str(value).strip() for value in session.exec(
                select(Turma.NomeTurma)
                .join(Matricula, Matricula.IdTurma == Turma.IdTurma)
                .where(Turma.NomeTurma.is_not(None))
                .where(*base_conditions)
                .distinct()
                .order_by(Turma.NomeTurma.asc())
            ).all() if value and str(value).strip()],
            "data_ingresso": [str(value) for value in session.exec(
                select(Matricula.DataMatricula)
                .where(Matricula.DataMatricula.is_not(None))
                .where(*base_conditions)
                .distinct()
                .order_by(Matricula.DataMatricula.asc())
            ).all() if value is not None],
            "data_conclusao": [str(value) for value in session.exec(
                select(Matricula.DataConclusao)
                .where(Matricula.DataConclusao.is_not(None))
                .where(*base_conditions)
                .distinct()
                .order_by(Matricula.DataConclusao.asc())
            ).all() if value is not None],
        }
    }


@router.get("/form-options")
def listar_opcoes_formulario(
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    alunos = session.exec(
        select(Aluno.IdAluno, Aluno.NomeAluno)
        .where(Aluno.DeletedAt.is_(None))
        .order_by(Aluno.NomeAluno.asc())
    ).all()
    cursos = session.exec(
        select(Curso.IdCurso, Curso.NomeCurso)
        .where(Curso.DeletedAt.is_(None))
        .order_by(Curso.NomeCurso.asc())
    ).all()
    status_rows = session.exec(
        select(Avaliacao.Status)
        .where(Avaliacao.Status.is_not(None))
        .where(Avaliacao.DeletedAt.is_(None))
        .distinct()
        .order_by(Avaliacao.Status.asc())
    ).all()
    return {
        "alunos": [{"id": row[0], "nome": row[1]} for row in alunos if row and row[0] and row[1]],
        "cursos": [{"id": row[0], "nome": row[1]} for row in cursos if row and row[0] and row[1]],
        "status": [str(value).strip() for value in status_rows if value and str(value).strip()],
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def cadastrar_avaliacao(
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    if not payload.get("IdAluno"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IdAluno é obrigatório")
    if not payload.get("IdCurso"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IdCurso é obrigatório")

    avaliacao = Avaliacao(
        IdAvaliacao=str(payload.get("IdAvaliacao") or str(uuid4())).strip(),
        IdAluno=payload.get("IdAluno"),
        Nota=payload.get("Nota") or None,
        Status=payload.get("Status") or None,
        OBS=payload.get("OBS") or None,
        IdCurso=payload.get("IdCurso"),
    )
    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        avaliacao.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()
    session.add(avaliacao)
    session.commit()
    session.refresh(avaliacao)
    return serialize_avaliacao(avaliacao)


@router.put("/{id_avaliacao}")
def atualizar_avaliacao(
    id_avaliacao: str,
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    avaliacao = session.get(Avaliacao, id_avaliacao)
    if not avaliacao:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avaliação não encontrada")

    for field in ["IdAluno", "Nota", "Status", "OBS", "IdCurso"]:
        if field in payload:
            setattr(avaliacao, field, payload.get(field) or None)

    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        avaliacao.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()
    session.add(avaliacao)
    session.commit()
    session.refresh(avaliacao)
    return serialize_avaliacao(avaliacao)


@router.get("/{id_avaliacao}/delete-capability")
def obter_delete_capability_avaliacao(
    id_avaliacao: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    avaliacao = session.get(Avaliacao, id_avaliacao)
    if not avaliacao:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avaliação não encontrada")

    return get_delete_capability(session, avaliacao)


@router.delete("/{id_avaliacao}")
def remover_avaliacao(
    id_avaliacao: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    avaliacao = session.get(Avaliacao, id_avaliacao)
    if not avaliacao:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avaliação não encontrada")

    try:
        outcome = delete_or_soft_delete(session, avaliacao)
    except DeleteBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if outcome == "already_inactive":
        return {"message": "Avaliação já está inativa"}
    if outcome == "hard_deleted":
        return {"message": "Avaliação removida"}
    return {"message": "Avaliação inativada"}
