from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, and_, case, cast, func, or_
from sqlmodel import Session, select

from .common_utils import ensure_admin, normalize_matricula_status_read, parse_values
from .delete_utils import DeleteBlockedError, delete_or_soft_delete, get_delete_capability
from shared.auth_utils import get_current_user
from shared.database import get_session
from shared.models import Aluno, Aula, Chamada, Curso, Matricula, Turma

router = APIRouter(prefix="/chamadas", tags=["Chamadas"])


def normalize_legacy_fk_id(value: str | None) -> str | None:
    normalized = str(value or '').strip()
    if not normalized:
        return None
    return normalized


def resolve_existing_fk_id(session: Session, model, value: str | None) -> str | None:
    normalized = str(value or '').strip()
    if not normalized:
        return None
    if session.get(model, normalized):
        return normalized
    legacy_value = normalize_legacy_fk_id(normalized)
    if legacy_value and legacy_value != normalized and session.get(model, legacy_value):
        return legacy_value
    return normalized


def serialize_chamada(
    chamada: Chamada,
    alunos_map: dict[str, Aluno] | None = None,
    aulas_map: dict[str, Aula] | None = None,
    matricula_resumo_map: dict[str, str] | None = None,
) -> dict[str, object]:
    aluno = (alunos_map or {}).get(chamada.IdAluno)
    aula = (aulas_map or {}).get(chamada.Aula)
    return {
        "IdChamada": chamada.IdChamada,
        "Data": chamada.Data,
        "IdAluno": chamada.IdAluno,
        "NomeAluno": aluno.NomeAluno if aluno else None,
        "Aula": chamada.Aula,
        "NomeAula": aula.NomeAula if aula else None,
        "Presenca": chamada.Presenca,
        "IdMatricula": chamada.IdMatricula,
        "ResumoMatricula": (matricula_resumo_map or {}).get(chamada.IdMatricula) or chamada.IdMatricula,
        "ativo": chamada.DeletedAt is None
    }


@router.get("/")
def listar_chamadas(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=5000),
    skip: int | None = Query(None, ge=0),
    limit: int | None = Query(None, ge=1, le=500),
    q: str | None = None,
    data_in: str | None = None,
    presenca_in: str | None = None,
    presenca: str | None = None,
    id_aluno: str | None = None,
    aula_in: str | None = None,
    id_matricula: str | None = None,
    sort_by: str | None = Query("data"),
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
        conditions.append(Chamada.DeletedAt.is_(None))
    if q:
        q_text = str(q)
        conditions.append(or_(Chamada.Presenca.contains(q_text), Chamada.IdAluno.contains(q_text), Chamada.Aula.contains(q_text)))

    presenca_values = parse_values(presenca_in or presenca)
    if presenca_values:
        conditions.append(Chamada.Presenca.in_(presenca_values))

    data_values = parse_values(data_in)
    if data_values:
        conditions.append(Chamada.Data.in_(data_values))

    if id_aluno:
        aluno_values = parse_values(id_aluno)
        matching_ids = set(aluno_values)
        if aluno_values:
            matching_ids.update(session.exec(select(Aluno.IdAluno).where(Aluno.NomeAluno.in_(aluno_values))).all())
        conditions.append(Chamada.IdAluno.in_(list(matching_ids or [''])))
    aula_values = parse_values(aula_in)
    if aula_values:
        matching_aula_ids = set(aula_values)
        if aula_values:
            matching_aula_ids.update(session.exec(select(Aula.IdAula).where(Aula.NomeAula.in_(aula_values))).all())
        conditions.append(Chamada.Aula.in_(list(matching_aula_ids or [''])))
    if id_matricula:
        matricula_values = parse_values(id_matricula)
        matching_matricula_ids = set(matricula_values)
        if matricula_values:
            matching_matricula_ids.update(
                session.exec(
                    select(Matricula.IdMatricula)
                    .join(Aluno, Aluno.IdAluno == Matricula.IdAluno)
                    .where(Aluno.NomeAluno.in_(matricula_values))
                ).all()
            )
        conditions.append(Chamada.IdMatricula.in_(list(matching_matricula_ids or [''])))

    where_clause = and_(*conditions) if conditions else None
    count_query = select(func.count()).select_from(Chamada)
    if where_clause is not None:
        count_query = count_query.where(where_clause)
    total_row = session.exec(count_query).first()
    total = int(total_row[0] if isinstance(total_row, (tuple, list)) else (total_row or 0))

    sort_key = str(sort_by or order_by or "data").strip().lower()
    direction = "desc" if desc is True else str(sort_dir or "asc").strip().lower()
    sort_field_map = {
        "id": Chamada.IdChamada,
        "id_chamada": Chamada.IdChamada,
        "idchamada": Chamada.IdChamada,
        "data": Chamada.Data,
        "presenca": Chamada.Presenca,
        "id_aluno": Chamada.IdAluno,
        "aula": Chamada.Aula,
    }
    order_column = sort_field_map.get(sort_key, Chamada.Data)
    order_clause = order_column.desc() if direction == "desc" else order_column.asc()

    offset = (page - 1) * per_page
    query = select(Chamada)
    if where_clause is not None:
        query = query.where(where_clause)
    rows = session.exec(query.order_by(order_clause).offset(offset).limit(per_page)).all()

    aluno_ids = {row.IdAluno for row in rows if row.IdAluno}
    matricula_ids = {row.IdMatricula for row in rows if row.IdMatricula}
    aula_ids = {row.Aula for row in rows if row.Aula}
    alunos_map = {
        item.IdAluno: item
        for item in session.exec(select(Aluno).where(Aluno.IdAluno.in_(aluno_ids))).all()
    } if aluno_ids else {}
    aulas_map = {
        item.IdAula: item
        for item in session.exec(select(Aula).where(Aula.IdAula.in_(aula_ids))).all()
    } if aula_ids else {}
    matricula_rows = session.exec(
        select(
            Matricula.IdMatricula,
            Matricula.IdCurso,
            Matricula.IdTurma,
            cast(Matricula.StatusMatricula, String),
        ).where(Matricula.IdMatricula.in_(matricula_ids))
    ).all() if matricula_ids else []
    curso_ids = {row[1] for row in matricula_rows if row and row[1]}
    turma_ids = {row[2] for row in matricula_rows if row and row[2]}
    cursos_map = {
        item.IdCurso: item.NomeCurso
        for item in session.exec(select(Curso).where(Curso.IdCurso.in_(curso_ids))).all()
    } if curso_ids else {}
    turmas_map = {
        item.IdTurma: item.NomeTurma
        for item in session.exec(select(Turma).where(Turma.IdTurma.in_(turma_ids))).all()
    } if turma_ids else {}
    matricula_resumo_map = {}
    for row in matricula_rows:
        matricula_id = row[0]
        if not matricula_id:
            continue
        resumo_partes = [
            cursos_map.get(row[1]),
            turmas_map.get(row[2]),
            normalize_matricula_status_read(row[3]) or None,
        ]
        resumo = ' • '.join([parte for parte in resumo_partes if parte])
        matricula_resumo_map[matricula_id] = resumo or matricula_id

    return {
        "items": [serialize_chamada(chamada, alunos_map, aulas_map, matricula_resumo_map) for chamada in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/frequencia-resumo")
def listar_frequencia_resumo(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=5000),
    q: str | None = None,
    nome_in: str | None = None,
    email_in: str | None = None,
    cpf_in: str | None = None,
    rg_in: str | None = None,
    data_nascimento_in: str | None = None,
    cidade_naturalidade_in: str | None = None,
    sexo_in: str | None = None,
    cor_in: str | None = None,
    estado_in: str | None = None,
    estado_naturalidade_in: str | None = None,
    fone_celular_ddi_in: str | None = None,
    fone_celular_ddd_in: str | None = None,
    fone_celular_numero_in: str | None = None,
    cep_residencial_in: str | None = None,
    rua_residencial_in: str | None = None,
    num_residencial_in: str | None = None,
    complemento_residencial_in: str | None = None,
    situacao_in: str | None = None,
    turno_in: str | None = None,
    escola_ensino_medio_in: str | None = None,
    escola_atual_in: str | None = None,
    data_ingresso_in: str | None = None,
    data_conclusao_in: str | None = None,
    trabalho_in: str | None = None,
    estagio_in: str | None = None,
    empresa_in: str | None = None,
    funcao_in: str | None = None,
    contente_in: str | None = None,
    setor_in: str | None = None,
    cidade_in: str | None = None,
    bairro_in: str | None = None,
    pais_in: str | None = None,
    nacionalidade_in: str | None = None,
    naturalidade_in: str | None = None,
    whatsapp_in: str | None = None,
    aluno_destaque_in: str | None = None,
    ativo_in: str | None = None,
    turma_in: str | None = None,
    turma_ingresso_in: str | None = None,
    foto_in: str | None = None,
    total_aulas_in: str | None = None,
    presencas_in: str | None = None,
    ausencias_in: str | None = None,
    sort_by: str | None = Query("nome_aluno"),
    sort_dir: str = Query("asc"),
    include_inativos: bool = False,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    aluno_query = select(Aluno.IdAluno, Aluno.NomeAluno, Turma.NomeTurma, Aluno.Imagem).outerjoin(
        Turma,
        Turma.IdTurma == Aluno.IdTurma,
    )

    if not include_inativos:
        aluno_query = aluno_query.where(Aluno.DeletedAt.is_(None))

    if q:
        search_text = f"%{str(q).strip()}%"
        aluno_query = aluno_query.where(
            or_(
                Aluno.NomeAluno.ilike(search_text),
                Turma.NomeTurma.ilike(search_text),
            )
        )

    # Helper para comparação case-insensitive
    def _ilike_filter(column, raw_param):
        values = [v.strip().lower() for v in parse_values(raw_param) if v and v.strip()]
        if not values:
            return None
        return or_(*[func.lower(func.trim(column)) == v for v in values])

    # Filtros de texto livre (case-insensitive)
    text_filters = [
        (Aluno.NomeAluno, nome_in),
        (Aluno.Email, email_in),
        (Aluno.CPF, cpf_in),
        (Aluno.RG, rg_in),
        (Aluno.CidadeNaturalidade, cidade_naturalidade_in),
        (Aluno.FoneCelularDDI, fone_celular_ddi_in),
        (Aluno.FoneCelularDDD, fone_celular_ddd_in),
        (Aluno.FoneCelularNumero, fone_celular_numero_in),
        (Aluno.CepResidencial, cep_residencial_in),
        (Aluno.RuaResidencial, rua_residencial_in),
        (Aluno.NumResidencial, num_residencial_in),
        (Aluno.ComplementoResidencial, complemento_residencial_in),
        (Aluno.EscolaEnsinoMedio, escola_ensino_medio_in),
        (Aluno.EscolaAtual, escola_atual_in),
        (Aluno.Empresa, empresa_in),
        (Aluno.Funcao, funcao_in),
        (Aluno.Contente, contente_in),
        (Aluno.Setor, setor_in),
        (Aluno.CidadeResidencial, cidade_in),
        (Aluno.BairroResidencial, bairro_in),
        (Aluno.Pais, pais_in),
        (Aluno.Nacionalidade, nacionalidade_in),
        (Aluno.Naturalidade, naturalidade_in),
    ]
    for column, raw_param in text_filters:
        cond = _ilike_filter(column, raw_param)
        if cond is not None:
            aluno_query = aluno_query.where(cond)

    # Filtros de enum
    enum_filters = [
        (Aluno.Sexo, sexo_in),
        (Aluno.Cor, cor_in),
        (Aluno.Estado, estado_in),
        (Aluno.EstadoNaturalidade, estado_naturalidade_in),
        (Aluno.Turno, turno_in),
        (Aluno.Trabalho, trabalho_in),
        (Aluno.Estagio, estagio_in),
    ]
    for column, raw_param in enum_filters:
        values = parse_values(raw_param)
        if values:
            aluno_query = aluno_query.where(column.in_(values))

    # Situação com equivalências
    situacao_values = parse_values(situacao_in)
    if situacao_values:
        from backend.routes.common_utils import parse_values as _pv
        expanded = []
        SITUACAO_FILTER_EQUIV = {
            'ativo': ['Ativo', 'Em Aberto', 'Em Curso', 'Cursando'],
            'em aberto': ['Em Aberto', 'Em Curso', 'Ativo', 'Cursando'],
            'inativo': ['Inativo'], 'trancado': ['Trancado'],
            'cancelado': ['Cancelado'], 'concluido': ['Concluído', 'Concluido'],
            'concluído': ['Concluído', 'Concluido'],
        }
        for v in situacao_values:
            token = v.strip().lower()
            if token in SITUACAO_FILTER_EQUIV:
                expanded.extend(SITUACAO_FILTER_EQUIV[token])
            else:
                expanded.append(v.strip())
        expanded = list(dict.fromkeys(expanded))
        if expanded:
            aluno_query = aluno_query.where(Aluno.Situacao.in_(expanded))

    # Filtro por data (cast to string comparison)
    for column, raw_param in [(Aluno.DataNascimento, data_nascimento_in), (Aluno.DataIngresso, data_ingresso_in), (Aluno.DataConclusao, data_conclusao_in)]:
        values = parse_values(raw_param)
        if values:
            from sqlalchemy import cast, String as SaString
            aluno_query = aluno_query.where(cast(column, SaString).in_(values))

    # WhatsApp
    whatsapp_values = parse_values(whatsapp_in)
    if whatsapp_values:
        bools = []
        for v in whatsapp_values:
            t = v.strip().lower()
            if t in ('sim', 's', 'true', '1', 'yes'):
                bools.append(True)
            elif t in ('não', 'nao', 'n', 'false', '0', 'no'):
                bools.append(False)
        if bools:
            aluno_query = aluno_query.where(Aluno.WhatsApp.in_(bools))

    # Aluno Destaque
    destaque_values = parse_values(aluno_destaque_in)
    if destaque_values:
        bools = []
        for v in destaque_values:
            t = v.strip().lower()
            if t in ('sim', 's', 'true', '1', 'yes'):
                bools.append(True)
            elif t in ('não', 'nao', 'n', 'false', '0', 'no'):
                bools.append(False)
        if bools:
            aluno_query = aluno_query.where(Aluno.AlunoDestaque.in_(bools))

    # Ativo/Inativo
    ativo_values = parse_values(ativo_in)
    if ativo_values:
        for v in ativo_values:
            t = v.strip().lower()
            if t == 'ativo':
                aluno_query = aluno_query.where(Aluno.DeletedAt.is_(None))
            elif t == 'inativo':
                aluno_query = aluno_query.where(Aluno.DeletedAt.is_not(None))

    # Turma (por nome)
    turma_values = parse_values(turma_in) or parse_values(turma_ingresso_in)
    if turma_values:
        aluno_query = aluno_query.where(Turma.NomeTurma.in_(turma_values))

    # Foto
    foto_values = [str(value).strip().lower() for value in parse_values(foto_in) if str(value).strip()]
    if foto_values:
        wants_photo = any(value in {'sim', 'true', '1', 'com foto', 'foto', 'com anexo', 'possui anexo'} for value in foto_values)
        wants_without_photo = any(value in {'nao', 'não', 'false', '0', 'sem foto', 'sem anexo'} for value in foto_values)
        if wants_photo and not wants_without_photo:
            aluno_query = aluno_query.where(and_(Aluno.Imagem.is_not(None), func.trim(Aluno.Imagem) != ''))
        elif wants_without_photo and not wants_photo:
            aluno_query = aluno_query.where(or_(Aluno.Imagem.is_(None), func.trim(Aluno.Imagem) == ''))

    # Paginação no banco de dados para evitar lentidão
    count_query = select(func.count()).select_from(aluno_query.subquery())
    total = session.exec(count_query).one()

    offset = (page - 1) * per_page
    aluno_query = aluno_query.offset(offset).limit(per_page)
    aluno_rows = session.exec(aluno_query).all()
    aluno_ids = [row[0] for row in aluno_rows if row and row[0]]

    chamada_aggregates: dict[str, dict[str, int]] = {
        aluno_id: {"total": 0, "presencas": 0, "ausencias": 0} for aluno_id in aluno_ids
    }
    if aluno_ids:
        chamada_query = select(Chamada.IdAluno, Chamada.Presenca).where(Chamada.IdAluno.in_(aluno_ids))
        if not include_inativos:
            chamada_query = chamada_query.where(Chamada.DeletedAt.is_(None))
        chamada_rows = session.exec(chamada_query).all()

        for aluno_id, presenca in chamada_rows:
            if not aluno_id:
                continue
            summary = chamada_aggregates.setdefault(aluno_id, {"total": 0, "presencas": 0, "ausencias": 0})
            summary["total"] += 1
            normalized = str(presenca or "").strip().lower()
            if normalized in {"presente", "sim", "p", "true", "1"}:
                summary["presencas"] += 1

        for aluno_id, summary in chamada_aggregates.items():
            summary["ausencias"] = max(0, summary["total"] - summary["presencas"])

    summaries = []
    for aluno_row in aluno_rows:
        aluno_id = aluno_row[0] if len(aluno_row) > 0 else None
        nome_aluno = aluno_row[1] if len(aluno_row) > 1 else None
        turma_ingresso = aluno_row[2] if len(aluno_row) > 2 else None
        foto = aluno_row[3] if len(aluno_row) > 3 else None
        totals = chamada_aggregates.get(aluno_id) or {"total": 0, "presencas": 0, "ausencias": 0}
        summaries.append({
            "IdAluno": aluno_id,
            "NomeAluno": nome_aluno,
            "TurmaIngresso": turma_ingresso,
            "Foto": foto,
            "TotalAulas": totals["total"],
            "Presencas": totals["presencas"],
            "Ausencias": totals["ausencias"],
            "RelatedChamadas": totals["total"],
        })

    direction = str(sort_dir or "asc").strip().lower()
    reverse = direction == "desc"
    sort_key = str(sort_by or "nome_aluno").strip().lower()

    def text_sort(value: str | None) -> str:
        return str(value or "").strip().lower()

    sort_map = {
        "nome_aluno": lambda row: text_sort(row.get("NomeAluno")),
        "turma_ingresso": lambda row: text_sort(row.get("TurmaIngresso")),
        "foto": lambda row: text_sort(row.get("Foto")),
        "total_aulas": lambda row: int(row.get("TotalAulas") or 0),
        "presencas": lambda row: int(row.get("Presencas") or 0),
        "ausencias": lambda row: int(row.get("Ausencias") or 0),
        "related_chamadas": lambda row: int(row.get("RelatedChamadas") or 0),
    }
    summaries.sort(key=sort_map.get(sort_key, sort_map["nome_aluno"]), reverse=reverse)

    return {
        "items": summaries,
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

    chamada_base_conditions = []
    aluno_base_conditions = []
    if not include_inativos:
        chamada_base_conditions.append(Chamada.DeletedAt.is_(None))
        aluno_base_conditions.append(Aluno.DeletedAt.is_(None))

    def _sorted_distinct_values(statement, order_column):
        rows = session.exec(statement.distinct().order_by(order_column.asc())).all()
        return [str(value).strip() for value in rows if value is not None and str(value).strip()]

    def _sorted_distinct_aluno_values(column):
        query = select(column).where(column.is_not(None))
        if aluno_base_conditions:
            query = query.where(*aluno_base_conditions)
        return _sorted_distinct_values(query, column)

    def _sorted_distinct_aluno_date_values(column):
        query = select(cast(column, String)).where(column.is_not(None))
        if aluno_base_conditions:
            query = query.where(*aluno_base_conditions)
        rows = session.exec(query.distinct().order_by(cast(column, String).asc())).all()
        return [str(value).strip() for value in rows if value is not None and str(value).strip()]

    presenca_query = select(Chamada.Presenca).where(Chamada.Presenca.is_not(None))
    aluno_query = select(Aluno.NomeAluno).join(Chamada, Chamada.IdAluno == Aluno.IdAluno).where(Chamada.IdAluno.is_not(None))
    data_query = select(Chamada.Data).where(Chamada.Data.is_not(None))
    aula_query = select(Aula.NomeAula).join(Chamada, Chamada.Aula == Aula.IdAula).where(Chamada.Aula.is_not(None))
    matricula_query = select(Aluno.NomeAluno).join(Matricula, Matricula.IdAluno == Aluno.IdAluno).join(Chamada, Chamada.IdMatricula == Matricula.IdMatricula).where(Chamada.IdMatricula.is_not(None))
    if chamada_base_conditions:
        presenca_query = presenca_query.where(*chamada_base_conditions)
        aluno_query = aluno_query.where(*chamada_base_conditions)
        data_query = data_query.where(*chamada_base_conditions)
        aula_query = aula_query.where(*chamada_base_conditions)
        matricula_query = matricula_query.where(*chamada_base_conditions)

    presenca_rows = session.exec(presenca_query.distinct().order_by(Chamada.Presenca.asc())).all()
    aluno_rows = session.exec(aluno_query.distinct().order_by(Aluno.NomeAluno.asc())).all()
    data_rows = session.exec(data_query.distinct().order_by(Chamada.Data.asc())).all()
    aula_rows = session.exec(aula_query.distinct().order_by(Aula.NomeAula.asc())).all()
    matricula_rows = session.exec(matricula_query.distinct().order_by(Aluno.NomeAluno.asc())).all()

    turma_query = select(Turma.NomeTurma).join(Aluno, Aluno.IdTurma == Turma.IdTurma)
    if aluno_base_conditions:
        turma_query = turma_query.where(*aluno_base_conditions)
    turma_rows = session.exec(
        turma_query.where(Turma.NomeTurma.is_not(None)).distinct().order_by(Turma.NomeTurma.asc())
    ).all()

    aluno_id_query = select(Aluno.IdAluno)
    if aluno_base_conditions:
        aluno_id_query = aluno_id_query.where(*aluno_base_conditions)
    aluno_ids = session.exec(aluno_id_query).all()

    total_options: set[str] = set()
    presencas_options: set[str] = set()
    ausencias_options: set[str] = set()

    options = {}

    if aluno_ids:
        chamadas_count_query = select(
            Chamada.IdAluno,
            func.count(),
            func.sum(case((func.lower(func.trim(Chamada.Presenca)).in_(['presente', 'sim', 'p', 'true', '1']), 1), else_=0)),
        ).where(Chamada.IdAluno.in_(aluno_ids))
        if chamada_base_conditions:
            chamadas_count_query = chamadas_count_query.where(*chamada_base_conditions)
        chamadas_count_rows = session.exec(chamadas_count_query.group_by(Chamada.IdAluno)).all()
        for _id_aluno, total_aulas, total_presencas in chamadas_count_rows:
            total_aulas_int = int(total_aulas or 0)
            total_presencas_int = int(total_presencas or 0)
            total_ausencias_int = max(0, total_aulas_int - total_presencas_int)
            total_options.add(str(total_aulas_int))
            presencas_options.add(str(total_presencas_int))
            ausencias_options.add(str(total_ausencias_int))

    # Adicionar todas as opções de filtro de Aluno
    aluno_fields = {
        "nome": Aluno.NomeAluno, "email": Aluno.Email, "cpf": Aluno.CPF, "rg": Aluno.RG,
        "cidade_naturalidade": Aluno.CidadeNaturalidade, "sexo": Aluno.Sexo, "cor": Aluno.Cor,
        "estado": Aluno.Estado, "estado_naturalidade": Aluno.EstadoNaturalidade,
        "fone_celular_ddi": Aluno.FoneCelularDDI, "fone_celular_ddd": Aluno.FoneCelularDDD,
        "fone_celular_numero": Aluno.FoneCelularNumero, "cep_residencial": Aluno.CepResidencial,
        "rua_residencial": Aluno.RuaResidencial, "num_residencial": Aluno.NumResidencial,
        "complemento_residencial": Aluno.ComplementoResidencial, "situacao": Aluno.Situacao,
        "turno": Aluno.Turno, "escola_ensino_medio": Aluno.EscolaEnsinoMedio,
        "escola_atual": Aluno.EscolaAtual, "trabalho": Aluno.Trabalho, "estagio": Aluno.Estagio,
        "empresa": Aluno.Empresa, "funcao": Aluno.Funcao, "contente": Aluno.Contente,
        "setor": Aluno.Setor, "cidade": Aluno.CidadeResidencial, "bairro": Aluno.BairroResidencial,
        "pais": Aluno.Pais, "nacionalidade": Aluno.Nacionalidade, "naturalidade": Aluno.Naturalidade,
    }

    for key, column in aluno_fields.items():
        query = select(column).where(column.is_not(None))
        if aluno_base_conditions:
            query = query.where(*aluno_base_conditions)
        rows = session.exec(query.distinct().order_by(column.asc())).all()
        values = [str(value).strip() for value in rows if value is not None and str(value).strip()]
        options[key] = list(dict.fromkeys(values))

        # Datas de Aluno
        options["data_nascimento"] = _sorted_distinct_aluno_date_values(Aluno.DataNascimento)
        options["data_ingresso"] = _sorted_distinct_aluno_date_values(Aluno.DataIngresso)
        options["data_conclusao"] = _sorted_distinct_aluno_date_values(Aluno.DataConclusao)

        # Turma de Ingresso
        options["turma_ingresso"] = [str(value).strip() for value in turma_rows if value and str(value).strip()]
        options["turma"] = options["turma_ingresso"] # Alias

    # Update initial options
    options.update({
        "data": [str(value) for value in data_rows if value is not None],
        "presenca": [str(value).strip() for value in presenca_rows if value and str(value).strip()],
        "id_aluno": [str(value).strip() for value in aluno_rows if value and str(value).strip()],
        "nome": [str(value).strip() for value in aluno_rows if value and str(value).strip()],
        "aula": [str(value).strip() for value in aula_rows if value and str(value).strip()],
        "id_matricula": [str(value).strip() for value in matricula_rows if value and str(value).strip()],
        "total_aulas": sorted(total_options, key=int),
        "presencas": sorted(presencas_options, key=int),
        "ausencias": sorted(ausencias_options, key=int),
        "foto": ["Com anexo", "Sem anexo"],
        "whatsapp": ["Sim", "Não"],
        "aluno_destaque": ["Sim", "Não"],
        "ativo": ["Ativo", "Inativo"],
    })

    return {"options": options}


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
    aulas = session.exec(
        select(Aula.IdAula, Aula.NomeAula)
        .order_by(Aula.NomeAula.asc())
    ).all()
    matriculas = session.exec(
        select(Matricula.IdMatricula, Aluno.NomeAluno, Matricula.IdAluno, Matricula.DataMatricula)
        .join(Aluno, Aluno.IdAluno == Matricula.IdAluno)
        .order_by(Aluno.NomeAluno.asc(), Matricula.DataMatricula.desc())
    ).all()
    return {
        "alunos": [{"id": row[0], "nome": row[1]} for row in alunos if row and row[0] and row[1]],
        "aulas": [{"id": row[0], "nome": row[1]} for row in aulas if row and row[0] and row[1]],
        "matriculas": [
            {
                "id": row[0],
                "nome": str(row[3]) if row[3] else row[1],
                "id_aluno": row[2],
                "data_matricula": str(row[3]) if row[3] else None,
            }
            for row in matriculas if row and row[0] and row[2]
        ],
        "presencas": ["Presente", "Ausente"],
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def cadastrar_chamada(
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    for field in ["Data", "IdAluno", "Aula", "Presenca"]:
        if not payload.get(field):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field} é obrigatório")

    chamada = Chamada(
        IdChamada=str(payload.get("IdChamada") or str(uuid4())).strip(),
        Data=payload.get("Data"),
            IdAluno=resolve_existing_fk_id(session, Aluno, payload.get("IdAluno")),
            Aula=resolve_existing_fk_id(session, Aula, payload.get("Aula")),
        Presenca=payload.get("Presenca"),
            IdMatricula=resolve_existing_fk_id(session, Matricula, payload.get("IdMatricula")),
    )
    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        chamada.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()
    session.add(chamada)
    session.commit()
    session.refresh(chamada)
    return serialize_chamada(chamada)


@router.put("/{id_chamada}")
def atualizar_chamada(
    id_chamada: str,
    payload: dict,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    chamada = session.get(Chamada, id_chamada)
    if not chamada:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chamada não encontrada")

    for field in ["Data", "IdAluno", "Aula", "Presenca", "IdMatricula"]:
        if field in payload:
            value = payload.get(field) or None
            if field in {"IdAluno", "Aula", "IdMatricula"}:
                    value = resolve_existing_fk_id(session, Aluno if field == "IdAluno" else Aula if field == "Aula" else Matricula, value)
            setattr(chamada, field, value)

    if "Ativo" in payload and isinstance(payload.get("Ativo"), bool):
        chamada.DeletedAt = None if payload.get("Ativo") else datetime.utcnow()
    session.add(chamada)
    session.commit()
    session.refresh(chamada)
    return serialize_chamada(chamada)


@router.get("/{id_chamada}/delete-capability")
def obter_delete_capability_chamada(
    id_chamada: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    chamada = session.get(Chamada, id_chamada)
    if not chamada:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chamada não encontrada")

    return get_delete_capability(session, chamada)


@router.delete("/{id_chamada}")
def remover_chamada(
    id_chamada: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    chamada = session.get(Chamada, id_chamada)
    if not chamada:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chamada não encontrada")

    try:
        outcome = delete_or_soft_delete(session, chamada)
    except DeleteBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if outcome == "already_inactive":
        return {"message": "Chamada já está inativa"}
    if outcome == "hard_deleted":
        return {"message": "Chamada removida"}
    return {"message": "Chamada inativada"}
