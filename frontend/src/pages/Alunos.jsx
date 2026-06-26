import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Camera, Filter, ListFilter, Pencil, Plus, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/apiConfig';
import DeleteBehaviorField from '../components/DeleteBehaviorField';
import EntityHeader from '../components/EntityHeader';
import ListFilterDrawer from '../components/ListFilterDrawer';
import ListPagination, { DEFAULT_PAGE_SIZE } from '../components/ListPagination';
import notify from '../utils/notify';
import { buildFilterParams } from '../utils/filterParams';
import {
  buildLocalPhone,
  formatCep,
  formatCpf,
  formatDateBR,
  formatPhoneBR,
  maskDateBRInput,
  normalizeDateToIso,
  parsePhoneParts,
  toSortableDateValue,
} from '../utils/formatters';
import { resolveAlunoImageUrl } from '../utils/media';
import { DIAL_CODE_OPTIONS } from '../utils/dialCodes';

const FILTER_DEFS = [
  { key: 'nome', label: 'Nome Completo do Aluno(a)', param: 'nome_in' },
  { key: 'aluno_destaque', label: 'Aluno Destaque', param: 'aluno_destaque_in' },
  { key: 'email', label: 'E-mail', param: 'email_in' },
  { key: 'cpf', label: 'CPF', param: 'cpf_in' },
  { key: 'rg', label: 'RG', param: 'rg_in' },
  { key: 'data_nascimento', label: 'Data de Nascimento', param: 'data_nascimento_in' },
  { key: 'cidade_naturalidade', label: 'Cidade de Nascimento', param: 'cidade_naturalidade_in' },
  { key: 'sexo', label: 'Sexo', param: 'sexo_in' },
  { key: 'cor', label: 'Cor', param: 'cor_in' },
  { key: 'estado', label: 'Estado', param: 'estado_in' },
  { key: 'estado_naturalidade', label: 'Estado de naturalidade', param: 'estado_naturalidade_in' },
  { key: 'foto', label: 'Foto', param: 'foto_in' },
  { key: 'fone_celular_ddi', label: 'DDI', param: 'fone_celular_ddi_in' },
  { key: 'fone_celular_ddd', label: 'DDD', param: 'fone_celular_ddd_in' },
  { key: 'fone_celular_numero', label: 'Número do celular', param: 'fone_celular_numero_in' },
  { key: 'whatsapp', label: 'WhatsApp', param: 'whatsapp_in' },
  { key: 'cep_residencial', label: 'CEP', param: 'cep_residencial_in' },
  { key: 'rua_residencial', label: 'Rua Residencial', param: 'rua_residencial_in' },
  { key: 'num_residencial', label: 'Número Residencial', param: 'num_residencial_in' },
  { key: 'situacao', label: 'Situação', param: 'situacao_in' },
  { key: 'turno', label: 'Turno', param: 'turno_in' },
  { key: 'escola_ensino_medio', label: 'Escola Cursada Ensino Fundamental', param: 'escola_ensino_medio_in' },
  { key: 'escola_atual', label: 'Escola Atual', param: 'escola_atual_in' },
  { key: 'data_ingresso', label: 'Data de Ingresso', param: 'data_ingresso_in' },
  { key: 'data_conclusao', label: 'Data de Conclusão', param: 'data_conclusao_in' },
  { key: 'trabalho', label: 'Trabalho', param: 'trabalho_in' },
  { key: 'estagio', label: 'Estágio', param: 'estagio_in' },
  { key: 'empresa', label: 'Nome da empresa', param: 'empresa_in' },
  { key: 'funcao', label: 'Em qual função?', param: 'funcao_in' },
  { key: 'contente', label: 'Está satisfeito no trabalho?', param: 'contente_in' },
  { key: 'setor', label: 'Setor', param: 'setor_in' },
  { key: 'cidade', label: 'Cidade', param: 'cidade_in' },
  { key: 'bairro', label: 'Bairro', param: 'bairro_in' },
  { key: 'complemento_residencial', label: 'Complemento Residencial', param: 'complemento_residencial_in' },
  { key: 'pais', label: 'País', param: 'pais_in' },
  { key: 'nacionalidade', label: 'Nacionalidade', param: 'nacionalidade_in' },
  { key: 'naturalidade', label: 'Naturalidade', param: 'naturalidade_in' },
  { key: 'turma', label: 'Turma', param: 'turma_in' },
 
];

const FILTER_DEF_MAP = FILTER_DEFS.reduce((accumulator, item) => {
  accumulator[item.key] = item;
  return accumulator;
}, {});

const YES_NO_OPTIONS = ['Sim', 'Não'];
const PRESENCA_OPTIONS = ['Presente', 'Ausente'];
const SITUACAO_OPTIONS = ['Em Aberto', 'Inativo', 'Concluído', 'Trancado', 'Cancelado'];
const DEFAULT_TURNO_OPTIONS = ['Manhã', 'Tarde', 'Noite'];
const RELATED_SECTION_LABELS = {
  chamadas: 'Chamadas Relacionadas',
  avaliacoes: 'Avaliações Relacionadas',
  matriculas: 'Matrículas Relacionadas',
  interesses: 'Interesses Relacionados',
  trilhas: 'Trilhas Relacionadas',
};
const CREATE_INTERESSE_OPTION = '__create_new_interesse__';
const CREATE_TRILHA_OPTION = '__create_new_trilha__';

const createEmptyAluno = () => ({
  id_aluno: '',
  imagem: '',
  nome: '',
  aluno_destaque: false,
  descricao_destaque: '',
  email: '',
  data_nascimento: '',
  sexo: '',
  cor: '',
  cidade_naturalidade: '',
  estado_naturalidade: '',
  naturalidade: '',
  nacionalidade: '',
  rg: '',
  cpf: '',
  fone_celular: '',
  fone_celular_ddi: '55',
  fone_celular_ddd: '',
  fone_celular_numero: '',
  whatsapp: false,
  endereco: '',
  cidade: '',
  estado: '',
  pais: '',
  rua_residencial: '',
  num_residencial: '',
  bairro_residencial: '',
  complemento_residencial: '',
  pai: '',
  mae: '',
  escola_ensino_medio: '',
  escola_atual: '',
  cep_residencial: '',
  id_turma: '',
  nome_turma: '',
  situacao: '',
  turno: '',
  setor: '',
  data_ingresso: '',
  data_conclusao: '',
  trabalho: '',
  estagio: '',
  empresa: '',
  funcao: '',
  contente: '',
  motivo: '',
  ativo: true,
  cursos_atuais: [],
  matriculas_relacionadas: [],
  chamadas_relacionadas: [],
  avaliacoes_relacionadas: [],
  interesses: [],
  trilhas: [],
  totais_relacionados: { total_aulas: 0, presencas: 0, faltas: 0 },
});

const ALUNO_FORM_FEEDBACK_ID = 'aluno-form-feedback';
const ALUNOS_TABLE_COLUMN_COUNT = 15;
const REQUIRED_ALUNO_FIELDS = [
  { key: 'nome', label: 'Nome completo do aluno(a)' },
  { key: 'email', label: 'E-mail' },
  { key: 'id_turma', label: 'Turma de ingresso' },
  { key: 'data_nascimento', label: 'Data de Nascimento' },
  { key: 'cidade_naturalidade', label: 'Cidade de Nascimento' },
  { key: 'fone_celular_ddd', label: 'DDD' },
  { key: 'fone_celular_numero', label: 'Número do celular' },
  { key: 'escola_ensino_medio', label: 'Escola Cursada Ensino Fundamental' },
  { key: 'escola_atual', label: 'Escola Atual' },
  { key: 'turno', label: 'Turno' },
  { key: 'situacao', label: 'Situação' },
];

const normalizeBoolChoice = (value) => String(value || '').trim().toLowerCase() === 'sim';
const normalizeText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const getAlunoInitials = (name) => {
  if (!name) return 'A';
  const parts = String(name).trim().split(' ').filter(Boolean);
  if (!parts.length) return 'A';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
};

const sanitizePersistedMediaValue = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.startsWith('data:')) return null;
  return normalized;
};

const getAlunoFormFeedbackNode = () => {
  if (typeof document === 'undefined') return null;
  return document.getElementById(ALUNO_FORM_FEEDBACK_ID);
};

const clearAlunoFormFeedback = () => {
  const feedbackNode = getAlunoFormFeedbackNode();
  if (!feedbackNode) return;
  feedbackNode.textContent = '';
  feedbackNode.className = 'form-feedback';
};

const isValidIsoDate = (value) => {
  if (!value) return false;
  const parts = String(value).split('-').map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return false;
  const [year, month, day] = parts;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
};

const getAlunoValidationIssues = (draft) => {
  const issues = REQUIRED_ALUNO_FIELDS.filter(({ key }) => !String(draft?.[key] || '').trim());
  const normalizedBirthDate = normalizeDateToIso(draft?.data_nascimento);

  if (draft?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(draft.email).trim())) {
    issues.push({ key: 'email', label: 'E-mail válido' });
  }

  if (draft?.data_nascimento && !isValidIsoDate(normalizedBirthDate)) {
    issues.push({ key: 'data_nascimento', label: 'Data de Nascimento válida' });
  }

  if ((normalizeBoolChoice(draft?.trabalho) || normalizeBoolChoice(draft?.estagio)) && !String(draft?.funcao || '').trim()) {
    issues.push({ key: 'funcao', label: 'Em qual função?' });
  }

  return issues;
};

const getAlunoValidationMessage = (issues) => {
  const labels = issues.map((issue) => issue.label);
  if (!labels.length) return '';
  if (labels.length === 1) return `Preencha o campo obrigatório: ${labels[0]}.`;
  return `Preencha os campos obrigatórios: ${labels.join(', ')}.`;
};

const parseTrilhaNotaInput = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const normalizedValue = Number(String(value).replace(',', '.'));
  if (Number.isNaN(normalizedValue) || normalizedValue < 0 || normalizedValue > 10) {
    throw new Error('Nota da trilha deve ser um número entre 0,00 e 10,00.');
  }
  return Number(normalizedValue.toFixed(2));
};

const buildAlunoPayload = (draft) => ({
  Imagem: draft.imagem || null,
  NomeAluno: draft.nome,
  AlunoDestaque: !!draft.aluno_destaque,
  DescricaoDestaque: draft.descricao_destaque || null,
  Email: draft.email || null,
  DataNascimento: normalizeDateToIso(draft.data_nascimento),
  Sexo: draft.sexo || null,
  Cor: draft.cor || null,
  CidadeNaturalidade: draft.cidade_naturalidade || null,
  RG: draft.rg || null,
  CPF: draft.cpf ? String(draft.cpf).replace(/\D/g, '') : null,
  FoneCelular: buildLocalPhone({ ddd: draft.fone_celular_ddd, number: draft.fone_celular_numero }) || null,
  FoneCelularDDI: draft.fone_celular_ddi || null,
  FoneCelularDDD: draft.fone_celular_ddd || null,
  FoneCelularNumero: draft.fone_celular_numero || null,
  WhatsApp: !!draft.whatsapp,
  Endereco: draft.endereco || null,
  CidadeResidencial: draft.cidade || null,
  Estado: draft.estado || null,
  Pais: draft.pais || null,
  RuaResidencial: draft.rua_residencial || null,
  NumResidencial: draft.num_residencial || null,
  BairroResidencial: draft.bairro_residencial || null,
  ComplementoResidencial: draft.complemento_residencial || null,
  Pai: draft.pai || null,
  Mae: draft.mae || null,
  EscolaEnsinoMedio: draft.escola_ensino_medio || null,
  EscolaAtual: draft.escola_atual || null,
  CepResidencial: draft.cep_residencial ? String(draft.cep_residencial).replace(/\D/g, '') : null,
  IdTurma: draft.id_turma || null,
  Turno: draft.turno || null,
  Setor: draft.setor || null,
  DataIngresso: normalizeDateToIso(draft.data_ingresso),
  DataConclusao: normalizeDateToIso(draft.data_conclusao),
  Trabalho: draft.trabalho || null,
  Estagio: draft.estagio || null,
  Situacao: draft.situacao || null,
  Empresa: normalizeBoolChoice(draft.trabalho) || normalizeBoolChoice(draft.estagio) ? draft.empresa || null : null,
  Funcao: normalizeBoolChoice(draft.trabalho) || normalizeBoolChoice(draft.estagio) ? draft.funcao || null : null,
  Contente: normalizeBoolChoice(draft.trabalho) ? draft.contente || null : null,
  Motivo: (normalizeBoolChoice(draft.trabalho) && normalizeText(draft.contente) === 'nao') || ['cancelado', 'inativo', 'trancado'].includes(normalizeText(draft.situacao))
    ? draft.motivo || null
    : null,
  Ativo: draft.ativo !== false,
});

const normalizePagedResponse = (data, pageFallback = 1) => {
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: pageFallback };
  }
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
      ? data.data
      : [];
  return {
    items,
    total: Number(data?.total ?? items.length ?? 0),
    page: Number(data?.page ?? pageFallback),
  };
};

const normalizeAlunoRow = (row) => {
  const phoneParts = parsePhoneParts(row.fone_celular || row.FoneCelular || '', row.fone_celular_ddi || row.FoneCelularDDI || '55');
  return {
    id_aluno: row.id_aluno || row.IdAluno || '',
    imagem: row.imagem || row.Imagem || '',
    nome: row.nome || row.NomeAluno || '',
    aluno_destaque: Boolean(row.aluno_destaque ?? row.AlunoDestaque),
    descricao_destaque: row.descricao_destaque || row.DescricaoDestaque || '',
    email: row.email || row.Email || '',
    data_nascimento: String(row.data_nascimento || row.DataNascimento || '').split('T')[0],
    sexo: row.sexo || row.Sexo || '',
    cor: row.cor || row.Cor || '',
    cidade_naturalidade: row.cidade_naturalidade || row.CidadeNaturalidade || '',
    estado_naturalidade: row.estado_naturalidade || row.EstadoNaturalidade || '',
    naturalidade: row.naturalidade || row.Naturalidade || row.cidade_naturalidade || row.CidadeNaturalidade || '',
    nacionalidade: row.nacionalidade || row.Nacionalidade || '',
    rg: row.rg || row.RG || '',
    cpf: row.cpf || row.CPF || '',
    fone_celular: row.fone_celular || row.FoneCelular || '',
    fone_celular_ddi: row.fone_celular_ddi || row.FoneCelularDDI || phoneParts.ddi,
    fone_celular_ddd: row.fone_celular_ddd || row.FoneCelularDDD || phoneParts.ddd,
    fone_celular_numero: row.fone_celular_numero || row.FoneCelularNumero || phoneParts.number,
    whatsapp: Boolean(row.whatsapp ?? row.WhatsApp),
    endereco: row.endereco || row.Endereco || '',
    cidade: row.cidade || row.CidadeResidencial || '',
    estado: row.estado || row.Estado || '',
    pais: row.pais || row.Pais || '',
    rua_residencial: row.rua_residencial || row.RuaResidencial || '',
    num_residencial: row.num_residencial || row.NumResidencial || '',
    bairro_residencial: row.bairro_residencial || row.BairroResidencial || '',
    complemento_residencial: row.complemento_residencial || row.ComplementoResidencial || '',
    pai: row.pai || row.Pai || '',
    mae: row.mae || row.Mae || '',
    escola_ensino_medio: row.escola_ensino_medio || row.EscolaEnsinoMedio || '',
    escola_atual: row.escola_atual || row.EscolaAtual || '',
    cep_residencial: row.cep_residencial || row.CepResidencial || '',
    id_turma: row.id_turma || row.IdTurma || '',
    nome_turma: row.nome_turma || row.NomeTurma || row.nomeTurma || '',
    situacao: row.situacao || row.Situacao || '',
    turno: row.turno || row.Turno || '',
    setor: row.setor || row.Setor || '',
    data_ingresso: formatDateBR(row.data_ingresso || row.DataIngresso || ''),
    data_conclusao: formatDateBR(row.data_conclusao || row.DataConclusao || ''),
    trabalho: row.trabalho || row.Trabalho || '',
    estagio: row.estagio || row.Estagio || '',
    empresa: row.empresa || row.Empresa || '',
    funcao: row.funcao || row.Funcao || '',
    contente: row.contente || row.Contente || '',
    motivo: row.motivo || row.Motivo || '',
    ativo: row.ativo !== false,
    cursos_atuais: row.cursos_atuais || row.CursosAtuais || [],
    matriculas_relacionadas: row.matriculas_relacionadas || row.MatriculasRelacionadas || [],
    chamadas_relacionadas: row.chamadas_relacionadas || row.ChamadasRelacionadas || [],
    avaliacoes_relacionadas: row.avaliacoes_relacionadas || row.AvaliacoesRelacionadas || [],
    interesses: row.interesses || row.Interesses || [],
    trilhas: row.trilhas || row.Trilhas || [],
    totais_relacionados: row.totais_relacionados || row.TotaisRelacionados || { total_aulas: 0, presencas: 0, faltas: 0 },
  };
};

const normalizeFormOptions = (data) => ({
  turnos: Array.isArray(data?.turnos) && data.turnos.length ? data.turnos : DEFAULT_TURNO_OPTIONS,
  turmas: Array.isArray(data?.turmas) ? data.turmas : [],
  situacoes: Array.isArray(data?.situacoes) && data.situacoes.length ? data.situacoes : SITUACAO_OPTIONS,
  escolasEnsinoMedio: Array.isArray(data?.escolas_ensino_medio) ? data.escolas_ensino_medio : [],
  escolasAtuais: Array.isArray(data?.escolas_atuais) ? data.escolas_atuais : [],
});

const normalizeTrilhaOptionRow = (row) => ({
  IdTrilha: row?.IdTrilha || row?.id_trilha || row?.id || '',
  NomeTrilha: row?.NomeTrilha || row?.nome_trilha || row?.nome || '',
  QtdCursos: row?.QtdCursos ?? row?.qtd_cursos ?? 0,
  ativo: row?.ativo !== false,
});

const normalizeAlunoTrilhaRow = (row, fallbackAlunoId = '') => ({
  IdAlunoTrilha: row?.IdAlunoTrilha || row?.id_aluno_trilha || '',
  IdAluno: row?.IdAluno || row?.id_aluno || fallbackAlunoId,
  IdTrilha: row?.IdTrilha || row?.id_trilha || '',
  NotaTrilha: row?.NotaTrilha ?? row?.nota_trilha ?? '',
});

const normalizeInteresseOptionRow = (row) => ({
  id: row?.id || row?.IdInteresse || row?.id_interesse || '',
  nome: row?.nome || row?.Descricao || row?.descricao || '',
});

const normalizeAlunoInteresseRow = (row, fallbackAlunoId = '') => ({
  IdAlunoInteresse: row?.IdAlunoInteresse || row?.id_aluno_interesse || '',
  IdAluno: row?.IdAluno || row?.id_aluno || fallbackAlunoId,
  IdInteresse: row?.IdInteresse || row?.id_interesse || '',
  DescricaoInteresse: row?.DescricaoInteresse || row?.descricao_interesse || row?.Descricao || row?.descricao || '',
});

const getPresenceMeta = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const isPresent = ['presente', 'sim', 'p', 'true', '1'].includes(normalized);
  return {
    Icon: isPresent ? ThumbsUp : ThumbsDown,
    className: isPresent ? 'status-positive' : 'status-negative',
  };
};

const getNotaMeta = (value) => {
  const nota = Number(value);
  const positive = !Number.isNaN(nota) && nota >= 7;
  return {
    Icon: positive ? ThumbsUp : ThumbsDown,
    className: positive ? 'status-positive' : 'status-negative',
  };
};

const FILTER_OPTION_VALUE_GETTERS = {
  nome: (row) => row.nome,
  aluno_destaque: (row) => (row.aluno_destaque ? 'Sim' : 'Não'),
  email: (row) => row.email,
  cpf: (row) => row.cpf,
  rg: (row) => row.rg,
  data_nascimento: (row) => row.data_nascimento,
  cidade_naturalidade: (row) => row.cidade_naturalidade,
  sexo: (row) => row.sexo,
  cor: (row) => row.cor,
  estado: (row) => row.estado,
  estado_naturalidade: (row) => row.estado_naturalidade,
  foto: (row) => (row.imagem ? 'Com foto' : 'Sem foto'),
  fone_celular_ddi: (row) => row.fone_celular_ddi,
  fone_celular_ddd: (row) => row.fone_celular_ddd,
  fone_celular_numero: (row) => row.fone_celular_numero,
  whatsapp: (row) => (row.whatsapp ? 'Sim' : 'Não'),
  cep_residencial: (row) => row.cep_residencial,
  rua_residencial: (row) => row.rua_residencial,
  num_residencial: (row) => row.num_residencial,
  situacao: (row) => row.situacao,
  turno: (row) => row.turno,
  escola_ensino_medio: (row) => row.escola_ensino_medio,
  escola_atual: (row) => row.escola_atual,
  data_ingresso: (row) => row.data_ingresso,
  data_conclusao: (row) => row.data_conclusao,
  trabalho: (row) => row.trabalho,
  estagio: (row) => row.estagio,
  empresa: (row) => row.empresa,
  funcao: (row) => row.funcao,
  contente: (row) => row.contente,
  setor: (row) => row.setor,
  cidade: (row) => row.cidade,
  bairro: (row) => row.bairro_residencial,
  complemento_residencial: (row) => row.complemento_residencial,
  pais: (row) => row.pais,
  nacionalidade: (row) => row.nacionalidade,
  naturalidade: (row) => row.naturalidade,
  turma: (row) => row.nome_turma,
 
};

const sortFilterOptionValues = (values) => [...values].sort((left, right) => (
  String(left).localeCompare(String(right), 'pt-BR', { numeric: true, sensitivity: 'base' })
));

const buildAlunoFilterOptions = (rows) => {
  const buckets = Object.keys(FILTER_OPTION_VALUE_GETTERS).reduce((accumulator, key) => {
    accumulator[key] = new Set();
    return accumulator;
  }, {});

  rows.forEach((row) => {
    Object.entries(FILTER_OPTION_VALUE_GETTERS).forEach(([key, getValue]) => {
      const normalizedValue = String(getValue(row) || '').trim();
      if (normalizedValue) buckets[key].add(normalizedValue);
    });
  });

  return Object.entries(buckets).reduce((accumulator, [key, values]) => {
    accumulator[key] = sortFilterOptionValues(Array.from(values));
    return accumulator;
  }, {});
};

const mergeFilterOptions = (...optionGroups) => {
  const merged = {};

  optionGroups.forEach((group) => {
    Object.entries(group || {}).forEach(([key, values]) => {
      merged[key] = sortFilterOptionValues(Array.from(new Set([...(merged[key] || []), ...((values || []).filter(Boolean))])));
    });
  });

  return merged;
};

const mergeMissingFilterOptions = (preferredOptions = {}, fallbackOptions = {}) => {
  const mergedOptions = FILTER_DEFS.reduce((accumulator, filterDef) => {
  const preferredValues = preferredOptions[filterDef.key] || [];
  accumulator[filterDef.key] = preferredValues.length ? preferredValues : (fallbackOptions[filterDef.key] || []);
  return accumulator;
  }, {});

  const allExtraKeys = new Set([
    ...Object.keys(preferredOptions || {}),
    ...Object.keys(fallbackOptions || {}),
  ]);

  allExtraKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(mergedOptions, key)) return;
    const preferredValues = preferredOptions[key] || [];
    mergedOptions[key] = preferredValues.length ? preferredValues : (fallbackOptions[key] || []);
  });

  return mergedOptions;
};

const mergeSelectOptions = (...optionGroups) => Array.from(new Set(
  optionGroups
    .flatMap((group) => (Array.isArray(group) ? group : [group]))
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
)).sort((left, right) => left.localeCompare(right, 'pt-BR', { numeric: true, sensitivity: 'base' }));

const composeEndereco = (draft) => [
  draft?.rua_residencial,
  draft?.num_residencial,
  draft?.complemento_residencial,
  draft?.bairro_residencial,
  draft?.cidade,
  draft?.estado,
  formatCep(draft?.cep_residencial || ''),
  draft?.pais,
].map((value) => String(value || '').trim()).filter(Boolean).join(', ');

const getAlunoSortValue = (item, field) => {
  switch (field) {
    case 'imagem':
      return item.imagem || '';
    case 'nome':
      return item.nome || '';
    case 'aluno_destaque':
      return item.aluno_destaque ? '1' : '0';
    case 'descricao_destaque':
      return item.descricao_destaque || '';
    case 'situacao':
      return item.situacao || '';
    case 'cursos_atuais':
      return (item.cursos_atuais || []).join(', ');
    case 'turma':
      return item.nome_turma || '';
    case 'turno':
      return item.turno || '';
    case 'setor':
      return item.setor || '';
    case 'data_ingresso':
      return item.data_ingresso || '';
    case 'data_conclusao':
      return item.data_conclusao || '';
    case 'interesses':
      return (item.interesses || []).join(', ');
    default:
      return item.nome || '';
  }
};

const sortAlunos = (rows, field, direction) => [...rows].sort((left, right) => {
  const leftValue = getAlunoSortValue(left, field);
  const rightValue = getAlunoSortValue(right, field);

  const leftDate = field.startsWith('data_') ? Date.parse(leftValue || '') : Number.NaN;
  const rightDate = field.startsWith('data_') ? Date.parse(rightValue || '') : Number.NaN;

  let comparison = 0;
  if (field.startsWith('data_')) {
    comparison = toSortableDateValue(leftValue) - toSortableDateValue(rightValue);
  } else {
    comparison = String(leftValue || '').localeCompare(String(rightValue || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  return direction === 'desc' ? comparison * -1 : comparison;
});

export default function AlunosPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const relatedSectionRefs = useRef({});
  const pendingPhotoPreviewRef = useRef(null);
  const formRef = useRef(null);
  const handledEditParamRef = useRef('');
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('nome');
  const [sortDir, setSortDir] = useState('asc');
  const [serverFilterOptions, setServerFilterOptions] = useState({});
  const [selectedFilterField, setSelectedFilterField] = useState(FILTER_DEFS[0].key);
  const [selectedFilterValue, setSelectedFilterValue] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [showInativos, setShowInativos] = useState(false);
  const [showSelection, setShowSelection] = useState(false);
  const [groupByTurma, setGroupByTurma] = useState(false);
  const [panelMode, setPanelMode] = useState(null);
  const [editingAluno, setEditingAluno] = useState(null);
  const [newAluno, setNewAluno] = useState(createEmptyAluno());
  const [selectedIds, setSelectedIds] = useState([]);
  const [formOptions, setFormOptions] = useState({ turnos: DEFAULT_TURNO_OPTIONS, turmas: [], situacoes: SITUACAO_OPTIONS, escolasEnsinoMedio: [], escolasAtuais: [] });
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [expandedRelatedSection, setExpandedRelatedSection] = useState(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState('');
  const [brokenMediaUrls, setBrokenMediaUrls] = useState({});
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [lastCepLookup, setLastCepLookup] = useState('');
  const [trilhaOptions, setTrilhaOptions] = useState([]);
  const [loadingTrilhas, setLoadingTrilhas] = useState(false);
  const [savingTrilhaId, setSavingTrilhaId] = useState('');
  const [newTrilhaLink, setNewTrilhaLink] = useState({ IdTrilha: '', NotaTrilha: '' });
  const [interesseOptions, setInteresseOptions] = useState([]);
  const [alunoInteresseLinks, setAlunoInteresseLinks] = useState([]);
  const [loadingInteresses, setLoadingInteresses] = useState(false);
  const [savingInteresseId, setSavingInteresseId] = useState('');
  const [newInteresseId, setNewInteresseId] = useState('');
  const [relatedCreatePanel, setRelatedCreatePanel] = useState(null);
  const [newInteresseDescricao, setNewInteresseDescricao] = useState('');
  const [newTrilhaNome, setNewTrilhaNome] = useState('');
  const [newTrilhaDescricao, setNewTrilhaDescricao] = useState('');
  const [chamadaFormOptions, setChamadaFormOptions] = useState({ aulas: [], matriculas: [], presencas: [] });
  const [savingChamada, setSavingChamada] = useState(false);
  const [newChamadaLink, setNewChamadaLink] = useState({ Data: '', Presenca: 'Presente', Aula: '', IdMatricula: '' });

  const currentAluno = panelMode === 'edit' ? (editingAluno || createEmptyAluno()) : newAluno;
  const needsLocalFilterFallback = useMemo(() => FILTER_DEFS.some(({ key }) => !(serverFilterOptions[key] || []).length), [serverFilterOptions]);
  const localFilterOptions = useMemo(() => (needsLocalFilterFallback ? buildAlunoFilterOptions(items) : {}), [items, needsLocalFilterFallback]);
  const filterOptions = useMemo(() => mergeMissingFilterOptions(serverFilterOptions, localFilterOptions), [serverFilterOptions, localFilterOptions]);

  const turmaOptions = formOptions.turmas || [];
  const turnoOptions = formOptions.turnos || DEFAULT_TURNO_OPTIONS;
  const situacaoOptions = formOptions.situacoes || SITUACAO_OPTIONS;
  const escolasEnsinoMedioOptions = formOptions.escolasEnsinoMedio || [];
  const escolasAtuaisOptions = formOptions.escolasAtuais || [];
  const escolaEnsinoMedioSelectOptions = mergeSelectOptions(escolasEnsinoMedioOptions, currentAluno.escola_ensino_medio);
  const escolaAtualSelectOptions = mergeSelectOptions(escolasAtuaisOptions, currentAluno.escola_atual);
  const cidadeNascimentoOptions = mergeSelectOptions(
    filterOptions.cidade_naturalidade,
    filterOptions.naturalidade,
    items.map((item) => item.cidade_naturalidade),
    currentAluno.cidade_naturalidade,
  );
  const setorSelectOptions = mergeSelectOptions(filterOptions.setor, items.map((item) => item.setor), currentAluno.setor);
  const alunoValidationIssues = useMemo(() => getAlunoValidationIssues(currentAluno), [currentAluno]);
  const currentPhotoPreview = pendingPhotoPreview || resolveAlunoImageUrl(currentAluno.imagem);
  const hasAlunoPhoto = Boolean(currentPhotoPreview);
  const alunoPhotoActionLabel = hasAlunoPhoto ? 'Trocar foto' : 'Nova foto';

  const resetPanelState = () => {
    clearAlunoFormFeedback();
    setEditingAluno(null);
    setPanelMode(null);
    setExpandedRelatedSection(null);
    setInteresseOptions([]);
    setAlunoInteresseLinks([]);
    setNewInteresseId('');
    setRelatedCreatePanel(null);
    setNewChamadaLink({ Data: '', Presenca: 'Presente', Aula: '', IdMatricula: '' });
    resetPendingPhoto();
  };

  const getExpandedSectionBreadcrumb = () => {
    if (!expandedRelatedSection) return null;
    const count = Array.isArray(currentAluno?.[`${expandedRelatedSection}_relacionadas`])
      ? currentAluno[`${expandedRelatedSection}_relacionadas`].length
      : expandedRelatedSection === 'interesses'
        ? (alunoInteresseLinks.length || (currentAluno?.interesses || []).length)
        : expandedRelatedSection === 'trilhas'
          ? (currentAluno?.trilhas || []).length
        : 0;

    if (expandedRelatedSection === 'avaliacoes' || expandedRelatedSection === 'matriculas') {
      return `${RELATED_SECTION_LABELS[expandedRelatedSection]} ${count || 0}`;
    }

    return RELATED_SECTION_LABELS[expandedRelatedSection] || null;
  };

  const resetPendingPhoto = () => {
    if (pendingPhotoPreviewRef.current) {
      URL.revokeObjectURL(pendingPhotoPreviewRef.current);
      pendingPhotoPreviewRef.current = null;
    }
    setPendingPhotoFile(null);
    setPendingPhotoPreview('');
  };

  const markMediaUrlAsBroken = (url) => {
    if (!url) return;
    setBrokenMediaUrls((previous) => (previous[url] ? previous : { ...previous, [url]: true }));
  };

  useEffect(() => () => {
    if (pendingPhotoPreviewRef.current) {
      URL.revokeObjectURL(pendingPhotoPreviewRef.current);
      pendingPhotoPreviewRef.current = null;
    }
  }, []);

  const fetchFormOptions = async () => {
    try {
      const response = await api.get('/alunos/form-options');
      setFormOptions(normalizeFormOptions(response.data));
    } catch (error) {
      try {
        const fallbackResponse = await api.get('/turmas/', { params: { page: 1, per_page: 5000, sort_by: 'nome', sort_dir: 'asc' } });
        const fallbackItems = normalizePagedResponse(fallbackResponse.data).items || [];
        setFormOptions({
          turnos: DEFAULT_TURNO_OPTIONS,
          turmas: fallbackItems.map((item) => ({ id: item.id_turma, nome: item.nome })).filter((item) => item.id && item.nome),
          situacoes: SITUACAO_OPTIONS,
          escolasEnsinoMedio: [],
          escolasAtuais: [],
        });
      } catch (fallbackError) {
        setFormOptions({ turnos: DEFAULT_TURNO_OPTIONS, turmas: [], situacoes: SITUACAO_OPTIONS, escolasEnsinoMedio: [], escolasAtuais: [] });
      }
    }
  };

  const fetchTrilhaOptions = async () => {
    try {
      const response = await api.get('/trilhas/', {
        params: {
          page: 1,
          per_page: 5000,
          sort_by: 'nome_trilha',
          sort_dir: 'asc',
        },
      });
      const normalized = normalizePagedResponse(response.data, 1);
      setTrilhaOptions((normalized.items || []).map((item) => normalizeTrilhaOptionRow(item)).filter((item) => item.IdTrilha));
    } catch (error) {
      console.error(error);
      setTrilhaOptions([]);
    }
  };

  const fetchInteresseOptions = async () => {
    try {
      const response = await api.get('/interesses/', {
        params: {
          page: 1,
          per_page: 5000,
          sort_by: 'descricao',
          sort_dir: 'asc',
        },
      });
      const normalized = normalizePagedResponse(response.data, 1);
      setInteresseOptions(
        (normalized.items || [])
          .map((item) => normalizeInteresseOptionRow(item))
          .filter((item) => item.id && item.nome)
      );
    } catch (error) {
      console.error(error);
      setInteresseOptions([]);
    }
  };

  const fetchChamadaFormOptions = async () => {
    try {
      const response = await api.get('/chamadas/form-options');
      setChamadaFormOptions({
        aulas: Array.isArray(response.data?.aulas) ? response.data.aulas : [],
        matriculas: Array.isArray(response.data?.matriculas) ? response.data.matriculas : [],
        presencas: Array.isArray(response.data?.presencas) ? response.data.presencas : [],
      });
    } catch (error) {
      console.error(error);
      setChamadaFormOptions({ aulas: [], matriculas: [], presencas: [] });
    }
  };

  const fetchAlunoTrilhas = async (idAluno) => {
    if (!idAluno) return;
    setLoadingTrilhas(true);
    try {
      const response = await api.get(`/alunos/${idAluno}/trilhas`);
      const rows = Array.isArray(response.data?.items) ? response.data.items : [];
      setEditingAluno((previous) => {
        if (!previous || previous.id_aluno !== idAluno) return previous;
        return {
          ...previous,
          trilhas: rows.map((item) => normalizeAlunoTrilhaRow(item, idAluno)).filter((item) => item.IdTrilha),
        };
      });
    } catch (error) {
      console.error(error);
      setEditingAluno((previous) => {
        if (!previous || previous.id_aluno !== idAluno) return previous;
        return { ...previous, trilhas: [] };
      });
    } finally {
      setLoadingTrilhas(false);
    }
  };

  const fetchAlunoInteresses = async (idAluno) => {
    if (!idAluno) return;
    setLoadingInteresses(true);
    try {
      const [linksResponse, optionsResponse] = await Promise.all([
        api.get('/alunos-interesses/', {
          params: {
            page: 1,
            per_page: 5000,
            id_aluno: idAluno,
            include_inativos: false,
          },
        }),
        api.get('/alunos-interesses/form-options', {
          params: {
            aluno_id: idAluno,
          },
        }),
      ]);

      const rows = Array.isArray(linksResponse?.data?.items) ? linksResponse.data.items : [];
      const normalizedRows = rows
        .map((item) => normalizeAlunoInteresseRow(item, idAluno))
        .filter((item) => item.IdAluno === idAluno && item.IdInteresse);

      const rawOptions = Array.isArray(optionsResponse?.data?.interesses) ? optionsResponse.data.interesses : [];
      const normalizedOptions = rawOptions
        .map((item) => normalizeInteresseOptionRow(item))
        .filter((item) => item.id && item.nome);

      setAlunoInteresseLinks(normalizedRows);
      setInteresseOptions(normalizedOptions);
    } catch (error) {
      console.error(error);
      setAlunoInteresseLinks([]);
      setInteresseOptions([]);
    } finally {
      setLoadingInteresses(false);
    }
  };

  const handleCepLookup = async (rawCep) => {
    const normalizedCep = String(rawCep || '').replace(/\D/g, '').slice(0, 8);
    if (normalizedCep.length !== 8 || normalizedCep === lastCepLookup) return;
    setCepLookupLoading(true);
    try {
      const response = await api.get('/alunos/cep-lookup', { params: { cep: normalizedCep } });
      const address = response.data?.item || {};
      const nextAddress = {
        rua_residencial: address.rua_residencial || '',
        bairro_residencial: address.bairro_residencial || '',
        cidade: address.cidade || '',
        estado: address.estado || '',
        pais: address.pais || '',
        cep_residencial: address.cep || normalizedCep,
      };
      const applyAddress = (previous) => ({
        ...(previous || createEmptyAluno()),
        ...nextAddress,
        endereco: composeEndereco({ ...(previous || createEmptyAluno()), ...nextAddress }) || previous?.endereco || '',
      });

      if (panelMode === 'edit') setEditingAluno((previous) => applyAddress(previous));
      else setNewAluno((previous) => applyAddress(previous));

      setLastCepLookup(normalizedCep);
    } catch (error) {
      console.error(error);
    } finally {
      setCepLookupLoading(false);
    }
  };

  const fetchAlunoDetails = async (idAluno) => {
    if (!idAluno) return;
    setLoadingDetails(true);
    try {
      const response = await api.get(`/alunos/${idAluno}/details`);
      const detailedAluno = normalizeAlunoRow(response.data?.item || {});
      setEditingAluno((previous) => ({ ...(previous || createEmptyAluno()), ...detailedAluno }));
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchAlunos = async (pageToFetch = page, perPage = pageSize, q = query, filters = activeFilters) => {
    setLoading(true);
    try {
      // MÁGICA AQUI: Clonamos os filtros para forçar a busca de INATIVOS vs ATIVOS
      // sem precisar sujar a UI ou criar botões complexos. 
      const appliedFilters = { ...filters };
      if (showInativos) {
        appliedFilters.ativo = ['Inativo']; // Força a buscar SOMENTE inativos
      } else {
        appliedFilters.ativo = ['Ativo']; // Força a buscar SOMENTE ativos
      }

      const filterParams = buildFilterParams(appliedFilters, FILTER_DEF_MAP);

      const response = await api.get('/alunos', {
        params: {
          page: pageToFetch,
          per_page: perPage,
          q,
          include_inativos: showInativos, // Se a check estiver marcada, permite buscar inativos no DB
          sort_by: 'nome',
          sort_dir: 'asc',
          ...filterParams,
        },
      });
      const normalized = normalizePagedResponse(response.data, pageToFetch);
      setItems(normalized.items.map((item) => normalizeAlunoRow(item)));
      setTotal(normalized.total);
      setPage(normalized.page);
    } catch (error) {
      console.error(error);
      setItems([]);
      setTotal(0);
      notify('Erro ao buscar alunos', { duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const response = await api.get('/alunos/filter-options', { params: { include_inativos: showInativos } });
      const options = (response.data || {}).options || {};
      setServerFilterOptions(mergeFilterOptions(options));
    } catch (error) {
      setServerFilterOptions({});
    }
  };

  useEffect(() => {
    fetchFormOptions();
    fetchChamadaFormOptions();
    fetchTrilhaOptions();
    fetchFilterOptions();
    fetchAlunos(1, DEFAULT_PAGE_SIZE, '', {});
  }, []);

  useEffect(() => {
    fetchFilterOptions();
  }, [showInativos]);

  useEffect(() => {
    fetchAlunos(page, pageSize, query, activeFilters);
  }, [page, pageSize, query, activeFilters, showInativos]);

  useEffect(() => {
    if (panelMode !== 'edit' || !currentAluno.id_aluno) return;
    fetchAlunoTrilhas(currentAluno.id_aluno);
    fetchAlunoInteresses(currentAluno.id_aluno);
  }, [panelMode, currentAluno.id_aluno]);

  const activeFilterChips = Object.entries(activeFilters).flatMap(([fieldKey, values]) => (
    (values || []).map((value) => ({ fieldKey, value, label: FILTER_DEF_MAP[fieldKey]?.label || fieldKey }))
  ));
  const activeFilterCount = activeFilterChips.length;

  const selectableValues = filterOptions[selectedFilterField] || [];
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const rangeStart = total ? ((page - 1) * pageSize) + 1 : 0;
  const rangeEnd = total ? Math.min(page * pageSize, total) : 0;
  const shouldShowEmpresa = normalizeBoolChoice(currentAluno.trabalho) || normalizeBoolChoice(currentAluno.estagio);
  const shouldShowSatisfacao = normalizeBoolChoice(currentAluno.trabalho);
  const isSituationReasonRequired = ['cancelado', 'inativo', 'trancado'].includes(normalizeText(currentAluno.situacao));
  const isWorkReasonRequired = shouldShowSatisfacao && normalizeText(currentAluno.contente) === 'nao';
  const shouldShowMotivo = isSituationReasonRequired || isWorkReasonRequired;
  const bulkCountLabel = useMemo(() => `${selectedIds.length} selecionado(s)`, [selectedIds]);
  const sortedItems = useMemo(() => sortAlunos(items, sortBy, sortDir), [items, sortBy, sortDir]);
  const trilhaOptionMap = useMemo(() => Object.fromEntries(
    trilhaOptions.map((option) => [option.IdTrilha, option]),
  ), [trilhaOptions]);
  const availableTrilhaOptions = useMemo(() => {
    const linkedIds = new Set((currentAluno.trilhas || []).map((item) => item.IdTrilha).filter(Boolean));
    return trilhaOptions.filter((option) => !linkedIds.has(option.IdTrilha));
  }, [currentAluno.trilhas, trilhaOptions]);
  const availableInteresseOptions = useMemo(() => {
    const linkedIds = new Set((alunoInteresseLinks || []).map((item) => item.IdInteresse).filter(Boolean));
    return interesseOptions.filter((option) => !linkedIds.has(option.id));
  }, [alunoInteresseLinks, interesseOptions]);
  const alunoPresencaOptions = useMemo(() => mergeSelectOptions(
    PRESENCA_OPTIONS,
    chamadaFormOptions.presencas,
    newChamadaLink.Presenca,
  ), [chamadaFormOptions.presencas, newChamadaLink.Presenca]);
  const alunoMatriculaOptions = useMemo(() => (chamadaFormOptions.matriculas || []).filter((item) => {
    const idAluno = item?.id_aluno || item?.IdAluno || '';
    if (!currentAluno.id_aluno) return true;
    return idAluno === currentAluno.id_aluno;
  }), [chamadaFormOptions.matriculas, currentAluno.id_aluno]);
  const groupedItems = useMemo(() => {
    if (!groupByTurma) {
      return [{ key: '__all__', label: 'Todos os alunos', items: sortedItems }];
    }

    const groups = new Map();
    sortedItems.forEach((item) => {
      const label = item.nome_turma || 'Sem turma definida';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(item);
    });

    return Array.from(groups.entries())
      .sort((left, right) => left[0].localeCompare(right[0], 'pt-BR'))
      .map(([label, rows]) => ({ key: label, label, items: rows }));
  }, [groupByTurma, sortedItems]);

  const resetSelection = () => setSelectedIds([]);
  const closePanel = ({ clearEditParam = true } = {}) => {
    resetPanelState();
    if (clearEditParam && searchParams.get('edit')) {
      navigate('/alunos', { replace: true });
    }
  };

  const setRelatedSectionRef = (key) => (node) => {
    if (node) {
      relatedSectionRefs.current[key] = node;
    }
  };

  const toggleRelatedSection = (key) => {
    setExpandedRelatedSection((previous) => {
      const nextValue = previous === key ? null : key;
      if (nextValue) {
        window.requestAnimationFrame(() => {
          const targetSection = relatedSectionRefs.current[nextValue];
          if (targetSection && typeof targetSection.scrollIntoView === 'function') {
            targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      }
      return nextValue;
    });
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir((previous) => (previous === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(field);
    setSortDir('asc');
  };

  const sortIndicator = (field) => {
    if (sortBy !== field) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const openRelatedPage = (path) => {
    if (!currentAluno.id_aluno) return;
    resetPanelState();
    navigate(path);
  };

  const updateAlunoTrilhaDraft = (idTrilha, value) => {
    setEditingAluno((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        trilhas: (previous.trilhas || []).map((item) => (
          item.IdTrilha === idTrilha ? { ...item, NotaTrilha: value } : item
        )),
      };
    });
  };

  const handleAddAlunoTrilha = async () => {
    if (!currentAluno.id_aluno || !newTrilhaLink.IdTrilha) return;

    try {
      setSavingTrilhaId('new');
      await api.post(`/alunos/${currentAluno.id_aluno}/trilhas`, {
        IdTrilha: newTrilhaLink.IdTrilha,
        NotaTrilha: parseTrilhaNotaInput(newTrilhaLink.NotaTrilha),
      });
      setNewTrilhaLink({ IdTrilha: '', NotaTrilha: '' });
      await fetchAlunoTrilhas(currentAluno.id_aluno);
      notify('Trilha vinculada', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || error.message || 'Erro ao vincular trilha', { duration: 3500 });
    } finally {
      setSavingTrilhaId('');
    }
  };

  const handleSaveAlunoTrilha = async (idTrilha) => {
    if (!currentAluno.id_aluno || !idTrilha) return;
    const currentTrilha = (currentAluno.trilhas || []).find((item) => item.IdTrilha === idTrilha);
    if (!currentTrilha) return;

    try {
      setSavingTrilhaId(idTrilha);
      await api.put(`/alunos/${currentAluno.id_aluno}/trilhas/${idTrilha}`, {
        NotaTrilha: parseTrilhaNotaInput(currentTrilha.NotaTrilha),
      });
      await fetchAlunoTrilhas(currentAluno.id_aluno);
      notify('Nota da trilha atualizada', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || error.message || 'Erro ao atualizar trilha', { duration: 3500 });
    } finally {
      setSavingTrilhaId('');
    }
  };

  const handleRemoveAlunoTrilha = async (idTrilha) => {
    if (!currentAluno.id_aluno || !idTrilha || !window.confirm('Remover trilha vinculada a este aluno?')) return;

    try {
      setSavingTrilhaId(idTrilha);
      await api.delete(`/alunos/${currentAluno.id_aluno}/trilhas/${idTrilha}`);
      await fetchAlunoTrilhas(currentAluno.id_aluno);
      notify('Trilha removida do aluno', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao remover trilha', { duration: 3500 });
    } finally {
      setSavingTrilhaId('');
    }
  };

  const handleAddAlunoInteresse = async () => {
    if (!currentAluno.id_aluno || !newInteresseId) return;

    try {
      setSavingInteresseId('new');
      await api.post('/alunos-interesses/', {
        IdAluno: currentAluno.id_aluno,
        IdInteresse: newInteresseId,
      });
      setNewInteresseId('');
      await Promise.all([
        fetchAlunoInteresses(currentAluno.id_aluno),
        fetchAlunoDetails(currentAluno.id_aluno),
      ]);
      notify('Interesse vinculado', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao vincular interesse', { duration: 3500 });
    } finally {
      setSavingInteresseId('');
    }
  };

  const handleCreateInteresse = async () => {
    const descricao = newInteresseDescricao.trim();
    if (!descricao) return;
    try {
      setSavingInteresseId('creating');
      const response = await api.post('/interesses/', { Descricao: descricao });
      setNewInteresseDescricao('');
      setRelatedCreatePanel(null);
      await fetchInteresseOptions();
      const createdId = response?.data?.IdInteresse || response?.data?.id_interesse || response?.data?.id;
      if (createdId) {
        setNewInteresseId(String(createdId));
      }
      notify('Interesse criado', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao criar interesse', { duration: 3500 });
    } finally {
      setSavingInteresseId('');
    }
  };

  const handleCreateTrilha = async () => {
    const nome = newTrilhaNome.trim();
    if (!nome) return;
    try {
      setSavingTrilhaId('creating');
      const response = await api.post('/trilhas/', { NomeTrilha: nome, DescricaoTrilha: newTrilhaDescricao.trim() || null, QtdCursos: 0 });
      setNewTrilhaNome('');
      setNewTrilhaDescricao('');
      setRelatedCreatePanel(null);
      await fetchTrilhaOptions();
      const createdTrilhaId = response?.data?.IdTrilha || response?.data?.id_trilha || response?.data?.id;
      if (createdTrilhaId) {
        setNewTrilhaLink((previous) => ({ ...previous, IdTrilha: String(createdTrilhaId) }));
      }
      notify('Trilha criada', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao criar trilha', { duration: 3500 });
    } finally {
      setSavingTrilhaId('');
    }
  };

  const handleRemoveAlunoInteresse = async (idAlunoInteresse) => {
    if (!currentAluno.id_aluno || !idAlunoInteresse || !window.confirm('Remover interesse vinculado a este aluno?')) return;

    try {
      setSavingInteresseId(idAlunoInteresse);
      await api.delete(`/alunos-interesses/${idAlunoInteresse}`);
      await Promise.all([
        fetchAlunoInteresses(currentAluno.id_aluno),
        fetchAlunoDetails(currentAluno.id_aluno),
      ]);
      notify('Interesse removido do aluno', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao remover interesse', { duration: 3500 });
    } finally {
      setSavingInteresseId('');
    }
  };

  const handleAddAlunoChamada = async () => {
    if (!currentAluno.id_aluno || !newChamadaLink.Data) return;

    try {
      setSavingChamada(true);
      await api.post('/chamadas/', {
        Data: newChamadaLink.Data,
        IdAluno: currentAluno.id_aluno,
        Aula: newChamadaLink.Aula || null,
        Presenca: newChamadaLink.Presenca || 'Presente',
        IdMatricula: newChamadaLink.IdMatricula || null,
      });
      setNewChamadaLink({ Data: '', Presenca: 'Presente', Aula: '', IdMatricula: '' });
      await fetchAlunoDetails(currentAluno.id_aluno);
      notify('Chamada vinculada ao aluno', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao vincular chamada', { duration: 3500 });
    } finally {
      setSavingChamada(false);
    }
  };

  const updateDraft = (field, value) => {
    clearAlunoFormFeedback();
    const applyUpdate = (previous) => {
      const next = { ...(previous || createEmptyAluno()), [field]: value };
      if (['fone_celular_ddi', 'fone_celular_ddd', 'fone_celular_numero'].includes(field)) {
        next.fone_celular_ddi = String(next.fone_celular_ddi || '').replace(/\D/g, '').slice(0, 4);
        next.fone_celular_ddd = String(next.fone_celular_ddd || '').replace(/\D/g, '').slice(0, 4);
        next.fone_celular_numero = String(next.fone_celular_numero || '').replace(/\D/g, '').slice(0, 12);
        next.fone_celular = buildLocalPhone({ ddd: next.fone_celular_ddd, number: next.fone_celular_numero });
      }
      if (['cep_residencial', 'rua_residencial', 'num_residencial', 'bairro_residencial', 'complemento_residencial', 'cidade', 'estado', 'pais'].includes(field)) {
        next.endereco = composeEndereco(next);
      }
      if (field === 'trabalho' && !normalizeBoolChoice(value)) {
        next.contente = '';
      }
      if (field === 'aluno_destaque' && !value) {
        next.descricao_destaque = '';
      }
      if ((field === 'trabalho' || field === 'estagio') && !normalizeBoolChoice(next.trabalho) && !normalizeBoolChoice(next.estagio)) {
        next.empresa = '';
        next.funcao = '';
      }
      if ((field === 'contente' && normalizeText(value) !== 'nao') || (field === 'trabalho' && !normalizeBoolChoice(value) && !['cancelado', 'inativo', 'trancado'].includes(normalizeText(next.situacao)))) {
        next.motivo = '';
      }
      return next;
    };

    if (panelMode === 'edit') {
      setEditingAluno((previous) => applyUpdate(previous));
      return;
    }
    setNewAluno((previous) => applyUpdate(previous));
  };

  const startCreate = () => {
    clearAlunoFormFeedback();
    if (searchParams.get('edit')) {
      navigate('/alunos', { replace: true });
    }
    setEditingAluno(null);
    setNewAluno(createEmptyAluno());
    setPanelMode('create');
    setExpandedRelatedSection(null);
    resetPendingPhoto();
  };

  const startEdit = (item) => {
    clearAlunoFormFeedback();
    resetPendingPhoto();
    setEditingAluno({ ...createEmptyAluno(), ...item, ativo: item.ativo !== false });
    setPanelMode('edit');
    setExpandedRelatedSection(null);
    setNewInteresseId('');
    setAlunoInteresseLinks([]);
    setInteresseOptions([]);
    setNewChamadaLink({ Data: '', Presenca: 'Presente', Aula: '', IdMatricula: '' });
    fetchAlunoDetails(item.id_aluno);
  };

  useEffect(() => {
    const requestedAlunoId = String(searchParams.get('edit') || '').trim();

    if (!requestedAlunoId) {
      handledEditParamRef.current = '';
      return;
    }

    if (handledEditParamRef.current === requestedAlunoId && panelMode === 'edit' && currentAluno.id_aluno === requestedAlunoId) {
      return;
    }

    const matchingItem = items.find((item) => item.id_aluno === requestedAlunoId);
    if (!matchingItem) return;

    handledEditParamRef.current = requestedAlunoId;
    startEdit(matchingItem);
  }, [searchParams, items, panelMode, currentAluno.id_aluno]);

  const uploadAlunoImage = async (alunoId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/alunos/${alunoId}/imagem`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data?.url || '';
  };

  const handlePhotoSelection = async (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      resetPendingPhoto();
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    if (panelMode === 'edit' && currentAluno.id_aluno) {
      try {
        const imageUrl = await uploadAlunoImage(currentAluno.id_aluno, file);
        resetPendingPhoto();
        updateDraft('imagem', imageUrl);
        fetchAlunos(page, pageSize, query, activeFilters);
        notify('Foto atualizada', { duration: 2500 });
      } catch (error) {
        console.error(error);
        if (pendingPhotoPreviewRef.current) {
          URL.revokeObjectURL(pendingPhotoPreviewRef.current);
        }
        pendingPhotoPreviewRef.current = previewUrl;
        setPendingPhotoFile(file);
        setPendingPhotoPreview(previewUrl);
        notify('Falha no upload imediato. Salve para tentar enviar a foto novamente.', { duration: 3500 });
        event.target.value = '';
        return;
      }
      event.target.value = '';
      URL.revokeObjectURL(previewUrl);
      return;
    }

    if (pendingPhotoPreviewRef.current) {
      URL.revokeObjectURL(pendingPhotoPreviewRef.current);
    }
    pendingPhotoPreviewRef.current = previewUrl;
    setPendingPhotoFile(file);
    setPendingPhotoPreview(previewUrl);
  };

  const handleImageUpload = async (event) => {
    await handlePhotoSelection(event);
  };

  const handleRemovePhoto = () => {
    resetPendingPhoto();
    updateDraft('imagem', '');
  };

  const toggleSelection = (id) => {
    setSelectedIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  };

  const handleSelectionChange = (event, id) => {
    event.stopPropagation();
    toggleSelection(id);
  };

  const focusAlunoField = (fieldKey) => {
    const field = formRef.current?.querySelector(`[data-aluno-field="${fieldKey}"]`);
    const fieldContainer = field?.closest('.field');
    if (fieldContainer && typeof fieldContainer.scrollIntoView === 'function') {
      fieldContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (field && typeof field.focus === 'function') {
      field.focus();
    }
  };

  const showAlunoValidationError = (issues) => {
    if (!issues.length) return false;

    const [firstIssue] = issues;
    const message = getAlunoValidationMessage(issues);

    notify(message, {
      type: 'error',
      duration: 4500,
      allowHtmlFallback: true,
      fallbackTargetId: ALUNO_FORM_FEEDBACK_ID,
    });
    focusAlunoField(firstIssue.key);
    return true;
  };

  const handleAlunoFormKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
    if (target instanceof HTMLInputElement && ['checkbox', 'file', 'submit', 'button'].includes(target.type)) return;

    event.preventDefault();

    const controls = Array.from(formRef.current?.querySelectorAll('input, select, textarea') || [])
      .filter((control) => control instanceof HTMLElement)
      .filter((control) => !control.hasAttribute('disabled') && !control.hasAttribute('readonly'))
      .filter((control) => !(control instanceof HTMLInputElement && ['hidden', 'file'].includes(control.type)));

    const currentIndex = controls.indexOf(target);
    const nextControl = currentIndex >= 0 ? controls[currentIndex + 1] : null;
    if (nextControl && typeof nextControl.focus === 'function') {
      nextControl.focus();
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (showAlunoValidationError(getAlunoValidationIssues(newAluno))) return;
    try {
      const response = await api.post('/alunos', {
        ...buildAlunoPayload(newAluno),
        Imagem: pendingPhotoFile ? null : sanitizePersistedMediaValue(newAluno.imagem),
      });
      const createdAlunoId = response.data?.id
        || response.data?.IdAluno
        || response.data?.id_aluno
        || response.data?.item?.id_aluno
        || response.data?.item?.IdAluno;

      if (pendingPhotoFile && createdAlunoId) {
        try {
          await uploadAlunoImage(createdAlunoId, pendingPhotoFile);
        } catch (uploadError) {
          console.error(uploadError);
          notify('Aluno criado, mas houve erro ao enviar a foto', { duration: 3500 });
        }
      }

      notify('Aluno criado', { duration: 2500 });
      closePanel();
      setNewAluno(createEmptyAluno());
      fetchAlunos(1, pageSize, query, activeFilters);
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao criar aluno', {
        type: 'error',
        duration: 3500,
        allowHtmlFallback: true,
        fallbackTargetId: ALUNO_FORM_FEEDBACK_ID,
      });
    }
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!editingAluno?.id_aluno) return;
    if (showAlunoValidationError(getAlunoValidationIssues(editingAluno))) return;
    try {
      const response = await api.put(`/alunos/${editingAluno.id_aluno}`, {
        ...buildAlunoPayload(editingAluno),
        Imagem: sanitizePersistedMediaValue(editingAluno.imagem),
      });
      if (pendingPhotoFile) {
        try {
          await uploadAlunoImage(editingAluno.id_aluno, pendingPhotoFile);
        } catch (uploadError) {
          console.error(uploadError);
          notify('Dados salvos, mas houve erro ao enviar a foto.', { duration: 3500 });
        }
      }
      const updatedAluno = normalizeAlunoRow(response.data?.item || editingAluno);
      setItems((previous) => previous.map((item) => (item.id_aluno === updatedAluno.id_aluno ? { ...item, ...updatedAluno } : item)));
      notify('Aluno atualizado', { duration: 2500 });
      closePanel();
      fetchAlunos(page, pageSize, query, activeFilters);
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao atualizar aluno', {
        type: 'error',
        duration: 3500,
        allowHtmlFallback: true,
        fallbackTargetId: ALUNO_FORM_FEEDBACK_ID,
      });
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length || !window.confirm('Inativar alunos selecionados?')) return;
    try {
      await Promise.all(selectedIds.map((id) => api.delete(`/alunos/${id}`)));
      resetSelection();
      fetchAlunos(page, pageSize, query, activeFilters);
      notify('Alunos inativados', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify('Erro ao inativar alunos', { duration: 3500 });
    }
  };

  const handleDeleteAluno = async (id, capability = null) => {
    const confirmationMessage = capability?.confirmation_message || 'Remover aluno?';
    if (!window.confirm(confirmationMessage)) return;
    try {
      const response = await api.delete(`/alunos/${id}`);
      closePanel();
      fetchAlunos(page, pageSize, query, activeFilters);
      notify(response?.data?.message || 'Aluno removido', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao remover aluno', { duration: 3500 });
    }
  };

  const addFilterCriterion = () => {
    if (!selectedFilterField || !selectedFilterValue) return;
    setActiveFilters((previous) => {
      const current = previous[selectedFilterField] || [];
      if (current.includes(selectedFilterValue)) return previous;
      return { ...previous, [selectedFilterField]: [...current, selectedFilterValue] };
    });
    setSelectedFilterValue('');
    setPage(1);
  };

  const removeFilterCriterion = (fieldKey, value) => {
    setActiveFilters((previous) => {
      const current = previous[fieldKey] || [];
      const updated = current.filter((item) => item !== value);
      const next = { ...previous };
      if (updated.length) next[fieldKey] = updated;
      else delete next[fieldKey];
      return next;
    });
    setPage(1);
  };

  const clearAllFilterCriteria = () => {
    setActiveFilters({});
    setPage(1);
  };

  const toggleFilterValue = (fieldKey, value) => {
    if (!fieldKey || !value) return;
    setActiveFilters((previous) => {
      const current = previous[fieldKey] || [];
      const next = { ...previous };
      if (current.includes(value)) {
        const updated = current.filter((item) => item !== value);
        if (updated.length) next[fieldKey] = updated;
        else delete next[fieldKey];
        return next;
      }
      return { ...next, [fieldKey]: [...current, value] };
    });
    setPage(1);
  };

  const handleSuggestedFilterSelect = (fieldKey, value) => {
    if (!fieldKey || !value) return;
    setSelectedFilterField(fieldKey);
    setSelectedFilterValue('');
    setActiveFilters((previous) => {
      const current = previous[fieldKey] || [];
      if (current.includes(value)) return previous;
      return { ...previous, [fieldKey]: [...current, value] };
    });
    setPage(1);
  };

  return (
    <div className={`app-shell app-shell-tight entity-page ${showSelection ? 'selection-mode' : ''}`}>
      <EntityHeader
        breadcrumbs={[
          {
            label: 'Alunos',
            to: '/alunos',
            onClick: panelMode || expandedRelatedSection
              ? () => closePanel()
              : undefined,
          },
          ...(panelMode === 'edit' && currentAluno.nome ? [{
            label: currentAluno.nome,
            onClick: () => {
              setExpandedRelatedSection(null);
              window.requestAnimationFrame(() => {
                formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
              });
            },
          }] : []),
          ...(expandedRelatedSection ? [{
            label: getExpandedSectionBreadcrumb(),
            onClick: () => {
              relatedSectionRefs.current[expandedRelatedSection]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            },
          }] : []),
        ]}
        title="Alunos"
        meta={`${total} registro(s)`}
        filterChips={activeFilterChips}
        onRemoveFilterChip={removeFilterCriterion}
        actions={(
          <>
            {/* A CHECKBOX FOI ADICIONADA AQUI! */}
            <label 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                marginRight: '12px', 
                fontSize: '0.875rem', 
                cursor: 'pointer' 
              }}
            >
              <input
                type="checkbox"
                checked={showInativos}
                onChange={(e) => {
                  setShowInativos(e.target.checked);
                  setPage(1);
                }}
              />
              Inativos
            </label>

            <button type="button" className="icon-action-btn filter-toggle-btn" aria-label="Abrir filtros" onClick={() => setShowFilters((previous) => !previous)}>
              {showFilters ? <X size={17} /> : <ListFilter size={17} />}
            </button>
            <button
              className={`icon-action-btn group-toggle-btn ${groupByTurma ? 'active' : ''}`}
              aria-label={groupByTurma ? 'Desagrupar por turma' : 'Agrupar por turma'}
              onClick={() => setGroupByTurma((previous) => !previous)}
              type="button"
            >
              <Filter size={17} />
            </button>
            <button
              type="button"
              className={`icon-action-btn selection-toggle-btn ${showSelection ? 'active' : ''}`}
              aria-label="Alternar seleção"
              onClick={() => {
                setShowSelection((previous) => {
                  if (previous) resetSelection();
                  return !previous;
                });
              }}
            >
              {showSelection ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
            </button>
            <button type="button" className="icon-action-btn entity-add-btn" aria-label="Adicionar aluno" onClick={startCreate}>
              <Plus size={17} />
            </button>
          </>
        )}
      />

      {selectedIds.length > 0 && (
        <section className="bulk-action-bar card">
          <span>{bulkCountLabel}</span>
          <button type="button" className="icon-action-btn danger" aria-label="Inativar selecionados" onClick={handleBulkDelete}>
            <Trash2 size={17} />
          </button>
        </section>
      )}

      <ListFilterDrawer
        open={showFilters}
        dataTestId="alunos-filter-drawer"
        closeButton={<button type="button" className="icon-action-btn" aria-label="Fechar filtros" onClick={() => setShowFilters(false)}><span aria-hidden="true">←</span></button>}
        searchId="alunos-drawer-search"
        query={query}
        onQueryChange={(event) => { setQuery(event.target.value); setPage(1); }}
        filterDefs={FILTER_DEFS}
        filterOptions={filterOptions}
        activeFilters={activeFilters}
        onToggleFilterValue={toggleFilterValue}
        selectedFilterField={selectedFilterField}
        onSelectedFilterFieldChange={(event) => { setSelectedFilterField(event.target.value); setSelectedFilterValue(''); }}
        selectedFilterValue={selectedFilterValue}
        onSelectedFilterValueChange={(event) => setSelectedFilterValue(event.target.value)}
        selectableValues={selectableValues}
        onAddFilterCriterion={addFilterCriterion}
        showInativos={showInativos}
        onShowInativosChange={(event) => { setShowInativos(event.target.checked); setPage(1); }}
        activeFilterChips={activeFilterChips}
        onRemoveFilterCriterion={removeFilterCriterion}
        onClearAllFilterCriteria={clearAllFilterCriteria}
        onSuggestedFilterSelect={handleSuggestedFilterSelect}
        showInlineActiveChips={false}
      />

      <section>
        {loading ? <div>Carregando...</div> : (
          <div className={`split-layout ${panelMode ? 'has-panel' : ''}`}>
            <div className="split-main">
              <div className="card table-card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="compact-table-select"></th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('imagem')}>
                            Imagem <span className="sort-indicator">{sortIndicator('imagem')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('nome')}>
                            Nome Completo do Aluno(a) <span className="sort-indicator">{sortIndicator('nome')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('aluno_destaque')}>
                            Destaque <span className="sort-indicator">{sortIndicator('aluno_destaque')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('descricao_destaque')}>
                            Descrição destaque <span className="sort-indicator">{sortIndicator('descricao_destaque')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('situacao')}>
                            Situação <span className="sort-indicator">{sortIndicator('situacao')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('cursos_atuais')}>
                            Cursos Atuais <span className="sort-indicator">{sortIndicator('cursos_atuais')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('turma')}>
                            Turma de Ingresso <span className="sort-indicator">{sortIndicator('turma')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('turno')}>
                            Turno <span className="sort-indicator">{sortIndicator('turno')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('setor')}>
                            Setor <span className="sort-indicator">{sortIndicator('setor')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('data_ingresso')}>
                            Data de Ingresso <span className="sort-indicator">{sortIndicator('data_ingresso')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('data_conclusao')}>
                            Data de Conclusão <span className="sort-indicator">{sortIndicator('data_conclusao')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('ativo')}>
                            Status <span className="sort-indicator">{sortIndicator('ativo')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('interesses')}>
                            Interesses <span className="sort-indicator">{sortIndicator('interesses')}</span>
                          </button>
                        </th>
                        <th>Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedItems.map((group) => (
                        <React.Fragment key={group.key}>
                          {groupByTurma && (
                            <tr className="alunos-group-row">
                              <td colSpan={ALUNOS_TABLE_COLUMN_COUNT}>
                                <div className="alunos-group-heading">
                                  {group.label}
                                  <small>{group.items.length} aluno(s)</small>
                                </div>
                              </td>
                            </tr>
                          )}
                          {group.items.map((item) => (
                            <tr key={item.id_aluno} className={groupByTurma ? 'alunos-data-row' : undefined} onClick={() => startEdit(item)}>
                              <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                                <input type="checkbox" checked={selectedIds.includes(item.id_aluno)} onClick={(event) => event.stopPropagation()} onChange={(event) => handleSelectionChange(event, item.id_aluno)} />
                              </td>
                              <td className="aluno-image-cell">
                                <div className="aluno-image-thumb" aria-label={`Foto de ${item.nome || 'aluno'}`}>
                                  {(() => {
                                    const photoUrl = resolveAlunoImageUrl(item.imagem);
                                    if (!photoUrl || brokenMediaUrls[photoUrl]) {
                                      return <span>{getAlunoInitials(item.nome)}</span>;
                                    }
                                    return <img src={photoUrl} alt={`Foto de ${item.nome || 'aluno'}`} onError={() => markMediaUrlAsBroken(photoUrl)} />;
                                  })()}
                                </div>
                              </td>
                              <td>
                                <div className="table-primary-text">{item.nome || '-'}</div>
                                <div className="table-secondary-text">{item.email || item.fone_celular ? `${item.email || 'Sem e-mail'} • ${item.fone_celular ? formatPhoneBR(item.fone_celular) : 'Sem telefone'}` : 'Sem contato rápido'}</div>
                              </td>
                              <td>{item.aluno_destaque ? 'SIM' : ''}</td>
                              <td>{item.descricao_destaque || '-'}</td>
                              <td>{item.situacao || '-'}</td>
                              <td>
                                {(item.cursos_atuais || []).length ? (
                                  <div className="cell-list">
                                    {item.cursos_atuais.map((curso) => <span key={`${item.id_aluno}:${curso}`} className="cell-tag">{curso}</span>)}
                                  </div>
                                ) : '-'}
                              </td>
                              <td>{item.nome_turma || '-'}</td>
                              <td>{item.turno || '-'}</td>
                              <td>{item.setor || '-'}</td>
                              <td>{formatDateBR(item.data_ingresso)}</td>
                              <td>{formatDateBR(item.data_conclusao)}</td>
                              <td>{item.ativo !== false ? 'Ativo' : 'Inativo'}</td>
                              <td>
                                {(item.interesses || []).length ? (
                                  <div className="cell-list">
                                    {item.interesses.map((interesse) => <span key={`${item.id_aluno}:${interesse}`} className="cell-tag">{interesse}</span>)}
                                  </div>
                                ) : '-'}
                              </td>
                              <td onClick={(event) => event.stopPropagation()}>
                                <button className="icon-btn entity-edit-btn" type="button" aria-label="Editar aluno" onClick={() => startEdit(item)}>
                                  <Pencil size={15} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ListPagination
                  page={page}
                  pages={pages}
                  total={total}
                  pageSize={pageSize}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  setPage={setPage}
                  setPageSize={setPageSize}
                />
              </div>
            </div>

            <aside className={`split-panel ${panelMode ? 'open' : ''}`}>
              {(panelMode === 'edit' || panelMode === 'create') && (
                <form ref={formRef} onSubmit={panelMode === 'edit' ? handleUpdate : handleCreate} onKeyDown={handleAlunoFormKeyDown} noValidate className={`card ${expandedRelatedSection ? 'details-panel-related-focus' : ''}`}>
                  <div className="panel-header">
                    <h3>{panelMode === 'edit' ? 'Detalhes do Aluno' : 'Novo Aluno'}</h3>
                    <div className="panel-header-actions">
                      <button className="btn ghost" type="button" onClick={closePanel}>Fechar</button>
                    </div>
                  </div>

                  <div className={`details-form-stack ${expandedRelatedSection ? 'related-focus-active' : ''}`}>
                    {expandedRelatedSection && (
                      <div className="related-focus-banner">
                        <strong>{currentAluno.nome || 'Aluno selecionado'}</strong>
                        <span>Edite a seção expandida e use Recolher para voltar ao formulário completo.</span>
                      </div>
                    )}
                    <div className="field">
                      <label className="field-label-required">Nome completo do aluno(a)</label>
                      <input className="input" data-aluno-field="nome" required value={currentAluno.nome} onChange={(event) => updateDraft('nome', event.target.value)} />
                    </div>

                    <div className="field">
                      <label>Foto</label>
                      <div className="professor-photo-card aluno-image-panel">
                        <div className="professor-photo-stage">
                          <div className="aluno-image-preview professor-photo-preview">
                          {currentPhotoPreview && !brokenMediaUrls[currentPhotoPreview] ? (
                            <img src={currentPhotoPreview} alt={`Foto de ${currentAluno.nome || 'aluno'}`} onError={() => markMediaUrlAsBroken(currentPhotoPreview)} />
                          ) : (
                            <span>{getAlunoInitials(currentAluno.nome)}</span>
                          )}
                          </div>
                          <div className="professor-photo-copy">
                            <strong>{hasAlunoPhoto ? 'Foto pronta para o cadastro' : 'Adicionar foto do aluno'}</strong>
                            <span>{panelMode === 'edit' ? 'Ao trocar a imagem, o upload acontece na hora. Se remover, a alteração será salva junto com o restante do formulário.' : 'Você pode escolher um arquivo local agora; o upload será enviado após salvar o novo aluno.'}</span>
                            {pendingPhotoFile ? <span className="helper-text">Arquivo selecionado: {pendingPhotoFile.name}</span> : null}
                          </div>
                        </div>
                        <div className="entity-actions professor-photo-actions">
                          <label htmlFor="aluno-photo-upload" className="btn media-action-btn">
                            <Camera size={16} />
                            <span>{alunoPhotoActionLabel}</span>
                          </label>
                          <input id="aluno-photo-upload" type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                          <button type="button" className="btn ghost" onClick={handleRemovePhoto} disabled={!hasAlunoPhoto}>Remover foto</button>
                        </div>
                      </div>
                    </div>

                    <label className="field checkbox">
                      <span>Destaque</span>
                      <input id="aluno-destaque" type="checkbox" checked={!!currentAluno.aluno_destaque} onChange={(event) => updateDraft('aluno_destaque', event.target.checked)} />
                    </label>

                    <div className="field">
                      <label htmlFor="aluno-descricao-destaque">Descrição destaque</label>
                      <textarea id="aluno-descricao-destaque" className="input details-textarea" maxLength={1000} value={currentAluno.descricao_destaque || ''} onChange={(event) => updateDraft('descricao_destaque', event.target.value)} />
                    </div>

                    <div className="field">
                      <label className="field-label-required">E-mail</label>
                      <input className="input" data-aluno-field="email" type="email" value={currentAluno.email} onChange={(event) => updateDraft('email', event.target.value)} />
                    </div>

                    <div className="field">
                      <label>CPF</label>
                      <input className="input" value={formatCpf(currentAluno.cpf)} onChange={(event) => updateDraft('cpf', event.target.value)} />
                    </div>

                    <div className="form-row">
                      <div className="field">
                        <label className="field-label-required">Data de Nascimento</label>
                        <input className="input" data-aluno-field="data_nascimento" placeholder="DD/MM/YYYY" value={maskDateBRInput(currentAluno.data_nascimento || '')} onChange={(event) => updateDraft('data_nascimento', maskDateBRInput(event.target.value))} />
                      </div>
                      <div className="field">
                        <label className="field-label-required">Cidade de Nascimento</label>
                        <input
                          className="input"
                          data-aluno-field="cidade_naturalidade"
                          list="aluno-cidade-nascimento-options"
                          value={currentAluno.cidade_naturalidade || ''}
                          onChange={(event) => updateDraft('cidade_naturalidade', event.target.value)}
                        />
                        <datalist id="aluno-cidade-nascimento-options">
                          {cidadeNascimentoOptions.map((option) => <option key={option} value={option} />)}
                        </datalist>
                      </div>
                    </div>

                    <div className="field">
                      <label className="field-label-required">Fone Celular</label>
                      <div className="form-row">
                        <div className="field">
                          <label>DDI</label>
                          <select className="select" data-aluno-field="fone_celular_ddi" value={currentAluno.fone_celular_ddi || '55'} onChange={(event) => updateDraft('fone_celular_ddi', event.target.value)}>
                            {DIAL_CODE_OPTIONS.map((option) => <option key={`${option.code}-${option.dialCode}`} value={option.dialCode}>{option.label}</option>)}
                          </select>
                        </div>
                        <div className="field">
                          <label className="field-label-required">DDD</label>
                          <input className="input" data-aluno-field="fone_celular_ddd" value={currentAluno.fone_celular_ddd || ''} onChange={(event) => updateDraft('fone_celular_ddd', event.target.value)} />
                        </div>
                        <div className="field">
                          <label className="field-label-required">Número do celular</label>
                          <input className="input" data-aluno-field="fone_celular_numero" value={currentAluno.fone_celular_numero || ''} onChange={(event) => updateDraft('fone_celular_numero', event.target.value)} />
                        </div>
                      </div>
                    </div>

                    <label className="field checkbox">
                      <span>WhatsApp</span>
                      <input type="checkbox" checked={!!currentAluno.whatsapp} onChange={(event) => updateDraft('whatsapp', event.target.checked)} />
                    </label>

                    <div className="field">
                      <label>CEP</label>
                      <div className="inline-field-action">
                        <input
                          className="input"
                          value={formatCep(currentAluno.cep_residencial)}
                          onChange={(event) => updateDraft('cep_residencial', event.target.value)}
                          onBlur={(event) => handleCepLookup(event.target.value)}
                        />
                        <button type="button" className="btn ghost" onClick={() => handleCepLookup(currentAluno.cep_residencial)} disabled={cepLookupLoading || String(currentAluno.cep_residencial || '').replace(/\D/g, '').length !== 8}>Buscar CEP</button>
                      </div>
                      {cepLookupLoading ? <span className="helper-text">Buscando CEP...</span> : <span className="helper-text">Você pode buscar pelo botão ou ao sair do campo. Quando o CEP for válido, o endereço será preenchido automaticamente.</span>}
                    </div>

                    <div className="form-row">
                      <div className="field">
                        <label>Rua Residencial</label>
                        <input className="input" value={currentAluno.rua_residencial || ''} onChange={(event) => updateDraft('rua_residencial', event.target.value)} />
                      </div>
                      <div className="field">
                        <label>Número Residencial</label>
                        <input className="input" value={currentAluno.num_residencial || ''} onChange={(event) => updateDraft('num_residencial', event.target.value)} />
                      </div>
                      <div className="field">
                        <label>Bairro Residencial</label>
                        <input className="input" value={currentAluno.bairro_residencial || ''} onChange={(event) => updateDraft('bairro_residencial', event.target.value)} />
                      </div>
                    </div>

                    <div className="field">
                      <label>Complemento Residencial</label>
                      <input className="input" value={currentAluno.complemento_residencial || ''} onChange={(event) => updateDraft('complemento_residencial', event.target.value)} />
                    </div>

                    <div className="form-row">
                      <div className="field">
                        <label>Cidade</label>
                        <input className="input" value={currentAluno.cidade || ''} onChange={(event) => updateDraft('cidade', event.target.value)} />
                      </div>
                      <div className="field">
                        <label>Estado</label>
                        <input className="input" value={currentAluno.estado || ''} onChange={(event) => updateDraft('estado', event.target.value)} />
                      </div>
                      <div className="field">
                        <label>País</label>
                        <input className="input" value={currentAluno.pais || ''} onChange={(event) => updateDraft('pais', event.target.value)} />
                      </div>
                    </div>

                    <div className="field">
                      <label>Endereço</label>
                      <textarea className="input details-textarea" value={currentAluno.endereco || ''} onChange={(event) => updateDraft('endereco', event.target.value)} placeholder="Rua, número, complemento, bairro, cidade, estado, CEP e país" />
                    </div>

                    <div className="field">
                      <label>Pai</label>
                      <input className="input" value={currentAluno.pai || ''} onChange={(event) => updateDraft('pai', event.target.value)} />
                    </div>

                    <div className="field">
                      <label>Mãe</label>
                      <input className="input" value={currentAluno.mae || ''} onChange={(event) => updateDraft('mae', event.target.value)} />
                    </div>

                    <div className="field">
                      <label className="field-label-required">Escola Cursada Ensino Fundamental</label>
                      <input className="input" data-aluno-field="escola_ensino_medio" list="aluno-escola-fundamental-options" value={currentAluno.escola_ensino_medio || ''} onChange={(event) => updateDraft('escola_ensino_medio', event.target.value)} />
                      <datalist id="aluno-escola-fundamental-options">
                        {escolaEnsinoMedioSelectOptions.map((option) => <option key={option} value={option} />)}
                      </datalist>
                    </div>

                    <div className="field">
                      <label className="field-label-required">Escola Atual</label>
                      <input className="input" data-aluno-field="escola_atual" list="aluno-escola-atual-options" value={currentAluno.escola_atual || ''} onChange={(event) => updateDraft('escola_atual', event.target.value)} />
                      <datalist id="aluno-escola-atual-options">
                        {escolaAtualSelectOptions.map((option) => <option key={option} value={option} />)}
                      </datalist>
                    </div>

                    <div className="form-row">
                      <div className="field">
                        <label className="field-label-required">Turno</label>
                        <select className="select" data-aluno-field="turno" value={currentAluno.turno || ''} onChange={(event) => updateDraft('turno', event.target.value)}>
                          <option value="">Selecione</option>
                          {turnoOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Data de Ingresso</label>
                        <input className="input" placeholder="DD/MM/YYYY" value={maskDateBRInput(currentAluno.data_ingresso || '')} onChange={(event) => updateDraft('data_ingresso', maskDateBRInput(event.target.value))} />
                      </div>
                      <div className="field">
                        <label>Data de Conclusão</label>
                        <input className="input" placeholder="DD/MM/YYYY" value={maskDateBRInput(currentAluno.data_conclusao || '')} onChange={(event) => updateDraft('data_conclusao', maskDateBRInput(event.target.value))} />
                      </div>
                    </div>

                    <div className="field">
                      <label className="field-label-required">Turma de ingresso</label>
                      <select className="select" data-aluno-field="id_turma" value={currentAluno.id_turma || ''} onChange={(event) => updateDraft('id_turma', event.target.value)}>
                        <option value="">Selecione</option>
                        {turmaOptions.map((option) => <option key={option.id} value={option.id}>{option.nome}</option>)}
                      </select>
                    </div>

                    <div className="field">
                      <label>Setor</label>
                      <input className="input" list="aluno-setor-options" value={currentAluno.setor || ''} onChange={(event) => updateDraft('setor', event.target.value)} />
                      <datalist id="aluno-setor-options">
                        {setorSelectOptions.map((option) => <option key={option} value={option} />)}
                      </datalist>
                    </div>

                    <div className="field">
                      <label>Trabalha?</label>
                      <select className="select" value={currentAluno.trabalho} onChange={(event) => updateDraft('trabalho', event.target.value)}>
                        <option value="">Selecione</option>
                        {YES_NO_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </div>

                    <div className="field">
                      <label>Faz estágio?</label>
                      <select className="select" value={currentAluno.estagio} onChange={(event) => updateDraft('estagio', event.target.value)}>
                        <option value="">Selecione</option>
                        {YES_NO_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </div>

                    {shouldShowEmpresa && (
                      <div className="field" data-testid="aluno-empresa-field">
                        <label>Nome da empresa</label>
                        <input className="input" value={currentAluno.empresa} onChange={(event) => updateDraft('empresa', event.target.value)} />
                      </div>
                    )}

                    {shouldShowEmpresa && (
                      <div className="field" data-testid="aluno-funcao-field">
                        <label>Em qual função?</label>
                        <input className="input" data-aluno-field="funcao" value={currentAluno.funcao} onChange={(event) => updateDraft('funcao', event.target.value)} />
                      </div>
                    )}

                    {shouldShowSatisfacao && (
                      <div className="field">
                        <label>Está satisfeito no trabalho?</label>
                        <select className="select" value={currentAluno.contente} onChange={(event) => updateDraft('contente', event.target.value)}>
                          <option value="">Selecione</option>
                          {YES_NO_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                    )}

                    {shouldShowMotivo && (
                      <div className="field" data-testid="aluno-motivo-field">
                        <label>Motivo</label>
                        <textarea className="input details-textarea" value={currentAluno.motivo} placeholder={isWorkReasonRequired && !isSituationReasonRequired ? 'Informe o motivo da insatisfação.' : ''} onChange={(event) => updateDraft('motivo', event.target.value)} />
                      </div>
                    )}

                    <div className="field">
                      <label className="field-label-required">Situação</label>
                      <select className="select" data-aluno-field="situacao" value={currentAluno.situacao || ''} onChange={(event) => updateDraft('situacao', event.target.value)}>
                        <option value="">Selecione</option>
                        {situacaoOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </div>

                    <div id={ALUNO_FORM_FEEDBACK_ID} className="form-feedback" aria-live="polite"></div>

                    <section ref={setRelatedSectionRef('chamadas')} className={`related-section-block ${expandedRelatedSection === 'chamadas' ? 'is-expanded' : ''}`}>
                      <div className="related-section-header">
                        <strong>Chamadas Relacionadas</strong>
                        <div className="entity-actions related-inline-actions">
                          <button type="button" className="btn ghost" onClick={() => toggleRelatedSection('chamadas')}>{expandedRelatedSection === 'chamadas' ? 'Recolher' : 'Expandir'}</button>
                        </div>
                      </div>
                      {currentAluno.id_aluno ? (
                        <div className="form-row" style={{ marginBottom: 12 }}>
                          <div className="field">
                            <label>Data</label>
                            <input
                              className="input"
                              type="date"
                              aria-label="Data da chamada relacionada"
                              value={newChamadaLink.Data}
                              onChange={(event) => setNewChamadaLink((previous) => ({ ...previous, Data: event.target.value }))}
                              disabled={savingChamada}
                            />
                          </div>
                          <div className="field">
                            <label>Presença</label>
                            <select
                              className="select"
                              aria-label="Presença da chamada relacionada"
                              value={newChamadaLink.Presenca}
                              onChange={(event) => setNewChamadaLink((previous) => ({ ...previous, Presenca: event.target.value }))}
                              disabled={savingChamada}
                            >
                              {alunoPresencaOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                          </div>
                          <div className="field">
                            <label>Aula</label>
                            <select
                              className="select"
                              aria-label="Aula da chamada relacionada"
                              value={newChamadaLink.Aula}
                              onChange={(event) => setNewChamadaLink((previous) => ({ ...previous, Aula: event.target.value }))}
                              disabled={savingChamada}
                            >
                              <option value="">Selecione</option>
                              {(chamadaFormOptions.aulas || []).map((item) => (
                                <option key={item.id} value={item.id}>{item.nome}</option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label>Matrícula</label>
                            <select
                              className="select"
                              aria-label="Matrícula da chamada relacionada"
                              value={newChamadaLink.IdMatricula}
                              onChange={(event) => setNewChamadaLink((previous) => ({ ...previous, IdMatricula: event.target.value }))}
                              disabled={savingChamada}
                            >
                              <option value="">Selecione</option>
                              {alunoMatriculaOptions.map((item) => (
                                <option key={item.id} value={item.id}>{item.nome}</option>
                              ))}
                            </select>
                          </div>
                          <div className="field" style={{ alignSelf: 'end' }}>
                            <button type="button" className="btn" onClick={handleAddAlunoChamada} disabled={savingChamada || !newChamadaLink.Data}>
                              Adicionar Chamada
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="helper-text" style={{ marginBottom: 12 }}>Salve o aluno antes de vincular chamadas.</div>
                      )}
                      <div className="table-wrap related-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Nome do Aluno</th>
                              <th>Presença</th>
                              <th>Data</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(currentAluno.chamadas_relacionadas || []).length ? currentAluno.chamadas_relacionadas.map((item, index) => {
                              const presenceMeta = getPresenceMeta(item.presenca);
                              return (
                                <tr key={`chamada:${index}`}>
                                  <td>{item.nome_aluno || currentAluno.nome || '-'}</td>
                                  <td>
                                    <span className={`status-indicator ${presenceMeta.className}`}>
                                      <presenceMeta.Icon size={14} />
                                    </span>
                                  </td>
                                  <td>{formatDateBR(item.data)}</td>
                                </tr>
                              );
                            }) : (
                              <tr><td colSpan={3}>Sem chamadas relacionadas.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section ref={setRelatedSectionRef('avaliacoes')} className={`related-section-block ${expandedRelatedSection === 'avaliacoes' ? 'is-expanded' : ''}`}>
                      <div className="related-section-header">
                        <strong>Avaliações Relacionadas</strong>
                        <div className="entity-actions related-inline-actions">
                          <button type="button" className="btn ghost" onClick={() => toggleRelatedSection('avaliacoes')}>{expandedRelatedSection === 'avaliacoes' ? 'Recolher' : 'Expandir'}</button>
                          <button type="button" className="btn" disabled={!currentAluno.id_aluno} onClick={() => openRelatedPage(`/avaliacoes?origin=alunos&aluno=${encodeURIComponent(currentAluno.id_aluno)}&alunoNome=${encodeURIComponent(currentAluno.nome || '')}&create=1`)}>Adicionar</button>
                        </div>
                      </div>
                      <div className="table-wrap related-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Nome do Aluno</th>
                              <th>Nome do Curso</th>
                              <th>Nota</th>
                              <th>Ingresso</th>
                              <th>Conclusão</th>
                              <th>OBS.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(currentAluno.avaliacoes_relacionadas || []).length ? currentAluno.avaliacoes_relacionadas.map((item, index) => {
                              const notaMeta = getNotaMeta(item.nota);
                              return (
                                <tr key={`avaliacao:${index}`}>
                                  <td>{item.nome_aluno || currentAluno.nome || '-'}</td>
                                  <td>{item.nome_curso || '-'}</td>
                                  <td>
                                    <span className={`status-indicator ${notaMeta.className}`}>
                                      <notaMeta.Icon size={14} /> {item.nota ?? '-'}
                                    </span>
                                  </td>
                                  <td>{formatDateBR(item.data_ingresso)}</td>
                                  <td>{formatDateBR(item.data_conclusao)}</td>
                                  <td>{item.obs || '-'}</td>
                                </tr>
                              );
                            }) : (
                              <tr><td colSpan={6}>Sem avaliações relacionadas.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <div className="related-metrics-grid" aria-label="Totais do aluno">
                      <div className="record-meta"><strong>Total de Aulas</strong><span><span className="status-indicator status-info"><BookOpen size={14} /> {currentAluno.totais_relacionados?.total_aulas || 0}</span></span></div>
                      <div className="record-meta"><strong>Presenças</strong><span><span className="status-indicator status-positive"><ThumbsUp size={14} /> {currentAluno.totais_relacionados?.presencas || 0}</span></span></div>
                      <div className="record-meta"><strong>Faltas</strong><span><span className="status-indicator status-negative"><ThumbsDown size={14} /> {currentAluno.totais_relacionados?.faltas || 0}</span></span></div>
                      
                    </div>

                    <section ref={setRelatedSectionRef('matriculas')} className={`related-section-block ${expandedRelatedSection === 'matriculas' ? 'is-expanded' : ''}`}>
                      <div className="related-section-header">
                        <strong>Matrículas Relacionadas</strong>
                        <div className="entity-actions related-inline-actions">
                          <button type="button" className="btn ghost" onClick={() => toggleRelatedSection('matriculas')}>{expandedRelatedSection === 'matriculas' ? 'Recolher' : 'Expandir'}</button>
                          <button type="button" className="btn" disabled={!currentAluno.id_aluno} onClick={() => openRelatedPage(`/cursos?origin=alunos&aluno=${encodeURIComponent(currentAluno.id_aluno)}&alunoNome=${encodeURIComponent(currentAluno.nome || '')}&createMatricula=1`)}>Adicionar</button>
                        </div>
                      </div>
                      <div className="table-wrap related-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Data da Matrícula</th>
                              <th>Data de Conclusão</th>
                              <th>Curso</th>
                              <th>Turma</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(currentAluno.matriculas_relacionadas || []).length ? currentAluno.matriculas_relacionadas.map((item, index) => (
                              <tr key={`matricula:${index}`}>
                                <td>{formatDateBR(item.data_matricula)}</td>
                                <td>{formatDateBR(item.data_conclusao)}</td>
                                <td>{item.curso || '-'}</td>
                                <td>{item.turma || '-'}</td>
                                <td>{item.status || '-'}</td>
                              </tr>
                            )) : (
                              <tr><td colSpan={5}>Sem matrículas relacionadas.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section ref={setRelatedSectionRef('interesses')} className={`related-section-block ${expandedRelatedSection === 'interesses' ? 'is-expanded' : ''}`}>
                      <div className="related-section-header">
                        <strong>Interesses Relacionados</strong>
                        <div className="entity-actions related-inline-actions">
                          <button type="button" className="btn ghost" onClick={() => toggleRelatedSection('interesses')}>{expandedRelatedSection === 'interesses' ? 'Recolher' : 'Expandir'}</button>
                        </div>
                      </div>
                      {currentAluno.id_aluno ? (
                        <>
                          <div className="form-row" style={{ marginBottom: 12 }}>
                            <div className="field">
                              <label>Interesse</label>
                              <select
                                className="select"
                                aria-label="Selecionar interesse relacionado"
                                value={newInteresseId}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  if (nextValue === CREATE_INTERESSE_OPTION) {
                                    setNewInteresseId('');
                                    openRelatedPage(`/interesses?origin=alunos&aluno=${encodeURIComponent(currentAluno.id_aluno)}&alunoNome=${encodeURIComponent(currentAluno.nome || '')}&create=1`);
                                    return;
                                  }
                                  setNewInteresseId(nextValue);
                                }}
                                disabled={savingInteresseId === 'new'}
                              >
                                <option value="">Selecione</option>
                                <option value={CREATE_INTERESSE_OPTION}>+ Criar novo interesse</option>
                                {availableInteresseOptions.map((option) => <option key={option.id} value={option.id}>{option.nome}</option>)}
                              </select>
                            </div>
                            <div className="field" style={{ alignSelf: 'end' }}>
                              <button type="button" className="btn" onClick={handleAddAlunoInteresse} disabled={!newInteresseId || savingInteresseId === 'new'}>
                                Vincular Interesse
                              </button>
                            </div>
                          </div>

                          {!availableInteresseOptions.length && <div className="helper-text">Todos os interesses disponíveis já estão vinculados a este aluno.</div>}

                          <div className="table-wrap related-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Interesse</th>
                                  <th>Ações</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(alunoInteresseLinks || []).length ? alunoInteresseLinks.map((item, index) => (
                                  <tr key={`interesse:${item.IdAlunoInteresse || item.IdInteresse || index}`}>
                                    <td>{item.DescricaoInteresse || '-'}</td>
                                    <td>
                                      <div className="entity-actions related-inline-actions">
                                        <button
                                          type="button"
                                          className="btn ghost"
                                          onClick={() => handleRemoveAlunoInteresse(item.IdAlunoInteresse)}
                                          disabled={savingInteresseId === item.IdAlunoInteresse}
                                        >
                                          Remover
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )) : (
                                  <tr><td colSpan={2}>{loadingInteresses ? 'Carregando interesses relacionados...' : 'Sem interesses vinculados.'}</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <div className="helper-text">Salve o aluno antes de vincular interesses.</div>
                      )}
                    </section>

                    <section ref={setRelatedSectionRef('trilhas')} className={`related-section-block ${expandedRelatedSection === 'trilhas' ? 'is-expanded' : ''}`}>
                      <div className="related-section-header">
                        <strong>Trilhas Relacionadas</strong>
                        <div className="entity-actions related-inline-actions">
                          <button type="button" className="btn ghost" onClick={() => toggleRelatedSection('trilhas')}>{expandedRelatedSection === 'trilhas' ? 'Recolher' : 'Expandir'}</button>
                        </div>
                      </div>

                      {currentAluno.id_aluno ? (
                        <>
                          <div className="form-row" style={{ marginBottom: 12 }}>
                            <div className="field">
                              <label>Trilha</label>
                              <select
                                className="select"
                                aria-label="Selecionar trilha"
                                value={newTrilhaLink.IdTrilha}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  if (nextValue === CREATE_TRILHA_OPTION) {
                                    setNewTrilhaLink((previous) => ({ ...previous, IdTrilha: '' }));
                                    openRelatedPage(`/trilhas?origin=alunos&aluno=${encodeURIComponent(currentAluno.id_aluno)}&alunoNome=${encodeURIComponent(currentAluno.nome || '')}&create=1`);
                                    return;
                                  }
                                  setNewTrilhaLink((previous) => ({ ...previous, IdTrilha: nextValue }));
                                }}
                                disabled={savingTrilhaId === 'new'}
                              >
                                <option value="">Selecione</option>
                                <option value={CREATE_TRILHA_OPTION}>+ Criar nova trilha</option>
                                {availableTrilhaOptions.map((option) => <option key={option.IdTrilha} value={option.IdTrilha}>{option.NomeTrilha}</option>)}
                              </select>
                            </div>
                            <div className="field">
                              <label>Nota da Trilha</label>
                              <input
                                className="input"
                                aria-label="Nota da trilha"
                                type="number"
                                min="0"
                                max="10"
                                step="0.01"
                                value={newTrilhaLink.NotaTrilha}
                                onChange={(event) => setNewTrilhaLink((previous) => ({ ...previous, NotaTrilha: event.target.value }))}
                                disabled={savingTrilhaId === 'new'}
                              />
                            </div>
                            <div className="field" style={{ alignSelf: 'end' }}>
                              <button type="button" className="btn" onClick={handleAddAlunoTrilha} disabled={!newTrilhaLink.IdTrilha || savingTrilhaId === 'new'}>
                                Vincular Trilha
                              </button>
                            </div>
                          </div>

                          {!availableTrilhaOptions.length && <div className="helper-text">Todas as trilhas disponíveis já estão vinculadas a este aluno.</div>}

                          <div className="table-wrap related-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Trilha</th>
                                  <th>Qtd. Cursos</th>
                                  <th>Nota da Trilha</th>
                                  <th>Ações</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(currentAluno.trilhas || []).length ? currentAluno.trilhas.map((item, index) => {
                                  const trilha = trilhaOptionMap[item.IdTrilha] || {};
                                  return (
                                    <tr key={`trilha:${item.IdAlunoTrilha || item.IdTrilha || index}`}>
                                      <td>{trilha.NomeTrilha || item.NomeTrilha || '-'}</td>
                                      <td>{trilha.QtdCursos ?? '-'}</td>
                                      <td>
                                        <input
                                          className="input"
                                          aria-label={`Nota da trilha ${trilha.NomeTrilha || item.NomeTrilha || index + 1}`}
                                          type="number"
                                          min="0"
                                          max="10"
                                          step="0.01"
                                          value={item.NotaTrilha ?? ''}
                                          onChange={(event) => updateAlunoTrilhaDraft(item.IdTrilha, event.target.value)}
                                          disabled={savingTrilhaId === item.IdTrilha}
                                        />
                                      </td>
                                      <td>
                                        <div className="entity-actions related-inline-actions">
                                          <button type="button" className="btn ghost" onClick={() => handleSaveAlunoTrilha(item.IdTrilha)} disabled={savingTrilhaId === item.IdTrilha}>Salvar Nota</button>
                                          <button type="button" className="btn ghost" onClick={() => handleRemoveAlunoTrilha(item.IdTrilha)} disabled={savingTrilhaId === item.IdTrilha}>Remover</button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                }) : (
                                  <tr><td colSpan={4}>{loadingTrilhas ? 'Carregando trilhas relacionadas...' : 'Sem trilhas vinculadas.'}</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <div className="helper-text">Salve o aluno antes de vincular trilhas.</div>
                      )}
                    </section>

                    {loadingDetails && <div className="helper-text">Atualizando detalhes relacionados...</div>}

                    <DeleteBehaviorField
                      resourcePath="/alunos"
                      entityId={currentAluno.id_aluno}
                      active={currentAluno.ativo !== false}
                      onActiveChange={(value) => updateDraft('ativo', value)}
                      onDelete={(capability) => handleDeleteAluno(currentAluno.id_aluno, capability)}
                    />
                  </div>

                  <div className="toolbar" style={{ marginTop: 8 }}>
                    <button className="btn" type="submit">Salvar</button>
                    <DeleteBehaviorField placement="toolbar" resourcePath="/alunos" entityId={currentAluno.id_aluno} active={currentAluno.ativo !== false} onActiveChange={(value) => updateDraft('ativo', value)} onDelete={(capability) => handleDeleteAluno(currentAluno.id_aluno, capability)} />
                    <button className="btn ghost" type="button" onClick={closePanel}>Cancelar</button>
                  </div>
                </form>
              )}
            </aside>

            <aside className={`split-panel ${relatedCreatePanel ? 'open' : ''}`}>
              {relatedCreatePanel === 'interesse' && (
                <form
                  noValidate
                  className="card"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCreateInteresse();
                  }}
                >
                  <div className="panel-header">
                    <h3>Novo Interesse</h3>
                    <div className="panel-header-actions">
                      <button className="btn ghost" type="button" onClick={() => setRelatedCreatePanel(null)}>Fechar</button>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="field">
                      <label className="field-label-required" htmlFor="novo-interesse-descricao">Descrição</label>
                      <input
                        id="novo-interesse-descricao"
                        aria-label="Descrição"
                        className="input"
                        required
                        value={newInteresseDescricao}
                        onChange={(event) => setNewInteresseDescricao(event.target.value)}
                        placeholder="Ex: Programação"
                      />
                    </div>
                  </div>

                  <div className="toolbar" style={{ marginTop: 8 }}>
                    <button className="btn" type="submit" disabled={!newInteresseDescricao.trim() || savingInteresseId === 'creating'}>Salvar</button>
                    <button className="btn ghost" type="button" onClick={() => setRelatedCreatePanel(null)}>Cancelar</button>
                  </div>
                </form>
              )}

              {relatedCreatePanel === 'trilha' && (
                <form
                  noValidate
                  className="card"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCreateTrilha();
                  }}
                >
                  <div className="panel-header">
                    <h3>Nova Trilha</h3>
                    <div className="panel-header-actions">
                      <button className="btn ghost" type="button" onClick={() => setRelatedCreatePanel(null)}>Fechar</button>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="field">
                      <label className="field-label-required" htmlFor="nova-trilha-nome">Nome da Trilha</label>
                      <input
                        id="nova-trilha-nome"
                        aria-label="Nome da Trilha"
                        className="input"
                        required
                        value={newTrilhaNome}
                        onChange={(event) => setNewTrilhaNome(event.target.value)}
                        placeholder="Ex: Python Básico"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="nova-trilha-descricao">Descrição</label>
                      <input
                        id="nova-trilha-descricao"
                        aria-label="Descrição da trilha"
                        className="input"
                        value={newTrilhaDescricao}
                        onChange={(event) => setNewTrilhaDescricao(event.target.value)}
                        placeholder="Descrição da trilha"
                      />
                    </div>
                  </div>

                  <div className="toolbar" style={{ marginTop: 8 }}>
                    <button className="btn" type="submit" disabled={!newTrilhaNome.trim() || savingTrilhaId === 'creating'}>Salvar</button>
                    <button className="btn ghost" type="button" onClick={() => setRelatedCreatePanel(null)}>Cancelar</button>
                  </div>
                </form>
              )}
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}