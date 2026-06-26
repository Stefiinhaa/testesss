import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ListFilter, Plus, ThumbsDown, ThumbsUp, Trash2, X, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/apiConfig';
import DeleteBehaviorField from '../components/DeleteBehaviorField';
import EntityHeader from '../components/EntityHeader';
import ListFilterDrawer from '../components/ListFilterDrawer';
import ListPagination, { DEFAULT_PAGE_SIZE } from '../components/ListPagination';
import notify from '../utils/notify';
import { buildFilterParams } from '../utils/filterParams';
import { validateFormInDomOrder } from '../utils/formValidation';
import { normalizePagedResponse } from '../utils/pagedResponse';

const PRESENCA_OPTIONS = ['Presente', 'Ausente'];
const FILTER_DEFS = [
  { key: 'data', label: 'Data', param: 'data_in' },
  { key: 'presenca', label: 'Presença', param: 'presenca_in' },
  { key: 'nome', label: 'Nome do Aluno', param: 'nome_in' },
  { key: 'email', label: 'E-mail', param: 'email_in' },
  { key: 'cpf', label: 'CPF', param: 'cpf_in' },
  { key: 'rg', label: 'RG', param: 'rg_in' },
  { key: 'data_nascimento', label: 'Data de Nascimento', param: 'data_nascimento_in' },
  { key: 'cidade_naturalidade', label: 'Cidade de Nascimento', param: 'cidade_naturalidade_in' },
  { key: 'sexo', label: 'Sexo', param: 'sexo_in' },
  { key: 'cor', label: 'Cor', param: 'cor_in' },
  { key: 'estado', label: 'Estado Residencial', param: 'estado_in' },
  { key: 'estado_naturalidade', label: 'Estado de Naturalidade', param: 'estado_naturalidade_in' },
  { key: 'fone_celular_ddi', label: 'Fone Celular DDI', param: 'fone_celular_ddi_in' },
  { key: 'fone_celular_ddd', label: 'Fone Celular DDD', param: 'fone_celular_ddd_in' },
  { key: 'fone_celular_numero', label: 'Fone Celular Número', param: 'fone_celular_numero_in' },
  { key: 'cep_residencial', label: 'CEP Residencial', param: 'cep_residencial_in' },
  { key: 'rua_residencial', label: 'Rua', param: 'rua_residencial_in' },
  { key: 'num_residencial', label: 'Número', param: 'num_residencial_in' },
  { key: 'complemento_residencial', label: 'Complemento', param: 'complemento_residencial_in' },
  { key: 'situacao', label: 'Situação', param: 'situacao_in' },
  { key: 'turno', label: 'Turno', param: 'turno_in' },
  { key: 'escola_ensino_medio', label: 'Escola Ensino Médio', param: 'escola_ensino_medio_in' }, // Corrigido para Ensino Médio
  { key: 'escola_atual', label: 'Escola Atual', param: 'escola_atual_in' }, // Corrigido para Escola Atual
  { key: 'data_ingresso', label: 'Data de Ingresso', param: 'data_ingresso_in' },
  { key: 'data_conclusao', label: 'Data de Conclusão', param: 'data_conclusao_in' },
  { key: 'trabalho', label: 'Trabalho', param: 'trabalho_in' },
  { key: 'estagio', label: 'Estágio', param: 'estagio_in' },
  { key: 'empresa', label: 'Empresa', param: 'empresa_in' },
  { key: 'funcao', label: 'Função', param: 'funcao_in' },
  { key: 'contente', label: 'Contente', param: 'contente_in' }, // Adicionado
  { key: 'setor', label: 'Setor', param: 'setor_in' },
  { key: 'cidade', label: 'Cidade Residencial', param: 'cidade_in' },
  { key: 'bairro', label: 'Bairro Residencial', param: 'bairro_in' },
  { key: 'pais', label: 'País', param: 'pais_in' },
  { key: 'nacionalidade', label: 'Nacionalidade', param: 'nacionalidade_in' },
  { key: 'naturalidade', label: 'Naturalidade', param: 'naturalidade_in' },
  { key: 'foto', label: 'Foto', param: 'foto_in' },
  { key: 'whatsapp', label: 'WhatsApp', param: 'whatsapp_in' },
  { key: 'aluno_destaque', label: 'Aluno Destaque', param: 'aluno_destaque_in' },
  { key: 'turma', label: 'Turma', param: 'turma_in' },
  { key: 'turma_ingresso', label: 'Turma de Ingresso', param: 'turma_ingresso_in' },
  { key: 'total_aulas', label: 'Total de Aulas', param: 'total_aulas_in' },
  { key: 'presencas', label: 'Presenças', param: 'presencas_in' },
  { key: 'ausencias', label: 'Ausências', param: 'ausencias_in' },
  { key: 'aula', label: 'Aula', param: 'aula_in' },
  { key: 'id_matricula', label: 'Matrícula', param: 'id_matricula' },
  { key: 'ativo', label: 'Status (Ativo/Inativo)', param: 'ativo_in' },
];

const FILTER_DEF_MAP = FILTER_DEFS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

const mergeSelectOptions = (...groups) => Array.from(new Set(
  groups
    .flatMap((group) => (Array.isArray(group) ? group : [group]))
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
));

const mergeFilterOptions = (...optionGroups) => {
  const merged = {};
  optionGroups.forEach((group) => {
    Object.entries(group || {}).forEach(([key, values]) => {
      merged[key] = Array.from(new Set([...(merged[key] || []), ...((values || []).filter(Boolean))])).sort((left, right) => (
        String(left).localeCompare(String(right), 'pt-BR', { numeric: true, sensitivity: 'base' })
      ));
    });
  });
  return merged;
};

const buildFrequenciaLocalFilterOptions = (rows = []) => {
  const buckets = {
    data: new Set(),
    presenca: new Set(),
    id_aluno: new Set(),
    nome: new Set(),
    foto: new Set(),
    turma_ingresso: new Set(),
    turma: new Set(),
    ativo: new Set(),
    total_aulas: new Set(),
    presencas: new Set(),
    ausencias: new Set(),
    aula: new Set(),
    id_matricula: new Set(),
  };

  rows.forEach((row) => {
    const values = {
      data: row?.Data || row?.data,
      presenca: row?.Presenca || row?.presenca,
      foto: row?.Foto || row?.foto || row?.imagem || row?.Imagem,
      id_aluno: row?.NomeAluno || row?.nome_aluno,
      nome: row?.NomeAluno || row?.nome_aluno,
      turma_ingresso: row?.TurmaIngresso || row?.turma_ingresso,
      turma: row?.TurmaIngresso || row?.turma_ingresso,
      ativo: row?.ativo === false ? 'Inativo' : 'Ativo',
      total_aulas: row?.TotalAulas ?? row?.total_aulas,
      presencas: row?.Presencas ?? row?.presencas,
      related_chamadas: row?.RelatedChamadas ?? row?.related_chamadas,
      aula: row?.NomeAula || row?.Aula || row?.nome_aula || row?.aula,
      id_matricula: row?.NomeMatricula || row?.IdMatricula || row?.nome_matricula || row?.id_matricula,
    };

    Object.entries(values).forEach(([key, rawValue]) => {
      const value = String(rawValue ?? '').trim();
      if (value && buckets[key]) buckets[key].add(value);
    });
  });

  return Object.fromEntries(
    Object.entries(buckets).map(([key, values]) => [
      key,
      Array.from(values).sort((left, right) => String(left).localeCompare(String(right), 'pt-BR', { numeric: true, sensitivity: 'base' })),
    ]),
  );
};

const normalizeAtivoValue = (value) => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return !['false', '0', 'nao', 'não', 'inativo'].includes(normalized);
  }
  return value !== false && value !== 0;
};

const getPresenceMeta = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const isPresent = ['presente', 'sim', 'p', 'true', '1'].includes(normalized);
  return {
    Icon: isPresent ? CheckCircle2 : XCircle,
    className: isPresent ? 'status-positive' : 'status-negative',
  };
};

const formatDateBR = (value) => {
  if (!value) return '-';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}/${month}/${year}`;
  }
  return raw;
};


const normalizeChamadaFilterOptions = (options = {}) => {
  const normalized = { ...options };
  if (Array.isArray(options?.id_aluno) && !Array.isArray(options?.nome)) {
    normalized.nome = options.id_aluno;
  }
  if (Array.isArray(options?.turma) && !Array.isArray(options?.turma_ingresso)) {
    normalized.turma_ingresso = options.turma;
  }
    normalized.ativo = ['Ativo', 'Inativo'];
  return normalized;
};

export default function ChamadasPage() {
  const [searchParams] = useSearchParams();
  const origin = searchParams.get('origin');
  const alunoId = searchParams.get('aluno') || '';
  const alunoNome = searchParams.get('alunoNome') || 'Aluno';
  const [items, setItems] = useState([]);
  const [formOptions, setFormOptions] = useState({ alunos: [], aulas: [], matriculas: [], presencas: [] });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('data');
  const [sortDir, setSortDir] = useState('desc');

  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterField, setSelectedFilterField] = useState(FILTER_DEFS[0].key);
  const [selectedFilterValue, setSelectedFilterValue] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [showInativos, setShowInativos] = useState(false);

  const [panelMode, setPanelMode] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [newItem, setNewItem] = useState({ IdChamada: '', Data: '', IdAluno: '', Aula: '', Presenca: '', IdMatricula: '' });
  const [relatedChamadas, setRelatedChamadas] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedExpanded, setRelatedExpanded] = useState(false);

  // ── Tela expandida de chamadas de um aluno ──────────────────────────────
  const [expandedAluno, setExpandedAluno] = useState(null); // { IdAluno, NomeAluno } | null
  const [frequenciaEditItem, setFrequenciaEditItem] = useState(null); // frequência salva p/ restaurar
  const [expandedItems, setExpandedItems] = useState([]);
  const [expandedPage, setExpandedPage] = useState(1);
  const [expandedPageSize, setExpandedPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [expandedTotal, setExpandedTotal] = useState(0);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [expandedSortBy, setExpandedSortBy] = useState('data');
  const [expandedSortDir, setExpandedSortDir] = useState('desc');
  const [showExpandedSelection, setShowExpandedSelection] = useState(false);
  const [selectedExpandedIds, setSelectedExpandedIds] = useState([]);

  const fetchItems = async (
    pageToFetch = page,
    perPage = pageSize,
    q = query,
    filters = activeFilters,
    sortField = sortBy,
    sortDirection = sortDir,
    includeInactive = showInativos,
  ) => {
    setLoading(true);
    try {
      const filterParams = buildFilterParams(filters, FILTER_DEF_MAP);
      const resp = await api.get('/chamadas/frequencia-resumo', {
        params: {
          page: pageToFetch,
          per_page: perPage,
          q,
          include_inativos: includeInactive,
          sort_by: sortField,
          sort_dir: sortDirection,
          ...filterParams,
        },
      });
      const normalized = normalizePagedResponse(resp.data, pageToFetch);
      const rows = normalized.items || [];
      const normalizedRows = rows.map((row) => ({
        ...row,
        ativo: normalizeAtivoValue(row.ativo ?? row.Ativo),
      }));
      setItems(normalizedRows);
      setTotal(normalized.total || 0);
      setPage(normalized.page || pageToFetch);
      setError(null);
    } catch (err) {
      console.error(err);
      setItems([]);
      setTotal(0);
      setError('Erro ao carregar chamadas.');
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const resp = await api.get('/chamadas/filter-options', {
        params: {
          include_inativos: showInativos,
        },
      });
      const options = normalizeChamadaFilterOptions((resp.data || {}).options || {});
      setFilterOptions(mergeFilterOptions(buildFrequenciaLocalFilterOptions(items), options));
    } catch (err) {
      console.error(err);
      setFilterOptions(buildFrequenciaLocalFilterOptions(items));
    }
  };

  const fetchFormOptions = async () => {
    try {
      const response = await api.get('/chamadas/form-options');
      setFormOptions({
        alunos: response.data?.alunos || [],
        aulas: response.data?.aulas || [],
        matriculas: response.data?.matriculas || [],
        presencas: response.data?.presencas || [],
      });
    } catch (err) {
      console.error(err);
      setFormOptions({ alunos: [], aulas: [], matriculas: [], presencas: [] });
    }
  };

  useEffect(() => {
    fetchFormOptions();
    fetchFilterOptions();
    fetchItems(1, DEFAULT_PAGE_SIZE, '', {}, 'data', 'desc', showInativos);
  }, []);

  useEffect(() => {
    fetchFilterOptions();
  }, [showInativos]);

  useEffect(() => {
    if (page) fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir, showInativos);
  }, [page, pageSize, query, activeFilters, sortBy, sortDir, showInativos]);

  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    setEditingItem(null);
    setNewItem((previous) => ({
      ...previous,
      IdChamada: '',
      Data: '',
      IdAluno: searchParams.get('aluno') || previous.IdAluno || '',
      Aula: searchParams.get('aula') || previous.Aula || '',
      Presenca: previous.Presenca || 'Presente',
      IdMatricula: searchParams.get('matricula') || previous.IdMatricula || '',
    }));
    setPanelMode('create');
  }, [searchParams]);

  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const rangeStart = total ? ((page - 1) * pageSize) + 1 : 0;
  const rangeEnd = total ? Math.min(page * pageSize, total) : 0;
  const expandedPages = Math.max(1, Math.ceil((expandedTotal || 0) / expandedPageSize));
  const expandedRangeStart = expandedTotal ? ((expandedPage - 1) * expandedPageSize) + 1 : 0;
  const expandedRangeEnd = expandedTotal ? Math.min(expandedPage * expandedPageSize, expandedTotal) : 0;
  const isReadOnlyDetails = false;

  const resetForm = () => setNewItem({ IdChamada: '', Data: '', IdAluno: '', Aula: '', Presenca: '', IdMatricula: '' });

  const fetchRelatedChamadas = async (idAluno) => {
    if (!idAluno) {
      setRelatedChamadas([]);
      return;
    }
    setRelatedLoading(true);
    try {
      const resp = await api.get('/chamadas/', {
        params: {
          page: 1,
          per_page: 100,
          id_aluno: idAluno,
          sort_by: 'data',
          sort_dir: 'desc',
          include_inativos: showInativos,
        },
      });
      const normalized = normalizePagedResponse(resp.data, 1);
      const rows = normalized.items || [];
      setRelatedChamadas(rows);
    } catch (err) {
      console.error(err);
      setRelatedChamadas([]);
    } finally {
      setRelatedLoading(false);
    }
  };

  const startCreate = (alunoContext = null) => {
    setEditingItem(null);
    if (alunoContext?.IdAluno) {
      setNewItem({ IdChamada: '', Data: '', IdAluno: alunoContext.IdAluno, Aula: '', Presenca: 'Presente', IdMatricula: '' });
    } else {
      resetForm();
    }
    setPanelMode('create');
  };

  const startEdit = (item) => {
    setEditingItem({
      ativo: normalizeAtivoValue(item.ativo ?? item.Ativo),
      ...item,
      Data: item.Data || '',
      Presenca: item.Presenca || '',
      Aula: item.Aula || '',
      IdMatricula: item.IdMatricula || '',
    });
    setRelatedExpanded(false);
    setPanelMode('edit');
    fetchRelatedChamadas(item.IdAluno);
  };

  const closePanel = () => {
    setEditingItem(null);
    setRelatedChamadas([]);
    setRelatedExpanded(false);
    setPanelMode(null);
  };

  const fetchExpandedItems = async (
    aluno,
    pg = expandedPage,
    perPage = expandedPageSize,
    sortField = expandedSortBy,
    sortDirection = expandedSortDir,
  ) => {
    if (!aluno?.IdAluno) return;
    setExpandedLoading(true);
    try {
      const resp = await api.get('/chamadas/', {
        params: {
          page: pg,
          per_page: perPage,
          id_aluno: aluno.IdAluno,
          sort_by: sortField,
          sort_dir: sortDirection,
          include_inativos: showInativos,
        },
      });
      const normalized = normalizePagedResponse(resp.data, pg);
      const rows = normalized.items || [];
      setExpandedItems(rows);
      setExpandedTotal(normalized.total || 0);
      setExpandedPage(normalized.page || pg);
    } catch (err) {
      console.error(err);
      setExpandedItems([]);
      setExpandedTotal(0);
    } finally {
      setExpandedLoading(false);
    }
  };

  const openExpandedView = (alunoContext) => {
    if (!alunoContext?.IdAluno) return;
    setFrequenciaEditItem(editingItem);
    setExpandedAluno(alunoContext);
    setShowExpandedSelection(false);
    setSelectedExpandedIds([]);
    setExpandedPage(1);
    setExpandedItems([]);
    closePanel();
    fetchExpandedItems(alunoContext, 1, expandedPageSize, expandedSortBy, expandedSortDir);
  };

  const closeExpandedView = () => {
    const previous = frequenciaEditItem;
    setExpandedAluno(null);
    setExpandedItems([]);
    setShowExpandedSelection(false);
    setSelectedExpandedIds([]);
    setExpandedPage(1);
    setFrequenciaEditItem(null);
    closePanel();
    if (previous) {
      setEditingItem(previous);
      setPanelMode('edit');
      fetchRelatedChamadas(previous.IdAluno);
    }
  };

  const startEditChamada = (chamada) => {
    setEditingItem({
      ativo: normalizeAtivoValue(chamada.ativo ?? chamada.Ativo),
      ...chamada,
      Data: chamada.Data || '',
      Presenca: chamada.Presenca || '',
      Aula: chamada.Aula || '',
      IdMatricula: chamada.IdMatricula || '',
    });
    setPanelMode('edit-chamada');
  };

  const expandedBulkCountLabel = useMemo(() => `${selectedExpandedIds.length} selecionado(s)`, [selectedExpandedIds]);

  const resetExpandedSelection = () => setSelectedExpandedIds([]);

  const toggleExpandedSelectionMode = () => {
    setShowExpandedSelection((previous) => {
      if (previous) {
        resetExpandedSelection();
      }
      return !previous;
    });
  };

  const handleExpandedSelectionChange = (event, id) => {
    event.stopPropagation();
    setSelectedExpandedIds((previous) => (previous.includes(id)
      ? previous.filter((value) => value !== id)
      : [...previous, id]));
  };

  const handleExpandedBulkDelete = async () => {
    if (!selectedExpandedIds.length || !window.confirm('Remover chamadas selecionadas?')) return;
    try {
      await Promise.all(selectedExpandedIds.map((id) => api.delete(`/chamadas/${id}`)));
      resetExpandedSelection();
      await fetchExpandedItems(expandedAluno, expandedPage, expandedPageSize, expandedSortBy, expandedSortDir);
      fetchFilterOptions();
      notify('Chamadas removidas', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao remover chamadas', { duration: 3500 });
    }
  };

  const expandedSortIndicator = (field) => {
    if (expandedSortBy !== field) return '↕';
    return expandedSortDir === 'asc' ? '↑' : '↓';
  };

  const toggleExpandedSort = (field) => {
    if (expandedSortBy === field) {
      const next = expandedSortDir === 'asc' ? 'desc' : 'asc';
      setExpandedSortDir(next);
      fetchExpandedItems(expandedAluno, 1, expandedPageSize, field, next);
    } else {
      setExpandedSortBy(field);
      setExpandedSortDir('asc');
      fetchExpandedItems(expandedAluno, 1, expandedPageSize, field, 'asc');
    }
    setExpandedPage(1);
  };

  const updateEditingItem = (field, value) => {
    setEditingItem((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!validateFormInDomOrder({ form: e.currentTarget, notify })) return;
    try {
      await api.post('/chamadas/', {
        IdChamada: newItem.IdChamada || undefined,
        Data: newItem.Data || undefined,
        IdAluno: newItem.IdAluno,
        Aula: newItem.Aula || null,
        Presenca: newItem.Presenca || undefined,
        IdMatricula: newItem.IdMatricula || null,
      });
      resetForm();
      closePanel();
      if (expandedAluno) {
        fetchExpandedItems(expandedAluno, expandedPage, expandedPageSize, expandedSortBy, expandedSortDir);
      } else {
        fetchItems(1, pageSize, query, activeFilters, sortBy, sortDir);
      }
      fetchFilterOptions();
      notify('Chamada criada', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao criar chamada', { duration: 3500 });
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!validateFormInDomOrder({ form: e.currentTarget, notify })) return;
    if (!editingItem) return;
    try {
      await api.put(`/chamadas/${editingItem.IdChamada}`, {
        Data: editingItem.Data || undefined,
        IdAluno: editingItem.IdAluno,
        Aula: editingItem.Aula || null,
        Presenca: editingItem.Presenca || undefined,
        IdMatricula: editingItem.IdMatricula || null,
        Ativo: editingItem.ativo !== false,
      });
      closePanel();
      if (expandedAluno) {
        fetchExpandedItems(expandedAluno, expandedPage, expandedPageSize, expandedSortBy, expandedSortDir);
      } else {
        fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
      }
      fetchFilterOptions();
      notify('Chamada atualizada', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao atualizar chamada', { duration: 3500 });
    }
  };

  const handleDelete = async (id, capability = null) => {
    const confirmationMessage = capability?.confirmation_message || 'Remover chamada?';
    if (!confirm(confirmationMessage)) return;
    try {
      const response = await api.delete(`/chamadas/${id}`);
      if (expandedAluno) {
        fetchExpandedItems(expandedAluno, expandedPage, expandedPageSize, expandedSortBy, expandedSortDir);
      } else {
        fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
      }
      fetchFilterOptions();
      notify(response?.data?.message || 'Chamada removida', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao remover chamada', { duration: 3500 });
    }
  };

  const addFilterCriterion = () => {
    if (!selectedFilterField || !selectedFilterValue) return;
    setActiveFilters((prev) => {
      const current = prev[selectedFilterField] || [];
      if (current.includes(selectedFilterValue)) return prev;
      return {
        ...prev,
        [selectedFilterField]: [...current, selectedFilterValue],
      };
    });
    setSelectedFilterValue('');
    setPage(1);
  };

  const removeFilterCriterion = (fieldKey, value) => {
    setActiveFilters((prev) => {
      const current = prev[fieldKey] || [];
      const updated = current.filter((item) => item !== value);
      const next = { ...prev };
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
    setSelectedFilterField(fieldKey);
    setSelectedFilterValue('');
    setActiveFilters((previous) => {
      const current = previous[fieldKey] || [];
      if (current.includes(value)) {
        const updated = current.filter((item) => item !== value);
        const next = { ...previous };
        if (updated.length) next[fieldKey] = updated;
        else delete next[fieldKey];
        return next;
      }
      return { ...previous, [fieldKey]: [...current, value] };
    });
    setPage(1);
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      setPage(1);
      return;
    }
    setSortBy(field);
    setSortDir('asc');
    setPage(1);
  };

  const sortIndicator = (field) => {
    if (sortBy !== field) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const activeFilterChips = Object.entries(activeFilters).flatMap(([fieldKey, values]) => (
    (values || []).map((value) => ({
      fieldKey,
      value,
      label: FILTER_DEF_MAP[fieldKey]?.label || fieldKey,
    }))
  ));

  const drawerFilterOptions = useMemo(() => mergeFilterOptions(filterOptions, {
    presenca: formOptions.presencas,
    id_aluno: formOptions.alunos.map((item) => item.nome),
    foto: filterOptions.foto,
    aula: formOptions.aulas.map((item) => item.nome),
    id_matricula: formOptions.matriculas.map((item) => item.nome),
  }, buildFrequenciaLocalFilterOptions(items)), [filterOptions, formOptions, items]);
  const selectableValues = drawerFilterOptions[selectedFilterField] || [];
  const presencaOptions = mergeSelectOptions(
    PRESENCA_OPTIONS,
    formOptions.presencas,
    filterOptions.presenca,
    panelMode === 'edit' ? editingItem?.Presenca : newItem.Presenca,
  );
  const activeFilterCount = activeFilterChips.length;

  return (
    <div className={`app-shell app-shell-tight entity-page ${showExpandedSelection ? 'selection-mode' : ''}`}>
      <EntityHeader
        breadcrumbs={expandedAluno
          ? [{ label: 'Frequência' }, { label: expandedAluno.NomeAluno || 'Aluno' }, { label: 'Chamadas Relacionadas' }]
          : (origin === 'alunos'
            ? [
              { label: 'Alunos', to: '/alunos' },
              { label: alunoNome, to: alunoId ? `/alunos?edit=${encodeURIComponent(alunoId)}` : '/alunos' },
              { label: 'Chamadas' },
            ]
            : [{ label: 'Frequência' }])}
        title={expandedAluno ? `Chamadas de ${expandedAluno?.NomeAluno || 'Aluno'}` : 'Frequência'}
        meta={expandedAluno ? `${expandedTotal} chamada(s)` : `${total} registro(s)`}
        filterChips={expandedAluno ? [] : activeFilterChips}
        onRemoveFilterChip={expandedAluno ? undefined : removeFilterCriterion}
        actions={expandedAluno ? (
          <>
            <button type="button" className={`icon-action-btn selection-toggle-btn ${showExpandedSelection ? 'active' : ''}`} aria-label="Alternar seleção" onClick={toggleExpandedSelectionMode}>
              {showExpandedSelection ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
            </button>
            <button type="button" className="icon-action-btn entity-add-btn" aria-label="Nova chamada" onClick={() => startCreate(expandedAluno)}>
              <Plus size={17} />
              <span>Nova Chamada</span>
            </button>
            <button type="button" className="icon-action-btn" aria-label="Fechar" onClick={closeExpandedView}>
              <X size={17} />
              <span>Fechar</span>
            </button>
          </>
        ) : (
          <>
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

            <button type="button" className="icon-action-btn filter-toggle-btn" aria-label="Abrir filtros" onClick={() => setShowFilters((prev) => !prev)}>
              {showFilters ? <X size={17} /> : <ListFilter size={17} />}
            </button>
            <button type="button" className="icon-action-btn entity-add-btn" aria-label="Adicionar chamada" onClick={() => startCreate()}>
              <Plus size={17} />
              <span>Adicionar</span>
            </button>
          </>
        )}
      />

      {!expandedAluno && (
        <ListFilterDrawer
          open={showFilters}
          dataTestId="chamadas-filter-drawer"
          subtitle="Use presença e vínculo do aluno sem expor identificadores completos na grade."
          closeButton={<button type="button" className="icon-action-btn" aria-label="Fechar filtros" onClick={() => setShowFilters(false)}><span aria-hidden="true">←</span></button>}
          searchId="chamadas-drawer-search"
          query={query}
          onQueryChange={(e) => { setQuery(e.target.value); setPage(1); }}
          filterDefs={FILTER_DEFS}
          filterOptions={drawerFilterOptions}
          activeFilters={activeFilters}
          onToggleFilterValue={toggleFilterValue}
          selectedFilterField={selectedFilterField}
          onSelectedFilterFieldChange={(e) => { setSelectedFilterField(e.target.value); setSelectedFilterValue(''); }}
          selectedFilterValue={selectedFilterValue}
          onSelectedFilterValueChange={(e) => setSelectedFilterValue(e.target.value)}
          selectableValues={selectableValues}
          onAddFilterCriterion={addFilterCriterion}
          showInativos={showInativos}
          onShowInativosChange={(e) => { setShowInativos(e.target.checked); setPage(1); }}
          activeFilterChips={activeFilterChips}
          onRemoveFilterCriterion={removeFilterCriterion}
          onClearAllFilterCriteria={clearAllFilterCriteria}
          showInlineActiveChips={false}
        />
      )}

      {expandedAluno && selectedExpandedIds.length > 0 && (
        <section className="bulk-action-bar card">
          <strong>{expandedBulkCountLabel}</strong>
          <div className="entity-actions">
            <button type="button" className="icon-action-btn danger" aria-label="Remover selecionados" onClick={handleExpandedBulkDelete}>
              <Trash2 size={17} />
            </button>
            <button type="button" className="icon-action-btn" aria-label="Limpar seleção" onClick={resetExpandedSelection}>
              <X size={17} />
            </button>
          </div>
        </section>
      )}

      <section>
        {expandedAluno ? (
          <div className={`split-layout ${panelMode === 'create' || panelMode === 'edit-chamada' ? 'has-panel' : ''}`}>
            <div className="split-main">
              <div className="card table-card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="compact-table-select">{showExpandedSelection ? 'Selecionar' : ''}</th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleExpandedSort('data')}> {/* IdChamada is not displayed in the GUI */}
                            Data <span className="sort-indicator">{expandedSortIndicator('data')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleExpandedSort('aula')}>
                            Aula <span className="sort-indicator">{expandedSortIndicator('aula')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleExpandedSort('presenca')}>
                            Presença <span className="sort-indicator">{expandedSortIndicator('presenca')}</span>
                          </button>
                        </th>
                        <th className="sticky-actions">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expandedLoading ? (
                        <tr><td colSpan={5} style={{ textAlign: 'center' }}>Carregando chamadas...</td></tr>
                      ) : (expandedItems.length > 0 ? expandedItems.map((item) => {
                        const presenceMeta = getPresenceMeta(item.Presenca);
                        const selected = selectedExpandedIds.includes(item.IdChamada);
                        return (
                          <tr key={item.IdChamada || `${item.Data}-${item.Aula}`} className={`data-row ${selected ? 'is-selected' : ''}`} onClick={() => startEditChamada(item)}>
                            <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                              {showExpandedSelection && ( /* IdChamada is not displayed in the GUI */
                                <input type="checkbox" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => handleExpandedSelectionChange(event, item.IdChamada)} />
                              )}
                            </td>
                            <td>{formatDateBR(item.Data)}</td>
                            <td>{item.NomeAula || item.Aula || '-'}</td>
                            <td><span className={`status-indicator ${presenceMeta.className}`}><presenceMeta.Icon size={14} /> {item.Presenca || '-'}</span></td>
                            <td className="sticky-actions">
                              <button
                                className="icon-btn entity-edit-btn"
                                aria-label="Editar chamada"
                                title="Editar chamada"
                                onClick={(event) => { event.stopPropagation(); startEditChamada(item); }}
                              >
                                <span aria-hidden="true">&gt;</span>
                              </button>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan={5} style={{ textAlign: 'center' }}>Sem chamadas relacionadas.</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ListPagination
                  page={expandedPage}
                  pages={expandedPages}
                  total={expandedTotal}
                  pageSize={expandedPageSize}
                  rangeStart={expandedRangeStart}
                  rangeEnd={expandedRangeEnd}
                  setPage={(nextPage) => {
                    setExpandedPage(nextPage);
                    fetchExpandedItems(expandedAluno, nextPage, expandedPageSize, expandedSortBy, expandedSortDir);
                  }}
                  setPageSize={(nextSize) => {
                    setExpandedPageSize(nextSize);
                    setExpandedPage(1);
                    fetchExpandedItems(expandedAluno, 1, nextSize, expandedSortBy, expandedSortDir);
                  }}
                />
              </div>
            </div>

            <aside className={`split-panel ${panelMode === 'create' || panelMode === 'edit-chamada' ? 'open' : ''}`}>
              {(panelMode === 'create' || panelMode === 'edit-chamada') && (
                <form onSubmit={panelMode === 'create' ? handleCreate : handleUpdate} noValidate className="card">
                  <div className="panel-header">
                    <h3>{panelMode === 'create' ? 'Nova Chamada' : 'Editar Chamada'}</h3>
                    <div className="panel-header-actions">
                      <button className="btn ghost" type="button" onClick={closePanel}>Fechar</button>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="field">
                      <label>Data</label>
                      <input
                        className="input"
                        value={panelMode === 'create' ? newItem.Data : (editingItem?.Data || '')}
                        onChange={(e) => panelMode === 'create'
                          ? setNewItem({ ...newItem, Data: e.target.value })
                          : updateEditingItem('Data', e.target.value)}
                        placeholder="Ex: 2024-05-10"
                      />
                    </div>
                    <div className="field">
                      <label>Presença</label>
                      <select
                        className="select"
                        value={panelMode === 'create' ? newItem.Presenca : (editingItem?.Presenca || '')}
                        onChange={(e) => panelMode === 'create'
                          ? setNewItem({ ...newItem, Presenca: e.target.value })
                          : updateEditingItem('Presenca', e.target.value)}
                      >
                        <option value="">Selecione...</option>
                        {presencaOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Aula</label>
                      <select
                        className="select"
                        value={panelMode === 'create' ? newItem.Aula : (editingItem?.Aula || '')}
                        onChange={(e) => panelMode === 'create'
                          ? setNewItem({ ...newItem, Aula: e.target.value })
                          : updateEditingItem('Aula', e.target.value)}
                      >
                        <option value="">Selecione...</option>
                        {formOptions.aulas.map((item) => (
                          <option key={item.id} value={item.id}>{item.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="field-label-required">Aluno</label>
                      <select
                        required
                        // IdAluno is not displayed in the GUI
                        className="select"
                        value={panelMode === 'create' ? (newItem.IdAluno || expandedAluno?.IdAluno || '') : (editingItem?.IdAluno || expandedAluno?.IdAluno || '')}
                        disabled
                      >
                        <option value={expandedAluno?.IdAluno || ''}>{expandedAluno?.NomeAluno || 'Aluno selecionado'}</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Matrícula</label>
                      <select
                        className="select"
                        value={panelMode === 'create' ? newItem.IdMatricula : (editingItem?.IdMatricula || '')}
                        // IdMatricula is not displayed in the GUI
                        onChange={(e) => panelMode === 'create'
                          ? setNewItem({ ...newItem, IdMatricula: e.target.value, IdAluno: expandedAluno?.IdAluno || newItem.IdAluno })
                          : updateEditingItem('IdMatricula', e.target.value)}
                      >
                        <option value="">Selecione...</option>
                        {formOptions.matriculas
                          .filter((item) => item.id_aluno === (expandedAluno?.IdAluno || (panelMode === 'create' ? newItem.IdAluno : editingItem?.IdAluno)))
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.data_matricula ? formatDateBR(item.data_matricula) : item.nome}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {panelMode === 'edit-chamada' && (
                    <DeleteBehaviorField
                      value={editingItem?.ativo !== false}
                      onChange={(next) => updateEditingItem('ativo', next)}
                    />
                  )}

                  <div className="toolbar" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
                    <button className="btn" type="submit">Salvar</button>
                    <button className="btn ghost" type="button" onClick={closePanel}>Cancelar</button>
                  </div>
                </form>
              )}
            </aside>
          </div>
        ) : (
          <div className={`split-layout ${panelMode ? 'has-panel' : ''}`}>
            <div className="split-main">
              {loading && <div className="loading-overlay-shim">Carregando...</div>}
              {error && (
                <section className="card error-message">
                  <strong>Erro:</strong> {error}
                </section>
              )}

              <div className="card table-card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="compact-table-select"></th>
                        <th style={{ width: 48 }}>Foto</th>
                        <th><button type="button" className="sort-btn" onClick={() => toggleSort('nome_aluno')}>Nome Completo do Aluno(a) <span className="sort-indicator">{sortIndicator('nome_aluno')}</span></button></th> {/* IdAluno is not displayed in the GUI */}
                        <th><button type="button" className="sort-btn" onClick={() => toggleSort('turma_ingresso')}>Turma de Ingresso <span className="sort-indicator">{sortIndicator('turma_ingresso')}</span></button></th>
                        <th><button type="button" className="sort-btn" onClick={() => toggleSort('total_aulas')}>Total de Aulas <span className="sort-indicator">{sortIndicator('total_aulas')}</span></button></th>
                        <th><button type="button" className="sort-btn" onClick={() => toggleSort('presencas')}>Presenças <span className="sort-indicator">{sortIndicator('presencas')}</span></button></th>
                        <th><button type="button" className="sort-btn" onClick={() => toggleSort('ausencias')}>Ausências <span className="sort-indicator">{sortIndicator('ausencias')}</span></button></th>
                        <th><button type="button" className="sort-btn" onClick={() => toggleSort('related_chamadas')}>Chamadas Relacionadas <span className="sort-indicator">{sortIndicator('related_chamadas')}</span></button></th>
                        <th><button type="button" className="sort-btn" onClick={() => toggleSort('ativo')}>Status <span className="sort-indicator">{sortIndicator('ativo')}</span></button></th>
                        <th className="sticky-actions">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length > 0 ? items.map((item) => (
                        <tr key={item.IdAluno} className="data-row" onClick={() => startEdit(item)}>
                          <td className="selection-cell"></td>
                          <td>
                            <div className="avatar-cell">
                              {item.Foto ? (
                                <img src={item.Foto} alt="" className="avatar-small" onError={(e) => { e.target.src = '/placeholder-user.png'; }} />
                              ) : (
                                <div className="avatar-placeholder-small" />
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="table-primary-text">{item.NomeAluno || 'Aluno não informado'}</div>
                          </td>
                          <td>{item.TurmaIngresso || '-'}</td>
                          <td><span className="status-indicator status-info"><CalendarDays size={14} /> {item.TotalAulas || 0}</span></td>
                          <td><span className="status-indicator status-positive"><CheckCircle2 size={14} /> {item.Presencas || 0}</span></td>
                          <td><span className="status-indicator status-negative"><XCircle size={14} /> {item.Ausencias || 0}</span></td>
                          <td>{item.RelatedChamadas || 0}</td>
                          <td>{item.ativo !== false ? 'Ativo' : 'Inativo'}</td>
                          <td className="sticky-actions">
                            <button className="icon-btn entity-edit-btn" aria-label="Detalhes" title="Detalhes" onClick={(event) => { event.stopPropagation(); startEdit(item); }}>
                              <span aria-hidden="true">&gt;</span>
                            </button>
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan={9} style={{ textAlign: 'center' }}>Nenhuma chamada encontrada.</td></tr>
                      )}
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
                <form onSubmit={panelMode === 'create' ? handleCreate : (e) => e.preventDefault()} noValidate className="card">
                  <div className="panel-header">
                    <h3>{panelMode === 'edit' ? 'Detalhes da Frequência' : 'Nova Chamada'}</h3>
                    <div className="panel-header-actions">
                      <button className="btn ghost" type="button" onClick={closePanel}>Fechar</button>
                    </div>
                  </div>

                  {panelMode === 'edit' && (
                    <>
                      <div className="related-metrics-grid" aria-label="Totais de frequência do aluno">
                        <div className="record-meta"><strong>Nome Completo do Aluno(a)</strong><span>{editingItem?.NomeAluno || '-'}</span></div>
                        <div className="record-meta"><strong>Turma de Ingresso</strong><span>{editingItem?.TurmaIngresso || '-'}</span></div>
                        <div className="record-meta"><strong>Total de Aulas</strong><span><span className="status-indicator status-info"><CalendarDays size={14} /> {editingItem?.TotalAulas || 0}</span></span></div>
                        <div className="record-meta"><strong>Presenças</strong><span><span className="status-indicator status-positive"><CheckCircle2 size={14} /> {editingItem?.Presencas || 0}</span></span></div>
                        <div className="record-meta"><strong>Ausências</strong><span><span className="status-indicator status-negative"><XCircle size={14} /> {editingItem?.Ausencias || 0}</span></span></div>
                        <div className="record-meta"><strong>Chamadas Relacionadas</strong><span>{editingItem?.RelatedChamadas || 0}</span></div>
                      </div>

                      <section className="related-section-block">
                        <div className="related-section-header">
                          <strong>Chamadas Relacionadas</strong>
                          <div className="entity-actions related-inline-actions">
                            <button type="button" className="btn ghost" title="Abrir chamadas deste aluno em tela cheia" onClick={() => openExpandedView(editingItem)}>Expandir</button>
                            <button type="button" className="btn" onClick={() => startCreate(editingItem)}>Nova Chamada</button>
                          </div>
                        </div>
                        <div className="table-wrap related-table-wrap">
                          <table>
                            <thead><tr><th>Data</th><th>Aula</th><th>Presença</th></tr></thead>
                            <tbody>
                              {relatedLoading ? (
                                <tr><td colSpan={3}>Carregando chamadas relacionadas...</td></tr>
                              ) : (relatedChamadas.length ? relatedChamadas.map((call, index) => {
                                const presenceMeta = getPresenceMeta(call.Presenca);
                                return (
                                  <tr key={`${call.IdChamada || call.Data || 'call'}:${index}`}>
                                    <td>{formatDateBR(call.Data)}</td>
                                    <td>{call.NomeAula || call.Aula || '-'}</td>
                                    <td><span className={`status-indicator ${presenceMeta.className}`}><presenceMeta.Icon size={14} /> {call.Presenca || '-'}</span></td>
                                  </tr>
                                );
                              }) : (
                                <tr><td colSpan={3}>Sem chamadas relacionadas.</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </>
                  )}

                  {panelMode === 'create' && (
                    <div className="form-row">
                      <div className="field">
                        <label>Data</label>
                        <input className="input" value={newItem.Data} disabled={isReadOnlyDetails} onChange={(e) => setNewItem({ ...newItem, Data: e.target.value })} placeholder="Ex: 2024-05-10" />
                      </div>
                      <div className="field">
                        <label>Presença</label>
                        <select className="select" value={newItem.Presenca} disabled={isReadOnlyDetails} onChange={(e) => setNewItem({ ...newItem, Presenca: e.target.value })}>
                          <option value="">Selecione...</option>
                          {presencaOptions.map((option) => (<option key={option} value={option}>{option}</option>))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Aula</label>
                        <select className="select" value={newItem.Aula} disabled={isReadOnlyDetails} onChange={(e) => setNewItem({ ...newItem, Aula: e.target.value })}>
                          <option value="">Selecione...</option>
                          {formOptions.aulas.map((item) => (<option key={item.id} value={item.id}>{item.nome}</option>))}
                        </select>
                      </div>
                      <div className="field">
                        <label className="field-label-required">Aluno</label>
                        <select required className="select" value={newItem.IdAluno} disabled={isReadOnlyDetails} onChange={(e) => setNewItem({ ...newItem, IdAluno: e.target.value })}>
                          <option value="">Selecione...</option>
                          {formOptions.alunos.map((item) => (<option key={item.id} value={item.id}>{item.nome}</option>))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Matrícula</label>
                        <select className="select" value={newItem.IdMatricula} disabled={isReadOnlyDetails} onChange={(e) => setNewItem({ ...newItem, IdMatricula: e.target.value })}>
                          <option value="">Selecione...</option>
                          {formOptions.matriculas
                            .filter((item) => {
                              const currentAluno = newItem.IdAluno;
                              return !currentAluno || item.id_aluno === currentAluno;
                            })
                            .map((item) => (
                              <option key={item.id} value={item.id}>{item.data_matricula ? formatDateBR(item.data_matricula) : item.nome}</option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="toolbar" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
                    {panelMode === 'create' && !isReadOnlyDetails && <button className="btn" type="submit">Salvar</button>}       
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