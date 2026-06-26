from fastapi import APIRouter, Body, HTTPException, status, Depends
from sqlalchemy.orm import Session
from backend.shared.models import Aluno
from backend.shared.database import get_session
from backend.routes.usuarios import get_current_user, ensure_admin

router = APIRouter(prefix="/alunos", tags=["Alunos"])



# PATCH /alunos/{id_aluno}
@router.patch("/{id_aluno}")
def patch_aluno(id_aluno: str, payload: dict, usuario_logado: dict = Depends(get_current_user), session: Session = Depends(get_session)):
    ensure_admin(usuario_logado)
    aluno = session.get(Aluno, id_aluno)
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    for k, v in payload.items():
        if hasattr(aluno, k) and k not in ['IdAluno', 'id_aluno']:
            setattr(aluno, k, v)
    session.add(aluno)
    session.commit()
    session.refresh(aluno)
    return aluno
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from datetime import datetime
import shutil
import os
import unicodedata
from urllib.request import urlopen
import json
from sqlmodel import Session, select
from sqlalchemy import String, case, cast, func, or_, and_
from sqlalchemy.exc import IntegrityError
from .delete_utils import DeleteBlockedError, delete_or_soft_delete, get_delete_capability
from shared.database import get_session
from shared.models import Aluno, AlunoInteresse, Avaliacao, Chamada, Curso, Interesse, Matricula, Usuario, Turma, Trilha, AlunoTrilha
from shared.phone_utils import normalize_phone_storage
from shared.auth_utils import get_current_user
from pydantic import BaseModel
from .common_utils import ensure_admin, parse_values

"""Endpoints para permitir que alunos visualizem/editem seus próprios dados.

Lógica de resolução do registro de `Aluno`:
- Primeiro tenta usar `Usuario.IdAluno` (se presente) para buscar o registro.
- Se não houver `IdAluno`, faz fallback para procurar por `Aluno.Email == Usuario.User`.

Essa abordagem facilita a migração de associação por e-mail para uma FK explícita.
"""




TURNO_OPTIONS = ["Manhã", "Tarde", "Noite"]
SITUACAO_EQUIVALENCIAS = {
    'concluido': 'Concluído',
    'concluído': 'Concluído',
    'ativo': 'Em Aberto',
    'em aberto': 'Em Aberto',
    'inativo': 'Inativo',
    'trancado': 'Trancado',
    'cancelado': 'Cancelado',
}
SITUACOES_ALUNO_INATIVAS = {'inativo', 'concluido', 'concluído', 'trancado', 'cancelado'}
SITUACAO_FILTER_EQUIVALENCIAS = {
    'ativo': ['Ativo', 'Em Aberto', 'Em Curso', 'Cursando'],
    'em aberto': ['Em Aberto', 'Em Curso', 'Ativo', 'Cursando'],
    'em curso': ['Em Curso', 'Em Aberto', 'Ativo', 'Cursando'],
    'cursando': ['Cursando', 'Em Curso', 'Em Aberto', 'Ativo'],
    'inativo': ['Inativo'],
    'trancado': ['Trancado'],
    'cancelado': ['Cancelado'],
    'concluido': ['Concluído', 'Concluido'],
    'concluído': ['Concluído', 'Concluido'],
}
STATUS_MATRICULA_EQUIVALENCIAS = {
    'ativo': 'Ativo',
    'trancado': 'Trancado',
    'concluido': 'Concluído',
    'concluído': 'Concluído',
    'cancelado': 'Cancelado',
}
ALUNO_REQUIRED_FIELDS = (
    ('NomeAluno', 'Nome completo do aluno(a)'),
    ('Email', 'E-mail'),
    ('IdTurma', 'Turma de ingresso'),
    ('DataNascimento', 'Data de Nascimento'),
    ('CidadeNaturalidade', 'Cidade de Nascimento'),
    ('FoneCelular', 'Fone Celular'),
    ('EscolaEnsinoMedio', 'Escola Cursada Ensino Fundamental'),
    ('EscolaAtual', 'Escola Atual'),
    ('Turno', 'Turno'),
    ('Situacao', 'Situação'),
)


def delete_local_media_file(media_url: str | None, entity: str):
    raw_value = str(media_url or "").strip()
    if not raw_value.startswith(f"/api/static/{entity}/"):
        return
    filename = os.path.basename(raw_value)
    if not filename:
        return
    file_path = os.path.join("uploads", entity, filename)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass


def normalize_optional_text(value):
    if value is None:
        return None
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    return value


def normalize_legacy_fk_id(value):
    normalized = normalize_optional_text(value)
    if not isinstance(normalized, str):
        return normalized
    lowered = normalized.lower()
    is_legacy_hex_id = len(normalized) == 8 and all(ch in '0123456789abcdef' for ch in lowered)
    is_legacy_course_id = len(normalized) == 6 and lowered.startswith('cur') and lowered[3:].isdigit()
    if is_legacy_hex_id or is_legacy_course_id:
        return normalized.ljust(36)
    return normalized


def resolve_turma_fk_id(session: Session, value: str | None) -> str | None:
    raw_value = normalize_optional_text(value)
    if not raw_value:
        return None
    raw_turma = session.get(Turma, raw_value)
    if raw_turma:
        return raw_value
    legacy_value = normalize_legacy_fk_id(raw_value)
    if legacy_value == raw_value:
        return raw_value
    legacy_turma = session.get(Turma, legacy_value)
    if legacy_turma:
        return legacy_value
    return raw_value


def normalize_matricula_status_read(value) -> str:
    raw_value = str(getattr(value, 'value', value) or '').strip()
    if not raw_value:
        return ''
    return STATUS_MATRICULA_EQUIVALENCIAS.get(raw_value.lower(), raw_value)


def normalize_media_reference(value: str | None) -> str | None:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return None
    if isinstance(normalized, str) and normalized.startswith('data:'):
        return None
    if isinstance(normalized, str) and normalized.lower().startswith(('http://', 'https://')):
        return normalized
    filename = os.path.basename(str(normalized).replace('\\', '/'))
    return f'/api/static/alunos/{filename}' if filename else None


def is_truthy_choice(value) -> bool:
    return str(value or '').strip().lower() in {'1', 'true', 't', 'sim', 's', 'yes', 'y', 'on'}


def raise_for_missing_required_aluno_fields(data: dict):
    missing_labels = []
    for field, label in ALUNO_REQUIRED_FIELDS:
        value = data.get(field)
        if field == 'DataNascimento':
            if not value:
                missing_labels.append(label)
            continue
        if not normalize_optional_text(value):
            missing_labels.append(label)

    email_value = normalize_optional_text(data.get('Email'))
    if email_value and '@' not in email_value:
        missing_labels.append('E-mail válido')

    if (is_truthy_choice(data.get('Trabalho')) or is_truthy_choice(data.get('Estagio'))) and not normalize_optional_text(data.get('Funcao')):
        missing_labels.append('Em qual função?')

    if missing_labels:
        unique_labels = list(dict.fromkeys(missing_labels))
        if len(unique_labels) == 1:
            detail = f'Preencha o campo obrigatório: {unique_labels[0]}.'
        else:
            detail = f'Preencha os campos obrigatórios: {", ".join(unique_labels)}.'
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def normalize_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {'1', 'true', 't', 'sim', 's', 'yes', 'y', 'on'}
    return False


def normalize_situacao(value):
    normalized = normalize_optional_text(value)
    if normalized is None:
        return None
    return SITUACAO_EQUIVALENCIAS.get(normalized.lower(), normalized)


def normalize_filter_token(value: str | None) -> str:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return ''
    ascii_value = unicodedata.normalize('NFD', normalized).encode('ascii', 'ignore').decode('ascii')
    return ascii_value.lower()


def build_situacao_filter_values(values: list[str]) -> list[str]:
    expanded = []
    for value in values:
        token = normalize_filter_token(value)
        if token in SITUACAO_FILTER_EQUIVALENCIAS:
            for option in SITUACAO_FILTER_EQUIVALENCIAS[token]:
                if option not in expanded:
                    expanded.append(option)
            continue
        normalized_value = normalize_optional_text(value)
        if normalized_value and normalized_value not in expanded:
            expanded.append(normalized_value)
    return expanded


def aluno_ativo_clause():
    """Ativo = não soft-deletado. Situação (Concluído, Trancado, etc.) NÃO torna inativo."""
    return Aluno.DeletedAt.is_(None)


def is_aluno_active_record(aluno: Aluno) -> bool:
    """Ativo = não soft-deletado. Situação NÃO determina se é ativo/inativo."""
    return aluno.DeletedAt is None


def normalize_cep(value: str | None) -> str | None:
    raw = ''.join(ch for ch in str(value or '') if ch.isdigit())
    return raw[:8] or None


def fetch_json(url: str) -> dict[str, object] | None:
    try:
        with urlopen(url, timeout=5) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception:
        return None


def lookup_address_by_cep(cep: str) -> dict[str, str] | None:
    normalized_cep = normalize_cep(cep)
    if not normalized_cep:
        return None

    brasilapi_data = fetch_json(f'https://brasilapi.com.br/api/cep/v1/{normalized_cep}')
    if brasilapi_data and not brasilapi_data.get('errors'):
        return {
            'cep': normalized_cep,
            'rua_residencial': str(brasilapi_data.get('street') or '').strip(),
            'bairro_residencial': str(brasilapi_data.get('neighborhood') or '').strip(),
            'cidade': str(brasilapi_data.get('city') or '').strip(),
            'estado': str(brasilapi_data.get('state') or '').strip(),
            'pais': 'Brasil',
        }

    viacep_data = fetch_json(f'https://viacep.com.br/ws/{normalized_cep}/json/')
    if viacep_data and not viacep_data.get('erro'):
        return {
            'cep': normalized_cep,
            'rua_residencial': str(viacep_data.get('logradouro') or '').strip(),
            'bairro_residencial': str(viacep_data.get('bairro') or '').strip(),
            'cidade': str(viacep_data.get('localidade') or '').strip(),
            'estado': str(viacep_data.get('uf') or '').strip(),
            'pais': 'Brasil',
        }

    return None

@router.post("/{aluno_id}/imagem")
def upload_imagem_aluno(
    aluno_id: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    usuario_logado: dict = Depends(get_current_user)
):
    ensure_admin(usuario_logado)

    aluno = session.get(Aluno, aluno_id)
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")

    os.makedirs("uploads/alunos", exist_ok=True)
    extension = os.path.splitext(file.filename)[1]
    filename = f"{aluno_id}{extension}"
    file_location = f"uploads/alunos/{filename}"

    if aluno.Imagem:
        delete_local_media_file(aluno.Imagem, "alunos")

    with open(file_location, "wb+") as buffer:
        shutil.copyfileobj(file.file, buffer)

    image_url_path = f"/api/static/alunos/{filename}"

    aluno.Imagem = image_url_path
    session.add(aluno)
    session.commit()
    session.refresh(aluno)

    return {"status": "ok", "url": image_url_path}


def serialize_aluno(
    a: Aluno,
    turma_nome_by_id: dict[str, str] | None = None,
    cursos_atuais_by_id: dict[str, list[str]] | None = None,
    interesses_by_id: dict[str, list[str]] | None = None,
    matriculas_relacionadas: list[dict[str, object]] | None = None,
    chamadas_relacionadas: list[dict[str, object]] | None = None,
    avaliacoes_relacionadas: list[dict[str, object]] | None = None,
    totais_relacionados: dict[str, int] | None = None,
) -> dict[str, object]:
    turma_nome_by_id = turma_nome_by_id or {}
    cursos_atuais_by_id = cursos_atuais_by_id or {}
    interesses_by_id = interesses_by_id or {}
    matriculas_relacionadas = matriculas_relacionadas or []
    chamadas_relacionadas = chamadas_relacionadas or []
    avaliacoes_relacionadas = avaliacoes_relacionadas or []
    totais_relacionados = totais_relacionados or {"total_aulas": 0, "presencas": 0, "faltas": 0}
    return {
        'id_aluno': a.IdAluno,
        'imagem': a.Imagem,
        'nome': a.NomeAluno,
        'aluno_destaque': bool(getattr(a, 'AlunoDestaque', False)),
        'descricao_destaque': getattr(a, 'DescricaoDestaque', None),
        'email': a.Email,
        'ra': a.RA,
        'ano_matricula': a.AnoMatricula,
        'data_nascimento': a.DataNascimento,
        'cpf': a.CPF,
        'rg': a.RG,
        'id_turma': a.IdTurma,
        'nome_turma': turma_nome_by_id.get(a.IdTurma),
        'cursos_atuais': cursos_atuais_by_id.get(a.IdAluno, []),
        'interesses': interesses_by_id.get(a.IdAluno, []),
        'sexo': a.Sexo,
        'cor': a.Cor,
        'nacionalidade': a.Nacionalidade,
        'naturalidade': a.Naturalidade,
        'estado_naturalidade': a.EstadoNaturalidade,
        'cidade_naturalidade': a.CidadeNaturalidade,
        'fone_celular': a.FoneCelular,
        'fone_celular_ddi': getattr(a, 'FoneCelularDDI', None),
        'fone_celular_ddd': getattr(a, 'FoneCelularDDD', None),
        'fone_celular_numero': getattr(a, 'FoneCelularNumero', None),
        'whatsapp': bool(getattr(a, 'WhatsApp', False)),
        'fone_residencial': a.FoneResidencial,
        'fone_comercial': a.FoneComercial,
        'fone_recado': a.FoneRecado,
        'endereco': a.Endereco,
        'cep_residencial': a.CepResidencial,
        'estado': a.Estado,
        'pais': a.Pais,
        'cidade': a.CidadeResidencial,
        'bairro_residencial': a.BairroResidencial,
        'rua_residencial': a.RuaResidencial,
        'num_residencial': a.NumResidencial,
        'complemento_residencial': a.ComplementoResidencial,
        'pai': a.Pai,
        'mae': a.Mae,
        'escola_ensino_medio': a.EscolaEnsinoMedio,
        'escola_atual': a.EscolaAtual,
        'turno': a.Turno,
        'setor': a.Setor,
        'data_ingresso': a.DataIngresso,
        'ano_ingresso': a.AnoIngresso,
        'semestre_ingresso': a.SemestreIngresso,
        'data_conclusao': a.DataConclusao,
        'trabalho': a.Trabalho,
        'estagio': a.Estagio,
        'empresa': a.Empresa,
        'funcao': a.Funcao,
        'contente': a.Contente,
        'motivo': a.Motivo,
        'situacao': normalize_situacao(a.Situacao),
        'matriculas_relacionadas': matriculas_relacionadas,
        'chamadas_relacionadas': chamadas_relacionadas,
        'avaliacoes_relacionadas': avaliacoes_relacionadas,
        'totais_relacionados': totais_relacionados,
        'ativo': is_aluno_active_record(a),
    }


class AlunoUpdate(BaseModel):
    imagem: str | None = None
    nome_aluno: str | None = None
    aluno_destaque: bool | None = None
    descricao_destaque: str | None = None
    email: str | None = None
    ra: str | None = None
    cpf: str | None = None
    rg: str | None = None
    id_turma: str | None = None
    data_nascimento: str | None = None
    sexo: str | None = None
    cor: str | None = None
    nacionalidade: str | None = None
    naturalidade: str | None = None
    estado_naturalidade: str | None = None
    cidade_naturalidade: str | None = None
    fone_celular: str | None = None
    whatsapp: bool | None = None
    fone_residencial: str | None = None
    fone_comercial: str | None = None
    fone_recado: str | None = None
    endereco: str | None = None
    cep_residencial: str | None = None
    estado: str | None = None
    pais: str | None = None
    cidade_residencial: str | None = None
    bairro_residencial: str | None = None
    rua_residencial: str | None = None
    num_residencial: str | None = None
    complemento_residencial: str | None = None
    pai: str | None = None
    mae: str | None = None
    escola_ensino_medio: str | None = None
    escola_atual: str | None = None
    turno: str | None = None
    setor: str | None = None
    data_ingresso: str | None = None
    ano_ingresso: int | None = None
    semestre_ingresso: int | None = None
    data_conclusao: str | None = None
    trabalho: str | None = None
    estagio: str | None = None
    empresa: str | None = None
    Funcao: str | None = None
    Contente: str | None = None
    Motivo: str | None = None
    Situacao: str | None = None


def build_aluno_related_payload(session: Session, aluno: Aluno) -> tuple[list[dict[str, object]], list[dict[str, object]], list[dict[str, object]], dict[str, int]]:
    matricula_rows = session.exec(
        select(
            Matricula.IdMatricula,
            Matricula.DataMatricula,
            Matricula.DataConclusao,
            cast(Matricula.StatusMatricula, String),
            Curso.NomeCurso,
            Turma.NomeTurma,
        )
        .join(Curso, Curso.IdCurso == Matricula.IdCurso)
        .outerjoin(Turma, Turma.IdTurma == Matricula.IdTurma)
        .where(Matricula.IdAluno == aluno.IdAluno)
        .order_by(Matricula.DataMatricula.desc(), Matricula.DataAtualizacao.desc())
    ).all()

    matriculas_relacionadas = [
        {
            "id_matricula": row[0],
            "data_matricula": row[1],
            "data_conclusao": row[2],
            "status": normalize_matricula_status_read(row[3]),
            "curso": row[4],
            "turma": row[5],
        }
        for row in matricula_rows
    ]

    matricula_summary_by_curso = {}
    for row in matriculas_relacionadas:
        curso_nome = str(row.get("curso") or "").strip()
        if not curso_nome or curso_nome in matricula_summary_by_curso:
            continue
        matricula_summary_by_curso[curso_nome] = {
            "data_ingresso": row.get("data_matricula"),
            "data_conclusao": row.get("data_conclusao"),
        }

    chamada_rows = session.exec(
        select(Chamada.Data, Chamada.Presenca)
        .where(Chamada.IdAluno == aluno.IdAluno)
        .where(Chamada.DeletedAt.is_(None))
        .order_by(Chamada.Data.desc())
    ).all()
    chamadas_relacionadas = [
        {
            "nome_aluno": aluno.NomeAluno,
            "presenca": row[1],
            "data": row[0],
        }
        for row in chamada_rows
    ]

    total_aulas = len(chamadas_relacionadas)
    presencas = sum(1 for row in chamadas_relacionadas if str(row.get("presenca") or "").strip().lower() in {"presente", "sim", "p", "true", "1"})
    faltas = max(0, total_aulas - presencas)

    avaliacao_rows = session.exec(
        select(Avaliacao.Nota, Avaliacao.Status, Avaliacao.OBS, Curso.NomeCurso)
        .join(Curso, Curso.IdCurso == Avaliacao.IdCurso)
        .where(Avaliacao.IdAluno == aluno.IdAluno)
        .where(Avaliacao.DeletedAt.is_(None))
        .order_by(Avaliacao.IdAvaliacao.desc())
    ).all()
    avaliacoes_relacionadas = []
    for nota, status, observacao, nome_curso in avaliacao_rows:
        curso_nome = str(nome_curso or "").strip()
        resumo = matricula_summary_by_curso.get(curso_nome, {})
        avaliacoes_relacionadas.append({
            "nome_aluno": aluno.NomeAluno,
            "nome_curso": curso_nome,
            "nota": nota,
            "status": status,
            "obs": observacao,
            "data_ingresso": resumo.get("data_ingresso"),
            "data_conclusao": resumo.get("data_conclusao"),
        })

    return (
        matriculas_relacionadas,
        chamadas_relacionadas,
        avaliacoes_relacionadas,
        {"total_aulas": total_aulas, "presencas": presencas, "faltas": faltas},
    )


@router.get('/me')
def get_my_aluno(usuario_logado: dict = Depends(get_current_user), session: Session = Depends(get_session)):
    """Retorna o registro de `Aluno` associado ao usuário logado.

    Prioriza `Usuario.IdAluno` quando disponível; caso contrário faz fallback
    para busca por e-mail (compatibilidade retroativa).
    """
    usuario_id = usuario_logado.get('id')
    login = usuario_logado.get('sub')
    if not usuario_id or not login:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Usuário inválido')

    # Tentar usar a FK quando presente
    usuario = session.get(Usuario, usuario_id)
    if usuario and getattr(usuario, 'IdAluno', None):
        aluno = session.get(Aluno, usuario.IdAluno)
        if aluno:
            return aluno

    # Fallback: procurar por e-mail
    aluno = session.exec(select(Aluno).where(Aluno.Email == login)).first()
    if not aluno:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Aluno não encontrado')
    return aluno


@router.get('/')
def listar_alunos(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=5000),
    q: str | None = None,
    nome_in: str | None = None,
    email_in: str | None = None,
    sexo_in: str | None = None,
    cor_in: str | None = None,
    estado_in: str | None = None,
    estado_naturalidade_in: str | None = None,
    situacao_in: str | None = None,
    turno_in: str | None = None,
    trabalho_in: str | None = None,
    estagio_in: str | None = None,
    setor_in: str | None = None,
    turma_in: str | None = None,
    cidade_in: str | None = None,
    bairro_in: str | None = None,
    pais_in: str | None = None,
    nacionalidade_in: str | None = None,
    naturalidade_in: str | None = None,
    foto_in: str | None = None,
    sort_by: str = Query('nome'),
    sort_dir: str = Query('asc'),
    include_inativos: bool = False,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    ensure_admin(usuario_logado)

    conditions = []
    if not include_inativos:
        conditions.append(aluno_ativo_clause())
    if q:
        conditions.append(or_(Aluno.NomeAluno.contains(q), Aluno.Email.contains(q)))

    # Filtros de texto livre: comparação case-insensitive com trim para evitar
    # falhas por diferença de capitalização ou espaços extras no banco.
    def _ilike_in(column, values: list[str]):
        """Retorna condição OR com comparação case-insensitive e trim para cada valor."""
        normalized = [v.strip().lower() for v in values if v and v.strip()]
        if not normalized:
            return None
        return or_(*[func.lower(func.trim(column)) == v for v in normalized])

    # Filtros de texto livre (case-insensitive)
    text_free_filters = [
        (Aluno.NomeAluno, parse_values(nome_in)),
        (Aluno.Email, parse_values(email_in)),
        (Aluno.CidadeResidencial, parse_values(cidade_in)),
        (Aluno.BairroResidencial, parse_values(bairro_in)),
        (Aluno.Pais, parse_values(pais_in)),
        (Aluno.Setor, parse_values(setor_in)),
    ]
    for column, values in text_free_filters:
        cond = _ilike_in(column, values)
        if cond is not None:
            conditions.append(cond)

    # Filtros de enum/opção fixa: usa IN exato (valores vêm de opções controladas)
    enum_filter_map = {
        'sexo_in': (Aluno.Sexo, parse_values(sexo_in)),
        'cor_in': (Aluno.Cor, parse_values(cor_in)),
        'estado_in': (Aluno.Estado, parse_values(estado_in)),
        'estado_naturalidade_in': (Aluno.EstadoNaturalidade, parse_values(estado_naturalidade_in)),
        'situacao_in': (Aluno.Situacao, build_situacao_filter_values(parse_values(situacao_in))),
        'trabalho_in': (Aluno.Trabalho, parse_values(trabalho_in)),
        'estagio_in': (Aluno.Estagio, parse_values(estagio_in)),
        'nacionalidade_in': (Aluno.Nacionalidade, parse_values(nacionalidade_in)),
        'naturalidade_in': (Aluno.Naturalidade, parse_values(naturalidade_in)),
        'turno_in': (Aluno.Turno, parse_values(turno_in)),
    }
    for _, (column, values) in enum_filter_map.items():
        if values:
            conditions.append(column.in_(values))

    foto_values = [str(value).strip().lower() for value in parse_values(foto_in) if str(value).strip()]
    if foto_values:
        wants_photo = any(value in {'sim', 'true', '1', 'com foto', 'foto'} for value in foto_values)
        wants_without_photo = any(value in {'nao', 'não', 'false', '0', 'sem foto'} for value in foto_values)
        if wants_photo and not wants_without_photo:
            conditions.append(Aluno.Imagem.is_not(None))
        elif wants_without_photo and not wants_photo:
            conditions.append(Aluno.Imagem.is_(None))

    turma_values = parse_values(turma_in)
    if turma_values:
        turma_ids = session.exec(select(Turma.IdTurma).where(Turma.NomeTurma.in_(turma_values))).all()
        turma_ids = [value for value in turma_ids if value]
        if turma_ids:
            conditions.append(Aluno.IdTurma.in_(turma_ids))
        else:
            conditions.append(Aluno.IdTurma == '__NO_MATCH__')

    where_clause = and_(*conditions) if conditions else None

    if where_clause is not None:
        total_row = session.exec(select(func.count()).select_from(Aluno).where(where_clause)).first()
    else:
        total_row = session.exec(select(func.count()).select_from(Aluno)).first()
    if total_row is None:
        total = 0
    elif isinstance(total_row, (tuple, list)):
        total = int(total_row[0])
    else:
        total = int(total_row)

    offset = (page - 1) * per_page
    query = select(Aluno)
    if where_clause is not None:
        query = query.where(where_clause)

    sortable = {
        'id_aluno': Aluno.IdAluno,
        'nome': Aluno.NomeAluno,
        'email': Aluno.Email,
        'ra': Aluno.RA,
        'cpf': Aluno.CPF,
        'rg': Aluno.RG,
        'data_nascimento': Aluno.DataNascimento,
        'id_turma': Aluno.IdTurma,
        'sexo': Aluno.Sexo,
        'cidade': Aluno.CidadeResidencial,
        'bairro': Aluno.BairroResidencial,
        'rua': Aluno.RuaResidencial,
        'ativo': Aluno.DeletedAt,
    }
    sort_key = (sort_by or 'nome').lower()
    if sort_key not in sortable:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Parâmetro sort_by inválido')

    sort_col = sortable[sort_key]
    sort_direction = (sort_dir or 'asc').lower()
    if sort_key == 'ativo':
        ativo_order = case((aluno_ativo_clause(), 0), else_=1)
        if sort_direction == 'desc':
            query = query.order_by(ativo_order.desc(), Aluno.NomeAluno.desc())
        else:
            query = query.order_by(ativo_order.asc(), Aluno.NomeAluno.asc())
    else:
        if sort_direction == 'desc':
            query = query.order_by(sort_col.desc())
        else:
            query = query.order_by(sort_col.asc())

    query = query.offset(offset).limit(per_page)

    results = session.exec(query).all()
    turma_ids_in_page = [a.IdTurma for a in results if a.IdTurma]
    turma_nome_by_id: dict[str, str] = {}
    if turma_ids_in_page:
        turma_rows = session.exec(
            select(Turma.IdTurma, Turma.NomeTurma).where(Turma.IdTurma.in_(turma_ids_in_page))
        ).all()
        turma_nome_by_id = {row[0]: row[1] for row in turma_rows if row and row[0]}

    aluno_ids_in_page = [a.IdAluno for a in results if a.IdAluno]
    cursos_atuais_by_id: dict[str, list[str]] = {}
    interesses_by_id: dict[str, list[str]] = {}

    if aluno_ids_in_page:
        matricula_rows = session.exec(
            select(Matricula.IdAluno, Curso.NomeCurso, cast(Matricula.StatusMatricula, String), Matricula.DataConclusao)
            .join(Curso, Curso.IdCurso == Matricula.IdCurso)
            .where(Matricula.IdAluno.in_(aluno_ids_in_page))
        ).all()
        for aluno_id, nome_curso, status_matricula, data_conclusao in matricula_rows:
            status_value = normalize_matricula_status_read(status_matricula).strip().lower()
            if data_conclusao is not None or status_value in {'concluido', 'concluído', 'cancelado'}:
                continue
            curso_nome = str(nome_curso or '').strip()
            if not curso_nome:
                continue
            cursos_atuais_by_id.setdefault(aluno_id, [])
            if curso_nome not in cursos_atuais_by_id[aluno_id]:
                cursos_atuais_by_id[aluno_id].append(curso_nome)

        interesse_rows = session.exec(
            select(AlunoInteresse.IdAluno, Interesse.Descricao)
            .join(Interesse, Interesse.IdInteresse == AlunoInteresse.IdInteresse)
            .where(AlunoInteresse.IdAluno.in_(aluno_ids_in_page))
            .where(AlunoInteresse.DeletedAt.is_(None))
            .where(Interesse.DeletedAt.is_(None))
            .order_by(Interesse.Descricao.asc())
        ).all()
        for aluno_id, descricao_interesse in interesse_rows:
            descricao = str(descricao_interesse or '').strip()
            if not descricao:
                continue
            interesses_by_id.setdefault(aluno_id, [])
            if descricao not in interesses_by_id[aluno_id]:
                interesses_by_id[aluno_id].append(descricao)

    items = [serialize_aluno(a, turma_nome_by_id, cursos_atuais_by_id, interesses_by_id) for a in results]

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get('/filter-options')
def listar_opcoes_filtro(
    include_inativos: bool = False,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    fields = {
        'nome': Aluno.NomeAluno,
        'email': Aluno.Email,
        'sexo': Aluno.Sexo,
        'cor': Aluno.Cor,
        'estado': Aluno.Estado,
        'estado_naturalidade': Aluno.EstadoNaturalidade,
        'situacao': Aluno.Situacao,
        'trabalho': Aluno.Trabalho,
        'estagio': Aluno.Estagio,
        'setor': Aluno.Setor,
        'cidade': Aluno.CidadeResidencial,
        'bairro': Aluno.BairroResidencial,
        'pais': Aluno.Pais,
        'nacionalidade': Aluno.Nacionalidade,
        'naturalidade': Aluno.Naturalidade,
 'turno': Aluno.Turno,
    }

    options = {}
    for key, column in fields.items():
        query = select(column).where(column.is_not(None))
        if not include_inativos:
            query = query.where(aluno_ativo_clause())
        rows = session.exec(query.distinct().order_by(column.asc())).all()
        values = [str(value).strip() for value in rows if value is not None and str(value).strip()]
        options[key] = list(dict.fromkeys(values))

    turma_query = (
        select(Turma.NomeTurma)
        .join(Aluno, Aluno.IdTurma == Turma.IdTurma)
        .where(Turma.NomeTurma.is_not(None))
    )
    if not include_inativos:
        turma_query = turma_query.where(aluno_ativo_clause())
    turma_rows = session.exec(turma_query.distinct().order_by(Turma.NomeTurma.asc())).all()
    turma_values = [str(value).strip() for value in turma_rows if value is not None and str(value).strip()]
    options['turma'] = list(dict.fromkeys(turma_values))
    options['foto'] = ['Com foto', 'Sem foto']

    return {'options': options}


@router.get('/form-options')
def listar_opcoes_formulario(
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    turmas = session.exec(
        select(Turma.IdTurma, Turma.NomeTurma)
        .where(Turma.DeletedAt.is_(None))
        .order_by(Turma.NomeTurma.asc())
    ).all()

    escolas_fundamental_rows = session.exec(
        select(Aluno.EscolaEnsinoMedio)
        .where(Aluno.EscolaEnsinoMedio.is_not(None))
        .distinct()
        .order_by(Aluno.EscolaEnsinoMedio.asc())
    ).all()
    escolas_atuais_rows = session.exec(
        select(Aluno.EscolaAtual)
        .where(Aluno.EscolaAtual.is_not(None))
        .distinct()
        .order_by(Aluno.EscolaAtual.asc())
    ).all()
    return {
        'turnos': TURNO_OPTIONS,
        'situacoes': ['Em Aberto', 'Inativo', 'Concluído', 'Trancado', 'Cancelado'],
        'turmas': [
            {'id': row[0], 'nome': row[1]}
            for row in turmas
            if row and row[0] and row[1]
        ],
        'escolas_ensino_medio': [
            str(row).strip()
            for row in escolas_fundamental_rows
            if row is not None and str(row).strip()
        ],
        'escolas_atuais': [
            str(row).strip()
            for row in escolas_atuais_rows
            if row is not None and str(row).strip()
        ],
    }


@router.get('/cep-lookup')
def consultar_cep(
    cep: str = Query(..., min_length=8, max_length=9),
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)
    address = lookup_address_by_cep(cep)
    if not address:
        raise HTTPException(status_code=404, detail='CEP não encontrado')
    return {'item': address}


@router.get('/{id_aluno}/details')
def detalhar_aluno(
    id_aluno: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    aluno = session.get(Aluno, id_aluno)
    if not aluno:
        raise HTTPException(status_code=404, detail='Aluno não encontrado')

    turma_nome_by_id = {}
    if aluno.IdTurma:
        turma = session.get(Turma, aluno.IdTurma)
        if turma:
            turma_nome_by_id[aluno.IdTurma] = turma.NomeTurma

    cursos_rows = session.exec(
        select(Curso.NomeCurso)
        .join(Matricula, Matricula.IdCurso == Curso.IdCurso)
        .where(Matricula.IdAluno == aluno.IdAluno)
        .where(Curso.DeletedAt.is_(None))
        .order_by(Curso.NomeCurso.asc())
    ).all()
    cursos_atuais_by_id = {
        aluno.IdAluno: [str(row).strip() for row in cursos_rows if row and str(row).strip()]
    }

    interesse_rows = session.exec(
        select(Interesse.Descricao)
        .join(AlunoInteresse, AlunoInteresse.IdInteresse == Interesse.IdInteresse)
        .where(AlunoInteresse.IdAluno == aluno.IdAluno)
        .where(AlunoInteresse.DeletedAt.is_(None))
        .where(Interesse.DeletedAt.is_(None))
        .order_by(Interesse.Descricao.asc())
    ).all()
    interesses_by_id = {
        aluno.IdAluno: [str(row).strip() for row in interesse_rows if row and str(row).strip()]
    }

    matriculas_relacionadas, chamadas_relacionadas, avaliacoes_relacionadas, totais_relacionados = build_aluno_related_payload(session, aluno)

    return {
        'item': serialize_aluno(
            aluno,
            turma_nome_by_id,
            cursos_atuais_by_id,
            interesses_by_id,
            matriculas_relacionadas,
            chamadas_relacionadas,
            avaliacoes_relacionadas,
            totais_relacionados,
        )
    }


@router.put('/me')
def update_my_aluno(payload: dict, usuario_logado: dict = Depends(get_current_user), session: Session = Depends(get_session)):
    usuario_id = usuario_logado.get('id')
    login = usuario_logado.get('sub')
    if not usuario_id or not login:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Usuário inválido')

    usuario = session.get(Usuario, usuario_id)
    aluno = None
    if usuario and getattr(usuario, 'IdAluno', None):
        aluno = session.get(Aluno, usuario.IdAluno)
    if not aluno:
        aluno = session.exec(select(Aluno).where(Aluno.Email == login)).first()
    if not aluno:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Aluno não encontrado')

    changed = False
    for field in [
        'NomeAluno', 'AlunoDestaque', 'DescricaoDestaque', 'Email', 'RA', 'CPF', 'RG', 'IdTurma', 'DataNascimento', 'Sexo', 'Cor',
        'Nacionalidade', 'Naturalidade', 'EstadoNaturalidade', 'CidadeNaturalidade',
        'FoneCelular', 'WhatsApp', 'FoneResidencial', 'FoneComercial', 'FoneRecado', 'Endereco',
        'CepResidencial', 'Estado', 'Pais', 'CidadeResidencial', 'BairroResidencial',
        'RuaResidencial', 'NumResidencial', 'ComplementoResidencial', 'Pai', 'Mae',
        'EscolaEnsinoMedio', 'EscolaAtual', 'Turno', 'Setor', 'DataIngresso', 'AnoIngresso',
        'SemestreIngresso', 'DataConclusao', 'Trabalho', 'Estagio', 'Empresa', 'Funcao', 'Contente',
        'Motivo', 'Situacao'
    ]:
        val = payload.get(field)
        if val is not None:
            if field == 'Situacao':
                val = normalize_situacao(val)
            elif field == 'WhatsApp':
                val = normalize_bool(val)
            elif field == 'IdTurma':
                val = normalize_legacy_fk_id(val)
            setattr(aluno, field, val)
            changed = True

    celular = normalize_phone_storage(
        phone=payload.get('FoneCelular', aluno.FoneCelular),
        ddi=payload.get('FoneCelularDDI', aluno.FoneCelularDDI),
        ddd=payload.get('FoneCelularDDD', aluno.FoneCelularDDD),
        number=payload.get('FoneCelularNumero', aluno.FoneCelularNumero),
    )
    aluno.FoneCelular = celular['local']
    aluno.FoneCelularDDI = celular['ddi']
    aluno.FoneCelularDDD = celular['ddd']
    aluno.FoneCelularNumero = celular['number']

    raise_for_missing_required_aluno_fields({
        'NomeAluno': aluno.NomeAluno,
        'Email': aluno.Email,
        'IdTurma': aluno.IdTurma,
        'DataNascimento': aluno.DataNascimento,
        'CidadeNaturalidade': aluno.CidadeNaturalidade,
        'FoneCelular': celular['local'],
        'EscolaEnsinoMedio': aluno.EscolaEnsinoMedio,
        'EscolaAtual': aluno.EscolaAtual,
        'Turno': aluno.Turno,
        'Situacao': aluno.Situacao,
        'Trabalho': aluno.Trabalho,
        'Estagio': aluno.Estagio,
        'Funcao': aluno.Funcao,
    })

    if changed:
        try:
            session.add(aluno)
            session.commit()
            session.refresh(aluno)
        except Exception:
            session.rollback()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Erro ao atualizar aluno')

    return aluno


@router.put("/{id_aluno}")
def atualizar_aluno(id_aluno: str, payload: dict, usuario_logado: dict = Depends(get_current_user), session: Session = Depends(get_session)):
    ensure_admin(usuario_logado)
    aluno = session.get(Aluno, id_aluno)
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")

    previous_image = aluno.Imagem

    # Update dynamically
    for k, v in payload.items():
        if k == 'Ativo' and isinstance(v, bool):
            from datetime import datetime
            aluno.DeletedAt = None if v else datetime.utcnow()
        elif hasattr(aluno, k) and k not in ['IdAluno', 'id_aluno']:
            normalized_value = normalize_optional_text(v)
            if k == 'Situacao':
                normalized_value = normalize_situacao(v)
            elif k == 'WhatsApp':
                normalized_value = normalize_bool(v)
            elif k == 'CepResidencial':
                normalized_value = normalize_cep(v)
            elif k == 'Imagem':
                normalized_value = normalize_media_reference(v)
            elif k == 'IdTurma':
                normalized_value = normalize_legacy_fk_id(v)
            setattr(aluno, k, normalized_value)

    if 'Imagem' in payload:
        aluno.Imagem = normalize_media_reference(payload.get('Imagem'))

    celular = normalize_phone_storage(
        phone=payload.get('FoneCelular', aluno.FoneCelular),
        ddi=payload.get('FoneCelularDDI', aluno.FoneCelularDDI),
        ddd=payload.get('FoneCelularDDD', aluno.FoneCelularDDD),
        number=payload.get('FoneCelularNumero', aluno.FoneCelularNumero),
    )
    aluno.FoneCelular = celular['local']
    aluno.FoneCelularDDI = celular['ddi']
    aluno.FoneCelularDDD = celular['ddd']
    aluno.FoneCelularNumero = celular['number']

    raise_for_missing_required_aluno_fields({
        'NomeAluno': aluno.NomeAluno,
        'Email': aluno.Email,
        'IdTurma': aluno.IdTurma,
        'DataNascimento': aluno.DataNascimento,
        'CidadeNaturalidade': aluno.CidadeNaturalidade,
        'FoneCelular': celular['local'],
        'EscolaEnsinoMedio': aluno.EscolaEnsinoMedio,
        'EscolaAtual': aluno.EscolaAtual,
        'Turno': aluno.Turno,
        'Situacao': aluno.Situacao,
        'Trabalho': aluno.Trabalho,
        'Estagio': aluno.Estagio,
        'Funcao': aluno.Funcao,
    })

    if previous_image and aluno.Imagem != previous_image:
        delete_local_media_file(previous_image, 'alunos')

    session.add(aluno)
    session.commit()
    session.refresh(aluno)

    turma_nome_by_id = {}
    if aluno.IdTurma:
        turma = session.get(Turma, aluno.IdTurma)
        if turma:
            turma_nome_by_id[aluno.IdTurma] = turma.NomeTurma
    return {"status": "ok", "item": serialize_aluno(aluno, turma_nome_by_id)}


@router.post("/")
def criar_aluno(payload: dict, usuario_logado: dict = Depends(get_current_user), session: Session = Depends(get_session)):
    import uuid
    ensure_admin(usuario_logado)
    celular = normalize_phone_storage(
        phone=payload.get('FoneCelular'),
        ddi=payload.get('FoneCelularDDI'),
        ddd=payload.get('FoneCelularDDD'),
        number=payload.get('FoneCelularNumero'),
    )
    # Generate uuid explicitly as IdAluno is String(36)
    aluno = Aluno(IdAluno=str(uuid.uuid4()))

    id_turma = resolve_turma_fk_id(session, payload.get('IdTurma'))
    if id_turma:
        turma = session.get(Turma, id_turma)
        if not turma or turma.DeletedAt is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Turma inválida para o aluno')
    raise_for_missing_required_aluno_fields({ **payload, 'FoneCelular': celular['local'] })

    for k, v in payload.items():
        if k == 'Ativo' and isinstance(v, bool):
            from datetime import datetime
            aluno.DeletedAt = None if v else datetime.utcnow()
        elif hasattr(aluno, k) and k not in ['IdAluno', 'id_aluno']:
            normalized_value = v
            if k == 'Situacao':
                normalized_value = normalize_situacao(v)
            elif k == 'WhatsApp':
                normalized_value = normalize_bool(v)
            elif k == 'CepResidencial':
                normalized_value = normalize_cep(v)
            elif k == 'Imagem':
                normalized_value = normalize_media_reference(v)
            elif k in ['FoneCelularDDI', 'FoneCelularDDD', 'FoneCelularNumero']:
                normalized_value = None
            else:
                normalized_value = normalize_optional_text(v)
            if k == 'IdTurma':
                normalized_value = id_turma
            setattr(aluno, k, normalized_value)

    aluno.FoneCelular = celular['local']
    aluno.FoneCelularDDI = celular['ddi']
    aluno.FoneCelularDDD = celular['ddd']
    aluno.FoneCelularNumero = celular['number']

    session.add(aluno)
    try:
        session.commit()
        session.refresh(aluno)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Não foi possível criar o aluno com os dados informados')
    except Exception:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Erro ao criar aluno')
    return {"status": "ok", "id": aluno.IdAluno, "item": serialize_aluno(aluno)}

@router.get("/{id_aluno}/delete-capability")
def obter_delete_capability_aluno(
    id_aluno: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)
    aluno = session.get(Aluno, id_aluno)
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    return get_delete_capability(session, aluno)


@router.delete("/{id_aluno}")
def deletar_aluno(id_aluno: str, usuario_logado: dict = Depends(get_current_user), session: Session = Depends(get_session)):
    ensure_admin(usuario_logado)
    aluno = session.get(Aluno, id_aluno)
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")

    try:
        outcome = delete_or_soft_delete(session, aluno)
    except DeleteBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if outcome == "already_inactive":
        return {"status": "ok", "message": "Aluno já está inativo"}
    if outcome == "hard_deleted":
        return {"status": "ok", "message": "Aluno removido"}
    return {"status": "ok", "message": "Aluno inativado"}


# --- Gerenciamento de Trilhas do Aluno ---

@router.get("/{id_aluno}/trilhas")
def listar_trilhas_aluno(
    id_aluno: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    aluno = session.get(Aluno, id_aluno)
    if not aluno:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")

    query = select(AlunoTrilha).where(
        and_(
            AlunoTrilha.IdAluno == id_aluno,
            AlunoTrilha.DeletedAt.is_(None),
        )
    )

    trilhas_aluno = session.exec(query).all()

    return {
        "items": [
            {
                "IdAlunoTrilha": at.IdAlunoTrilha,
                "IdAluno": at.IdAluno,
                "IdTrilha": at.IdTrilha,
                "NotaTrilha": at.NotaTrilha,
            }
            for at in trilhas_aluno
        ],
        "total": len(trilhas_aluno),
    }


@router.post("/{id_aluno}/trilhas", status_code=status.HTTP_201_CREATED)
def adicionar_trilha_aluno(
    id_aluno: str,
    payload: dict = Body(...),
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    aluno = session.get(Aluno, id_aluno)
    if not aluno:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")

    id_trilha = str(payload.get("IdTrilha") or payload.get("id_trilha") or "").strip()
    if not id_trilha:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IdTrilha é obrigatória")

    trilha = session.get(Trilha, id_trilha)
    if not trilha:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trilha não encontrada")

    # Check if association already exists
    existing = session.exec(
        select(AlunoTrilha).where(
            and_(
                AlunoTrilha.IdAluno == id_aluno,
                AlunoTrilha.IdTrilha == id_trilha,
            )
        )
    ).first()

    if existing and existing.DeletedAt is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Aluno já está associado a esta trilha"
        )

    nota_trilha = payload.get("NotaTrilha")
    if nota_trilha is not None:
        try:
            nota_trilha = float(nota_trilha)
            if nota_trilha < 0.0 or nota_trilha > 10.0:
                raise ValueError
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="NotaTrilha deve ser um número entre 0.0 e 10.0"
            )

    if existing and existing.DeletedAt is not None:
        existing.DeletedAt = None
        existing.NotaTrilha = nota_trilha
        aluno_trilha = existing
    else:
        from uuid import uuid4
        aluno_trilha = AlunoTrilha(
            IdAlunoTrilha=str(uuid4()),
            IdAluno=id_aluno,
            IdTrilha=id_trilha,
            NotaTrilha=nota_trilha,
        )
    session.add(aluno_trilha)
    session.commit()
    session.refresh(aluno_trilha)

    return {
        "IdAlunoTrilha": aluno_trilha.IdAlunoTrilha,
        "IdAluno": aluno_trilha.IdAluno,
        "IdTrilha": aluno_trilha.IdTrilha,
        "NotaTrilha": aluno_trilha.NotaTrilha,
    }


@router.put("/{id_aluno}/trilhas/{id_trilha}")
def atualizar_trilha_aluno(
    id_aluno: str,
    id_trilha: str,
    payload: dict = Body(...),
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    aluno = session.get(Aluno, id_aluno)
    if not aluno:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")

    trilha = session.get(Trilha, id_trilha)
    if not trilha:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trilha não encontrada")

    aluno_trilha = session.exec(
        select(AlunoTrilha).where(
            and_(
                AlunoTrilha.IdAluno == id_aluno,
                AlunoTrilha.IdTrilha == id_trilha,
                AlunoTrilha.DeletedAt.is_(None),
            )
        )
    ).first()

    if not aluno_trilha:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associação entre aluno e trilha não encontrada"
        )

    if "NotaTrilha" in payload:
        nota_trilha = payload.get("NotaTrilha")
        if nota_trilha is not None:
            try:
                nota_trilha = float(nota_trilha)
                if nota_trilha < 0.0 or nota_trilha > 10.0:
                    raise ValueError
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="NotaTrilha deve ser um número entre 0.0 e 10.0"
                )
            aluno_trilha.NotaTrilha = nota_trilha

    session.add(aluno_trilha)
    session.commit()
    session.refresh(aluno_trilha)

    return {
        "IdAlunoTrilha": aluno_trilha.IdAlunoTrilha,
        "IdAluno": aluno_trilha.IdAluno,
        "IdTrilha": aluno_trilha.IdTrilha,
        "NotaTrilha": aluno_trilha.NotaTrilha,
    }


@router.delete("/{id_aluno}/trilhas/{id_trilha}")
def remover_trilha_aluno(
    id_aluno: str,
    id_trilha: str,
    usuario_logado: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ensure_admin(usuario_logado)

    aluno = session.get(Aluno, id_aluno)
    if not aluno:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")

    trilha = session.get(Trilha, id_trilha)
    if not trilha:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trilha não encontrada")

    aluno_trilha = session.exec(
        select(AlunoTrilha).where(
            and_(
                AlunoTrilha.IdAluno == id_aluno,
                AlunoTrilha.IdTrilha == id_trilha,
                AlunoTrilha.DeletedAt.is_(None),
            )
        )
    ).first()

    if not aluno_trilha:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associação entre aluno e trilha não encontrada"
        )

    aluno_trilha.DeletedAt = datetime.utcnow()
    session.add(aluno_trilha)
    session.commit()

    return {"status": "ok", "message": "Trilha removida do aluno"}
