import React, { useEffect, useMemo, useState } from 'react';
import { ListFilter, Maximize2, Plus, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/apiConfig';
import DeleteBehaviorField from '../components/DeleteBehaviorField';
import EntityHeader from '../components/EntityHeader';
import ListFilterDrawer from '../components/ListFilterDrawer';
import ListPagination, { DEFAULT_PAGE_SIZE } from '../components/ListPagination';
import notify from '../utils/notify';
import { buildFilterParams } from '../utils/filterParams';
import { formatDateBR, maskDateBRInput, normalizeDateToIso, toSortableDateValue } from '../utils/formatters';

const FILTER_DEFS = [
  { key: 'nome', label: 'Nome do curso', param: 'nome_in' },
  { key: 'descricao', label: 'Descrição', param: 'descricao' },
];

const FILTER_DEF_MAP = FILTER_DEFS.reduce((accumulator, item) => {
  accumulator[item.key] = item;
  return accumulator;
}, {});

const MATRICULA_FILTER_DEFS = [
  { key: 'aluno', label: 'Aluno' },
  { key: 'curso', label: 'Curso' },
  { key: 'turma', label: 'Turma' },
  { key: 'status', label: 'Status' },
  { key: 'ativo', label: 'Status Registro (Ativo/Inativo)' },
];

const MATRICULA_FILTER_DEF_MAP = MATRICULA_FILTER_DEFS.reduce((accumulator, item) => {
  accumulator[item.key] = item;
  return accumulator;
}, {});

const createEmptyCurso = () => ({
  IdCurso: '',
  NomeCurso: '',
  DescricaoCurso: '',
  ativo: true,
});

const createEmptyMatricula = () => ({
  IdMatricula: '',
  IdAluno: '',
  IdCurso: '',
  IdTurma: '',
  DataMatricula: '',
  DataConclusao: '',
  StatusMatricula: 'Ativo',
  ativo: true,
});

const createEmptyAvaliacao = () => ({
  IdAluno: '',
  Nota: '',
  Status: '',
  OBS: '',
});

const createEmptyChamada = () => ({
  Data: '',
  Aula: '',
  Presenca: 'Presente',
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

const normalizeAtivoValue = (value) => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return !['false', '0', 'nao', 'não', 'inativo'].includes(normalized);
  }
  return value !== false && value !== 0;
};

const normalizeCursoRow = (row) => ({
  IdCurso: row.IdCurso || row.id_curso || row.id || '',
  NomeCurso: row.NomeCurso || row.nome || '',
  DescricaoCurso: row.DescricaoCurso || row.descricao || '',
  ativo: normalizeAtivoValue(row.ativo ?? row.Ativo),
});

const normalizeMatriculaRow = (row) => ({
  IdMatricula: row.IdMatricula || row.id_matricula || '',
  IdAluno: row.IdAluno || row.id_aluno || '',
  IdCurso: row.IdCurso || row.id_curso || '',
  IdTurma: row.IdTurma || row.id_turma || '',
  DataMatricula: formatDateBR(row.DataMatricula || row.data_matricula || ''),
  DataConclusao: formatDateBR(row.DataConclusao || row.data_conclusao || ''),
  StatusMatricula: row.StatusMatricula || row.status_matricula || '',
  NomeAluno: row.NomeAluno || row.nome_aluno || '',
  NomeCurso: row.NomeCurso || row.nome_curso || '',
  NomeTurma: row.NomeTurma || row.nome_turma || '',
  RelatedChamadas: Number(row.RelatedChamadas ?? row.related_chamadas ?? 0),
  ativo: normalizeAtivoValue(row.ativo ?? row.Ativo),
});

const buildCursoFilterOptions = (rows) => ({
  nome: Array.from(new Set(rows.map((row) => String(row.NomeCurso || '').trim()).filter(Boolean))).sort(),
  descricao: Array.from(new Set(rows.map((row) => String(row.DescricaoCurso || '').trim()).filter(Boolean))).sort(),
  ativo: Array.from(new Set(rows.map((row) => (row.ativo === false ? 'Inativo' : 'Ativo')))).sort(),
});

const buildMatriculaFilterOptions = (rows) => ({
  aluno: Array.from(new Set(rows.map((row) => String(row.NomeAluno || '').trim()).filter(Boolean))).sort(),
  curso: Array.from(new Set(rows.map((row) => String(row.NomeCurso || '').trim()).filter(Boolean))).sort(),
  turma: Array.from(new Set(rows.map((row) => String(row.NomeTurma || '').trim()).filter(Boolean))).sort(),
  status: Array.from(new Set(rows.map((row) => String(row.StatusMatricula || '').trim()).filter(Boolean))).sort(),
  ativo: ['Ativo', 'Inativo'],
});

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

const normalizeMatriculaOptionFilters = (options = {}) => {
  const normalized = {
    aluno: Array.isArray(options.alunos) ? options.alunos.map((item) => item?.nome || item).filter(Boolean) : [],
    curso: Array.isArray(options.cursos) ? options.cursos.map((item) => item?.nome || item).filter(Boolean) : [],
    turma: Array.isArray(options.turmas) ? options.turmas.map((item) => item?.nome || item).filter(Boolean) : [],
    status: Array.isArray(options.status) ? options.status.filter(Boolean) : [],
  };

  Object.entries(options || {}).forEach(([key, values]) => {
    if (['alunos', 'cursos', 'turmas', 'status'].includes(key)) return;
    normalized[key] = Array.isArray(values) ? values.filter(Boolean) : [];
  });

  return normalized;
};

const getCursoSortValue = (item, field, matriculasByCurso, avaliacoesByCurso) => {
  switch (field) {
    case 'nome':
      return item.NomeCurso || '';
    case 'descricao':
      return item.DescricaoCurso || '';
    case 'ativo':
      return item.ativo !== false ? 'Ativo' : 'Inativo';
    case 'avaliacoes':
      return Number(avaliacoesByCurso[item.IdCurso] || 0);
    case 'matriculas':
      return Number(matriculasByCurso[item.IdCurso] || 0);
    default:
      return item.NomeCurso || '';
  }
};

const sortCursos = (rows, field, direction, matriculasByCurso, avaliacoesByCurso) => [...rows].sort((left, right) => {
  const leftValue = getCursoSortValue(left, field, matriculasByCurso, avaliacoesByCurso);
  const rightValue = getCursoSortValue(right, field, matriculasByCurso, avaliacoesByCurso);
  const comparison = typeof leftValue === 'number' || typeof rightValue === 'number'
    ? Number(leftValue || 0) - Number(rightValue || 0)
    : String(leftValue || '').localeCompare(String(rightValue || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
  return direction === 'desc' ? comparison * -1 : comparison;
});

const getMatriculaSortValue = (item, field) => {
  switch (field) {
    case 'data_matricula':
      return item.DataMatricula || '';
    case 'data_conclusao':
      return item.DataConclusao || '';
    case 'curso':
      return item.NomeCurso || '';
    case 'turma':
      return item.NomeTurma || '';
    case 'status':
      return item.StatusMatricula || '';
    case 'chamadas':
      return Number(item.RelatedChamadas || 0);
    case 'ativo':
      return item.ativo !== false ? 'Ativo' : 'Inativo';
    default:
      return item.NomeCurso || '';
  }
};

const sortMatriculas = (rows, field, direction) => [...rows].sort((left, right) => {
  const leftValue = getMatriculaSortValue(left, field);
  const rightValue = getMatriculaSortValue(right, field);
  const leftDate = field.startsWith('data_') ? toSortableDateValue(leftValue || '') : Number.NaN;
  const rightDate = field.startsWith('data_') ? toSortableDateValue(rightValue || '') : Number.NaN;
  let comparison = 0;

  if (!Number.isNaN(leftDate) || !Number.isNaN(rightDate)) {
    comparison = (Number.isNaN(leftDate) ? -Infinity : leftDate) - (Number.isNaN(rightDate) ? -Infinity : rightDate);
  } else if (typeof leftValue === 'number' || typeof rightValue === 'number') {
    comparison = Number(leftValue || 0) - Number(rightValue || 0);
  } else {
    comparison = String(leftValue || '').localeCompare(String(rightValue || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  return direction === 'desc' ? comparison * -1 : comparison;
});

export default function CursosPage() {
  const [searchParams] = useSearchParams();
  const origin = searchParams.get('origin');
  const alunoId = searchParams.get('aluno') || '';
  const alunoNome = searchParams.get('alunoNome') || 'Aluno';

  const [items, setItems] = useState([]);
  const [matriculas, setMatriculas] = useState([]);
  const [matriculaOptions, setMatriculaOptions] = useState({ alunos: [], cursos: [], turmas: [], status: [] });
  const [query, setQuery] = useState('');
  const [expandedWorkspace, setExpandedWorkspace] = useState(null);
  const [cursoSortBy, setCursoSortBy] = useState('nome');
  const [cursoSortDir, setCursoSortDir] = useState('asc');
  const [matriculaSortBy, setMatriculaSortBy] = useState('data_matricula');
  const [matriculaSortDir, setMatriculaSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterField, setSelectedFilterField] = useState(FILTER_DEFS[0].key);
  const [selectedFilterValue, setSelectedFilterValue] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [showCursoFilters, setShowCursoFilters] = useState(false);

  const [showInativos, setShowInativos] = useState(false);
  const [showInativosMatricula, setShowInativosMatricula] = useState(false);

  const [showCursoSelection, setShowCursoSelection] = useState(false);
  const [showMatriculaFilters, setShowMatriculaFilters] = useState(false);
  const [showMatriculaSelection, setShowMatriculaSelection] = useState(false);
  const [matriculaQuery, setMatriculaQuery] = useState('');
  const [selectedMatriculaFilterField, setSelectedMatriculaFilterField] = useState(MATRICULA_FILTER_DEFS[0].key);
  const [selectedMatriculaFilterValue, setSelectedMatriculaFilterValue] = useState('');
  const [activeMatriculaFilters, setActiveMatriculaFilters] = useState({});
  const [matriculaDateStart, setMatriculaDateStart] = useState('');
  const [matriculaDateEnd, setMatriculaDateEnd] = useState('');
  const [cursoPanelMode, setCursoPanelMode] = useState(null);
  const [matriculaPanelMode, setMatriculaPanelMode] = useState(null);
  const [editingCurso, setEditingCurso] = useState(null);
  const [editingMatricula, setEditingMatricula] = useState(null);
  const [newCurso, setNewCurso] = useState(createEmptyCurso());
  const [newMatricula, setNewMatricula] = useState(createEmptyMatricula());
  const [selectedCursoIds, setSelectedCursoIds] = useState([]);
  const [selectedMatriculaIds, setSelectedMatriculaIds] = useState([]);
  const [cursoAvaliacoes, setCursoAvaliacoes] = useState([]);
  const [avaliacaoCountsByCurso, setAvaliacaoCountsByCurso] = useState({});
  const [cursoExpandedSection, setCursoExpandedSection] = useState('curso');
  const [selectedAvaliacaoGroup, setSelectedAvaliacaoGroup] = useState(null);
  const [selectedMatriculaWorkbench, setSelectedMatriculaWorkbench] = useState(null);
  const [matriculaChamadas, setMatriculaChamadas] = useState([]);
  const [loadingMatriculaChamadas, setLoadingMatriculaChamadas] = useState(false);
  const [showAvaliacaoCreate, setShowAvaliacaoCreate] = useState(false);
  const [newAvaliacao, setNewAvaliacao] = useState(createEmptyAvaliacao());
  const [showChamadaCreate, setShowChamadaCreate] = useState(false);
  const [newChamada, setNewChamada] = useState(createEmptyChamada());
  const [chamadaOptions, setChamadaOptions] = useState({ aulas: [], presencas: ['Presente', 'Ausente'] });

  const currentCurso = cursoPanelMode === 'edit' ? (editingCurso || createEmptyCurso()) : newCurso;
  const currentMatricula = matriculaPanelMode === 'edit' ? (editingMatricula || createEmptyMatricula()) : newMatricula;

  const fetchCursos = async (pageToFetch = page, perPage = pageSize, q = query, filters = activeFilters) => {
    setLoading(true);
    try {
      const filterParams = buildFilterParams(filters, FILTER_DEF_MAP);

      const response = await api.get('/cursos/', {
        params: {
          page: pageToFetch,
          per_page: perPage,
          q,
          include_inativos: showInativos,
          sort_by: 'nome',
          sort_dir: 'asc',
          ...filterParams,
        },
      });
      const normalized = normalizePagedResponse(response.data, pageToFetch);
      setItems(normalized.items.map((item) => normalizeCursoRow(item)));
      setTotal(normalized.total);
      setPage(normalized.page);
    } catch (error) {
      console.error(error);
      setItems([]);
      setTotal(0);
      notify('Erro ao carregar cursos.', { duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const response = await api.get('/cursos/filter-options', { params: { include_inativos: showInativos } });
      const options = (response.data || {}).options || {};
      if (Object.keys(options).length) {
        setFilterOptions(mergeFilterOptions(buildCursoFilterOptions(items), options));
        return;
      }
      setFilterOptions(buildCursoFilterOptions(items));
    } catch (error) {
      console.error(error);
      setFilterOptions(buildCursoFilterOptions(items));
    }
  };

  const fetchMatriculas = async (cursoId = null, inativosMatricula = showInativosMatricula) => {
    try {
      const response = await api.get('/cursos/matriculas', {
        params: {
          curso_id: cursoId || undefined,
          data_matricula_start: matriculaDateStart || undefined,
          data_matricula_end: matriculaDateEnd || undefined,
          ativo_in: activeMatriculaFilters.ativo ? activeMatriculaFilters.ativo.join(',') : undefined,
          include_inativos: inativosMatricula,
        }
      });
      const normalized = normalizePagedResponse(response.data);
      setMatriculas(normalized.items.map((item) => normalizeMatriculaRow(item)));
    } catch (error) {
      console.error(error);
      setMatriculas([]);
      notify('Erro ao carregar matrículas.', { duration: 3000 });
    }
  };

  const fetchMatriculaOptions = async () => {
    try {
      const response = await api.get('/cursos/matriculas/options');
      setMatriculaOptions(response.data || { alunos: [], cursos: [], turmas: [], status: [] });
    } catch (error) {
      console.error(error);
      setMatriculaOptions({ alunos: [], cursos: [], turmas: [], status: [] });
    }
  };

  const fetchChamadaOptions = async () => {
    try {
      const response = await api.get('/chamadas/form-options');
      setChamadaOptions({
        aulas: response.data?.aulas || [],
        presencas: response.data?.presencas || ['Presente', 'Ausente'],
      });
    } catch (error) {
      console.error(error);
      setChamadaOptions({ aulas: [], presencas: ['Presente', 'Ausente'] });
    }
  };

  const fetchCursoAvaliacoes = async (cursoId) => {
    if (!cursoId) {
      setCursoAvaliacoes([]);
      return;
    }
    try {
      const response = await api.get('/avaliacoes/', {
        params: {
          id_curso: cursoId,
          page: 1,
          per_page: 5000,
          sort_by: 'nota',
          sort_dir: 'desc',
        },
      });
      const normalized = normalizePagedResponse(response.data);
      setCursoAvaliacoes(normalized.items || []);
    } catch (error) {
      console.error(error);
      setCursoAvaliacoes([]);
    }
  };

  const fetchAvaliacaoCounts = async (cursoItems) => {
    const courseIds = Array.from(new Set((cursoItems || []).map((item) => item.IdCurso).filter(Boolean)));
    if (!courseIds.length) {
      setAvaliacaoCountsByCurso({});
      return;
    }
    try {
      const entries = await Promise.all(courseIds.map(async (courseId) => {
        const response = await api.get('/avaliacoes/', {
          params: { id_curso: courseId, page: 1, per_page: 5000, sort_by: 'nota', sort_dir: 'desc' },
        });
        const normalized = normalizePagedResponse(response.data);
        return [courseId, normalized.items.length];
      }));
      setAvaliacaoCountsByCurso(Object.fromEntries(entries));
    } catch (error) {
      console.error(error);
      setAvaliacaoCountsByCurso({});
    }
  };

  const fetchMatriculaChamadas = async (matricula) => {
    if (!matricula?.IdMatricula) {
      setMatriculaChamadas([]);
      return;
    }
    setLoadingMatriculaChamadas(true);
    try {
      const response = await api.get('/chamadas/', {
        params: {
          id_matricula: matricula.IdMatricula,
          page: 1,
          per_page: 5000,
          sort_by: 'data',
          sort_dir: 'desc',
        },
      });
      const normalized = normalizePagedResponse(response.data);
      setMatriculaChamadas(normalized.items || []);
    } catch (error) {
      console.error(error);
      setMatriculaChamadas([]);
    } finally {
      setLoadingMatriculaChamadas(false);
    }
  };

  useEffect(() => {
    fetchFilterOptions();
    fetchCursos(1, DEFAULT_PAGE_SIZE, '', {});
    fetchMatriculas(null, showInativosMatricula);
    fetchMatriculaOptions();
    fetchChamadaOptions();
  }, []);

  useEffect(() => {
    fetchMatriculas(editingCurso?.IdCurso || null, showInativosMatricula);
  }, [matriculaDateStart, matriculaDateEnd, showInativosMatricula]);

  useEffect(() => {
    fetchFilterOptions();
  }, [showInativos]);

  useEffect(() => {
    fetchCursos(page, pageSize, query, activeFilters);
  }, [page, pageSize, query, activeFilters, showInativos]);

  useEffect(() => {
    fetchAvaliacaoCounts(items);
  }, [items]);

  useEffect(() => {
    if (searchParams.get('createMatricula') !== '1') return;
    setExpandedWorkspace(null);
    setShowCursoFilters(false);
    setShowMatriculaFilters(false);
    setEditingCurso(null);
    setCursoPanelMode(null);
    setEditingMatricula(null);
    setNewMatricula({
      ...createEmptyMatricula(),
      IdAluno: searchParams.get('aluno') || '',
      IdCurso: searchParams.get('curso') || '',
      IdTurma: searchParams.get('turma') || '',
    });
    setMatriculaPanelMode('create');
  }, [searchParams]);

  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const rangeStart = total ? ((page - 1) * pageSize) + 1 : 0;
  const rangeEnd = total ? Math.min(page * pageSize, total) : 0;
  const cursoSelectableValues = filterOptions[selectedFilterField] || [];
  const cursoActiveFilterChips = Object.entries(activeFilters).flatMap(([fieldKey, values]) => (
    (values || []).map((value) => ({ fieldKey, value, label: FILTER_DEF_MAP[fieldKey]?.label || fieldKey }))
  ));
  const cursoActiveFilterCount = cursoActiveFilterChips.length;

  const matriculasByCurso = useMemo(() => matriculas.reduce((accumulator, item) => {
    const key = item.IdCurso || '__sem_curso__';
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {}), [matriculas]);

  const matriculaFilterOptions = useMemo(() => mergeFilterOptions(
    buildMatriculaFilterOptions(matriculas),
    normalizeMatriculaOptionFilters(matriculaOptions)
  ), [matriculas, matriculaOptions]);
  const matriculaSelectableValues = matriculaFilterOptions[selectedMatriculaFilterField] || [];
  const matriculaActiveFilterChips = Object.entries(activeMatriculaFilters).flatMap(([fieldKey, values]) => (
    (values || []).map((value) => ({ fieldKey, value, label: MATRICULA_FILTER_DEF_MAP[fieldKey]?.label || fieldKey }))
  ));
  const matriculaDateFilterChips = [
    ...(matriculaDateStart ? [{ fieldKey: 'data_matricula_start', value: matriculaDateStart, label: 'Data matrícula início' }] : []),
    ...(matriculaDateEnd ? [{ fieldKey: 'data_matricula_end', value: matriculaDateEnd, label: 'Data matrícula fim' }] : []),
  ];
  const matriculaAllFilterChips = [...matriculaActiveFilterChips, ...matriculaDateFilterChips];

  const filteredMatriculas = useMemo(() => {
    const normalizedQuery = String(matriculaQuery || '').trim().toLowerCase();
    return matriculas.filter((item) => {
      const itemDateIso = normalizeDateToIso(item.DataMatricula || '');
      if (matriculaDateStart && (!itemDateIso || itemDateIso < matriculaDateStart)) return false;
      if (matriculaDateEnd && (!itemDateIso || itemDateIso > matriculaDateEnd)) return false;

      const matchesQuery = !normalizedQuery || [item.NomeAluno, item.NomeCurso, item.NomeTurma, item.StatusMatricula]
        .some((value) => String(value || '').toLowerCase().includes(normalizedQuery));

      if (!matchesQuery) return false;

      return Object.entries(activeMatriculaFilters).every(([fieldKey, values]) => {
        if (!values?.length) return true;
        const targetValue = {
          aluno: item.NomeAluno,
          curso: item.NomeCurso,
          turma: item.NomeTurma,
          status: item.StatusMatricula,
          ativo: item.ativo !== false ? 'Ativo' : 'Inativo',
        }[fieldKey];
        return values.includes(String(targetValue || '').trim());
      });
    });
  }, [activeMatriculaFilters, matriculaDateEnd, matriculaDateStart, matriculaQuery, matriculas]);

  const sortedCursoItems = useMemo(
    () => sortCursos(items, cursoSortBy, cursoSortDir, matriculasByCurso, avaliacaoCountsByCurso),
    [items, cursoSortBy, cursoSortDir, matriculasByCurso, avaliacaoCountsByCurso],
  );

  const sortedMatriculas = useMemo(
    () => sortMatriculas(filteredMatriculas, matriculaSortBy, matriculaSortDir),
    [filteredMatriculas, matriculaSortBy, matriculaSortDir],
  );

  const cursoScopedMatriculas = useMemo(() => {
    if (!editingCurso?.IdCurso) return sortedMatriculas;
    return sortedMatriculas.filter((item) => item.IdCurso === editingCurso.IdCurso);
  }, [editingCurso, sortedMatriculas]);

  const avaliacaoGroups = useMemo(() => {
    const grouped = cursoAvaliacoes.reduce((accumulator, item) => {
      const key = item.Status || 'Sem status';
      if (!accumulator[key]) {
        accumulator[key] = { label: key, items: [] };
      }
      accumulator[key].items.push(item);
      return accumulator;
    }, {});
    return Object.values(grouped);
  }, [cursoAvaliacoes]);

  const closeCursoPanel = () => {
    setEditingCurso(null);
    setCursoPanelMode(null);
    setExpandedWorkspace(null);
    setCursoExpandedSection('curso');
    setSelectedAvaliacaoGroup(null);
    setCursoAvaliacoes([]);
    setSelectedMatriculaWorkbench(null);
    setMatriculaChamadas([]);
    setShowAvaliacaoCreate(false);
    setNewAvaliacao(createEmptyAvaliacao());
    setShowChamadaCreate(false);
    setNewChamada(createEmptyChamada());
    fetchMatriculas(null, showInativosMatricula);
  };

  const closeMatriculaPanel = () => {
    setEditingMatricula(null);
    setMatriculaPanelMode(null);
  };

  const startCreateCurso = () => {
    setExpandedWorkspace(null);
    setEditingCurso(null);
    setNewCurso(createEmptyCurso());
    setSelectedAvaliacaoGroup(null);
    setSelectedMatriculaWorkbench(null);
    setMatriculaChamadas([]);
    setShowAvaliacaoCreate(false);
    setNewAvaliacao(createEmptyAvaliacao());
    setShowChamadaCreate(false);
    setNewChamada(createEmptyChamada());
    setCursoPanelMode('create');
  };

  const startEditCurso = (item) => {
    setExpandedWorkspace(null);
    setEditingCurso({ ...createEmptyCurso(), ...item, ativo: item.ativo !== false });
    setCursoPanelMode('edit');
    setCursoExpandedSection('curso');
    setSelectedAvaliacaoGroup(null);
    setSelectedMatriculaWorkbench(null);
    setMatriculaChamadas([]);
    fetchMatriculas(item.IdCurso, showInativosMatricula);
    fetchCursoAvaliacoes(item.IdCurso);
  };

  const startInspectMatricula = (item) => {
    setSelectedMatriculaWorkbench(item);
    setShowChamadaCreate(false);
    setNewChamada(createEmptyChamada());
    fetchMatriculaChamadas(item);
  };

  const startCreateMatricula = (cursoId = '') => {
    setEditingMatricula(null);
    setNewMatricula({ ...createEmptyMatricula(), IdCurso: cursoId || editingCurso?.IdCurso || '' });
    setMatriculaPanelMode('create');
  };

  const startEditMatricula = (item) => {
    setEditingMatricula({
      ...createEmptyMatricula(),
      ...item,
      DataMatricula: formatDateBR(item.DataMatricula || ''),
      DataConclusao: formatDateBR(item.DataConclusao || ''),
      ativo: item.ativo !== false,
    });
    setMatriculaPanelMode('edit');
  };

  const updateCursoDraft = (field, value) => {
    if (cursoPanelMode === 'edit') {
      setEditingCurso((previous) => ({ ...(previous || createEmptyCurso()), [field]: value }));
      return;
    }
    setNewCurso((previous) => ({ ...previous, [field]: value }));
  };

  const updateMatriculaDraft = (field, value) => {
    if (matriculaPanelMode === 'edit') {
      setEditingMatricula((previous) => ({ ...(previous || createEmptyMatricula()), [field]: value }));
      return;
    }
    setNewMatricula((previous) => ({ ...previous, [field]: value }));
  };

  const handleCreateCurso = async (event) => {
    event.preventDefault();
    try {
      await api.post('/cursos/', {
        NomeCurso: newCurso.NomeCurso,
        DescricaoCurso: newCurso.DescricaoCurso || null,
        Ativo: newCurso.ativo !== false,
      });
      notify('Curso criado', { duration: 2500 });
      setNewCurso(createEmptyCurso());
      closeCursoPanel();
      fetchCursos(1, pageSize, query, activeFilters);
      fetchFilterOptions();
      fetchMatriculaOptions();
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao criar curso', { duration: 3500 });
    }
  };

  const handleUpdateCurso = async (event) => {
    event.preventDefault();
    if (!editingCurso?.IdCurso) return;
    try {
      await api.put(`/cursos/${editingCurso.IdCurso}`, {
        NomeCurso: editingCurso.NomeCurso,
        DescricaoCurso: editingCurso.DescricaoCurso || null,
        Ativo: editingCurso.ativo !== false,
      });
      notify('Curso atualizado', { duration: 2500 });
      closeCursoPanel();
      fetchCursos(page, pageSize, query, activeFilters);
      fetchFilterOptions();
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao atualizar curso', { duration: 3500 });
    }
  };

  const handleCreateMatricula = async (event) => {
    event.preventDefault();
    try {
      await api.post('/cursos/matriculas', {
        ...currentMatricula,
        DataMatricula: normalizeDateToIso(currentMatricula.DataMatricula),
        DataConclusao: normalizeDateToIso(currentMatricula.DataConclusao),
        Ativo: currentMatricula.ativo !== false,
      });
      notify('Matrícula criada', { duration: 2500 });
      setNewMatricula(createEmptyMatricula());
      closeMatriculaPanel();
      fetchMatriculas(currentMatricula.IdCurso || editingCurso?.IdCurso || null, showInativosMatricula);
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao criar matrícula', { duration: 3500 });
    }
  };

  const handleUpdateMatricula = async (event) => {
    event.preventDefault();
    if (!editingMatricula?.IdMatricula) return;
    try {
      await api.put(`/cursos/matriculas/${editingMatricula.IdMatricula}`, {
        ...editingMatricula,
        DataMatricula: normalizeDateToIso(editingMatricula.DataMatricula),
        DataConclusao: normalizeDateToIso(editingMatricula.DataConclusao),
        Ativo: editingMatricula.ativo !== false,
      });
      notify('Matrícula atualizada', { duration: 2500 });
      closeMatriculaPanel();
      fetchMatriculas(editingMatricula.IdCurso || editingCurso?.IdCurso || null, showInativosMatricula);
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao atualizar matrícula', { duration: 3500 });
    }
  };

  const handleCreateAvaliacao = async (event) => {
    event.preventDefault();
    if (!editingCurso?.IdCurso) return;
    try {
      await api.post('/avaliacoes/', {
        IdAluno: newAvaliacao.IdAluno,
        IdCurso: editingCurso.IdCurso,
        Nota: newAvaliacao.Nota === '' ? undefined : Number(newAvaliacao.Nota),
        Status: newAvaliacao.Status || undefined,
        OBS: newAvaliacao.OBS || undefined,
      });
      notify('Avaliação criada', { duration: 2500 });
      setShowAvaliacaoCreate(false);
      setNewAvaliacao(createEmptyAvaliacao());
      fetchCursoAvaliacoes(editingCurso.IdCurso);
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao criar avaliação', { duration: 3500 });
    }
  };

  const handleCreateChamada = async (event) => {
    event.preventDefault();
    if (!selectedMatriculaWorkbench?.IdMatricula) return;
    try {
      await api.post('/chamadas/', {
        Data: normalizeDateToIso(newChamada.Data),
        Aula: newChamada.Aula || undefined,
        Presenca: newChamada.Presenca,
        IdAluno: selectedMatriculaWorkbench.IdAluno,
        IdMatricula: selectedMatriculaWorkbench.IdMatricula,
      });
      notify('Chamada criada', { duration: 2500 });
      setShowChamadaCreate(false);
      setNewChamada(createEmptyChamada());
      fetchMatriculaChamadas(selectedMatriculaWorkbench);
      fetchMatriculas(editingCurso?.IdCurso || null, showInativosMatricula);
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao criar chamada', { duration: 3500 });
    }
  };

  const deleteCurso = async (id) => {
    return await api.delete(`/cursos/${id}`);
  };

  const deleteMatricula = async (id) => {
    return await api.delete(`/cursos/matriculas/${id}`);
  };

  const toggleCursoSelection = (id) => {
    setSelectedCursoIds((previous) => (
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id]
    ));
  };

  const toggleMatriculaSelection = (id) => {
    setSelectedMatriculaIds((previous) => (
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id]
    ));
  };

  const handleCursoCheckboxChange = (event, id) => {
    event.stopPropagation();
    toggleCursoSelection(id);
  };

  const handleMatriculaCheckboxChange = (event, id) => {
    event.stopPropagation();
    toggleMatriculaSelection(id);
  };

  const handleDeleteCurso = async (id, capability = null) => {
    const confirmationMessage = capability?.confirmation_message || 'Remover/Inativar curso?';
    if (!window.confirm(confirmationMessage)) return;
    try {
      const response = await deleteCurso(id);
      notify(response?.data?.message || 'Curso removido/inativado', { duration: 2500 });
      if (editingCurso?.IdCurso === id) closeCursoPanel();
      fetchCursos(page, pageSize, query, activeFilters);
      fetchMatriculaOptions();
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao processar remoção do curso', { duration: 3500 });
    }
  };

  const handleDeleteMatricula = async (id, capability = null) => {
    const confirmationMessage = capability?.confirmation_message || 'Remover/Inativar matrícula?';
    if (!window.confirm(confirmationMessage)) return;
    try {
      const response = await deleteMatricula(id);
      notify(response?.data?.message || 'Matrícula removida/inativada', { duration: 2500 });
      if (editingMatricula?.IdMatricula === id) closeMatriculaPanel();
      fetchMatriculas(editingCurso?.IdCurso || null, showInativosMatricula);
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao processar remoção da matrícula', { duration: 3500 });
    }
  };

  const handleBulkDeleteCursos = async () => {
    if (!selectedCursoIds.length || !window.confirm('Remover/Inativar cursos selecionados?')) return;
    try {
      await Promise.all(selectedCursoIds.map((id) => deleteCurso(id)));
      setSelectedCursoIds([]);
      fetchCursos(page, pageSize, query, activeFilters);
      notify('Cursos processados com sucesso', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify('Erro ao processar os cursos selecionados', { duration: 3500 });
    }
  };

  const handleBulkDeleteMatriculas = async () => {
    if (!selectedMatriculaIds.length || !window.confirm('Remover/Inativar matrículas selecionadas?')) return;
    try {
      await Promise.all(selectedMatriculaIds.map((id) => deleteMatricula(id)));
      setSelectedMatriculaIds([]);
      closeMatriculaPanel();
      fetchMatriculas(editingCurso?.IdCurso || null, showInativosMatricula);
      notify('Matrículas processadas com sucesso', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify('Erro ao processar as matrículas selecionadas', { duration: 3500 });
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

  const toggleCursoFilterValue = (fieldKey, value) => {
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

  const addMatriculaFilterCriterion = () => {
    if (!selectedMatriculaFilterField || !selectedMatriculaFilterValue) return;
    setActiveMatriculaFilters((previous) => {
      const current = previous[selectedMatriculaFilterField] || [];
      if (current.includes(selectedMatriculaFilterValue)) return previous;
      return { ...previous, [selectedMatriculaFilterField]: [...current, selectedMatriculaFilterValue] };
    });
    setSelectedMatriculaFilterValue('');
  };

  const removeMatriculaFilterCriterion = (fieldKey, value) => {
    if (fieldKey === 'data_matricula_start') {
      setMatriculaDateStart('');
      return;
    }
    if (fieldKey === 'data_matricula_end') {
      setMatriculaDateEnd('');
      return;
    }
    setActiveMatriculaFilters((previous) => {
      const current = previous[fieldKey] || [];
      const updated = current.filter((item) => item !== value);
      const next = { ...previous };
      if (updated.length) next[fieldKey] = updated;
      else delete next[fieldKey];
      return next;
    });
  };

  const clearAllMatriculaFilterCriteria = () => {
    setActiveMatriculaFilters({});
    setMatriculaDateStart('');
    setMatriculaDateEnd('');
    setMatriculaQuery('');
  };

  const toggleMatriculaFilterValue = (fieldKey, value) => {
    if (!fieldKey || !value) return;
    setSelectedMatriculaFilterField(fieldKey);
    setSelectedMatriculaFilterValue('');
    setActiveMatriculaFilters((previous) => {
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
  };

  const toggleCursoSort = (field) => {
    if (cursoSortBy === field) {
      setCursoSortDir((previous) => (previous === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setCursoSortBy(field);
    setCursoSortDir('asc');
  };

  const cursoSortIndicator = (field) => {
    if (cursoSortBy !== field) return '↕';
    return cursoSortDir === 'asc' ? '↑' : '↓';
  };

  const toggleMatriculaSort = (field) => {
    if (matriculaSortBy === field) {
      setMatriculaSortDir((previous) => (previous === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setMatriculaSortBy(field);
    setMatriculaSortDir(field.startsWith('data_') ? 'desc' : 'asc');
  };

  const matriculaSortIndicator = (field) => {
    if (matriculaSortBy !== field) return '↕';
    return matriculaSortDir === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="app-shell app-shell-tight entity-page">
      <EntityHeader
        breadcrumbs={[
          ...(origin === 'alunos' ? [
            { label: 'Alunos', to: '/alunos' },
            { label: alunoNome, to: alunoId ? `/alunos?edit=${encodeURIComponent(alunoId)}` : '/alunos' },
          ] : []),
          {
            label: 'Matricular Cursos',
            to: '/cursos',
            onClick: expandedWorkspace || cursoPanelMode || matriculaPanelMode
              ? () => {
                setExpandedWorkspace(null);
                if (cursoPanelMode) closeCursoPanel();
                if (matriculaPanelMode) closeMatriculaPanel();
              }
              : undefined,
          },
          ...(cursoPanelMode === 'create' ? [{ label: 'Novo Curso' }] : []),
          ...(editingCurso?.NomeCurso ? [{ label: editingCurso.NomeCurso, onClick: () => { setCursoExpandedSection('curso'); setSelectedAvaliacaoGroup(null); } }] : []),
          ...(matriculaPanelMode === 'create' ? [{ label: 'Nova Matrícula' }] : []),
          ...(cursoExpandedSection === 'avaliacoes' && selectedAvaliacaoGroup ? [{ label: selectedAvaliacaoGroup.label }] : []),
        ]}
        title="Matricular Cursos"
        meta={`${total} curso(s) • ${filteredMatriculas.length} matrícula(s)`}
        filterChips={expandedWorkspace === 'matriculas' ? matriculaActiveFilterChips : cursoActiveFilterChips}
        onRemoveFilterChip={expandedWorkspace === 'matriculas' ? removeMatriculaFilterCriterion : removeFilterCriterion}
      />

      <section>
        {loading ? <div>Carregando...</div> : (
          cursoPanelMode === 'edit' && editingCurso ? (
            <div className="course-workbench">
              <div className="course-workbench-grid">
                <div className="card">
                  <div className="workspace-list-header">
                    <strong>{editingCurso.NomeCurso || 'Curso selecionado'}</strong>
                    <div className="entity-actions">
                      <button type="button" className={`btn ghost ${cursoExpandedSection === 'curso' ? 'active' : ''}`} onClick={() => { setCursoExpandedSection('curso'); setSelectedAvaliacaoGroup(null); }}>Curso</button>
                      <button type="button" className="btn ghost" onClick={closeCursoPanel}>Voltar para a listagem</button>
                    </div>
                  </div>

                  <div className="related-metrics-grid" style={{ marginBottom: 12 }}>
                    <div className="record-meta"><strong>Avaliações</strong><span>{cursoAvaliacoes.length}</span></div>
                    <div className="record-meta"><strong>Matrículas</strong><span>{cursoScopedMatriculas.length}</span></div>
                    <div className="record-meta"><strong>Status</strong><span>{editingCurso.ativo !== false ? 'Ativo' : 'Inativo'}</span></div>
                  </div>

                  <form onSubmit={handleUpdateCurso}>
                    <div className="form-row">
                      <div className="field">
                        <label>Nome do Curso</label>
                        <input className="input" required value={currentCurso.NomeCurso} onChange={(event) => updateCursoDraft('NomeCurso', event.target.value)} />
                      </div>
                      <div className="field">
                        <label>Descrição</label>
                        <textarea className="input details-textarea" value={currentCurso.DescricaoCurso || ''} onChange={(event) => updateCursoDraft('DescricaoCurso', event.target.value)} />
                      </div>

                      <DeleteBehaviorField
                        resourcePath="/cursos"
                        entityId={currentCurso.IdCurso}
                        active={currentCurso.ativo !== false}
                        onActiveChange={(value) => updateCursoDraft('ativo', value)}
                        onDelete={(capability) => handleDeleteCurso(currentCurso.IdCurso, capability)}
                      />
                    </div>
                    <div className="toolbar" style={{ marginTop: 8 }}>
                      <button className="btn" type="submit">Salvar</button>
                      {/* O componente toolbar já faz o handle Delete sozinho baseado no DeleteBehaviorField da row superior */}
                    </div>
                  </form>
                </div>

                <div className="card">
                  <div className="workspace-list-header">
                    <strong>Avaliações</strong>
                    <div className="entity-actions">
                      <button type="button" className="btn ghost" onClick={() => { setShowAvaliacaoCreate((previous) => !previous); setNewAvaliacao((previous) => ({ ...previous, IdAluno: previous.IdAluno || cursoScopedMatriculas[0]?.IdAluno || '' })); }}>Adicionar</button>
                      <button type="button" className={`btn ghost ${cursoExpandedSection === 'avaliacoes' ? 'active' : ''}`} onClick={() => setCursoExpandedSection('avaliacoes')}>Expandir</button>
                    </div>
                  </div>
                  {showAvaliacaoCreate && (
                    <form className="related-section-block" onSubmit={handleCreateAvaliacao} style={{ marginBottom: 12 }}>
                      <div className="form-row">
                        <div className="field">
                          <label>Aluno</label>
                          <select className="select" value={newAvaliacao.IdAluno} onChange={(event) => setNewAvaliacao((previous) => ({ ...previous, IdAluno: event.target.value }))} required>
                            <option value="">Selecione</option>
                            {Array.from(new Map(cursoScopedMatriculas.map((item) => [item.IdAluno, item.NomeAluno])).entries()).map(([id, nome]) => (
                              <option key={id} value={id}>{nome}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Nota</label>
                          <input className="input" type="number" step="0.01" value={newAvaliacao.Nota} onChange={(event) => setNewAvaliacao((previous) => ({ ...previous, Nota: event.target.value }))} />
                        </div>
                        <div className="field">
                          <label>Status</label>
                          <input className="input" value={newAvaliacao.Status} onChange={(event) => setNewAvaliacao((previous) => ({ ...previous, Status: event.target.value }))} />
                        </div>
                        <div className="field">
                          <label>OBS.</label>
                          <input className="input" value={newAvaliacao.OBS} onChange={(event) => setNewAvaliacao((previous) => ({ ...previous, OBS: event.target.value }))} />
                        </div>
                      </div>
                      <div className="toolbar">
                        <button className="btn" type="submit">Salvar avaliação</button>
                        <button className="btn ghost" type="button" onClick={() => { setShowAvaliacaoCreate(false); setNewAvaliacao(createEmptyAvaliacao()); }}>Cancelar</button>
                      </div>
                    </form>
                  )}
                  <div className="cell-list" style={{ marginBottom: 12 }}>
                    {avaliacaoGroups.length ? avaliacaoGroups.map((group) => (
                      <button
                        key={group.label}
                        type="button"
                        className={`cell-tag ${selectedAvaliacaoGroup?.label === group.label ? 'active' : ''}`}
                        onClick={() => {
                          setCursoExpandedSection('avaliacoes');
                          setSelectedAvaliacaoGroup(group);
                        }}
                      >
                        {group.label} ({group.items.length})
                      </button>
                    )) : <span className="table-secondary-text">Sem avaliações relacionadas.</span>}
                  </div>
                  {selectedAvaliacaoGroup ? (
                    <div className="table-wrap related-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Aluno</th>
                            <th>Nota</th>
                            <th>Status</th>
                            <th>OBS.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedAvaliacaoGroup.items.map((item) => (
                            <tr key={item.IdAvaliacao}>
                              <td>{item.NomeAluno || 'Aluno não encontrado'}</td>
                              <td>{item.Nota ?? '-'}</td>
                              <td>{item.Status || '-'}</td>
                              <td>{item.OBS || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="table-secondary-text">Selecione um agrupamento para abrir o detalhe das avaliações.</div>
                  )}
                </div>

                <div className={`card overlay-host ${matriculaPanelMode ? 'overlay-panel-active' : ''}`}>
                  <div className="workspace-list-header">
                    <strong>Matrículas</strong>
                    <div className="entity-actions">
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginRight: '12px',
                          fontSize: '0.875rem',
                          cursor: 'pointer',
                          fontWeight: 'normal'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={showInativosMatricula}
                          onChange={(e) => setShowInativosMatricula(e.target.checked)}
                        />
                        Mostrar Inativos
                      </label>
                      <button type="button" className="btn ghost" onClick={() => startCreateMatricula(editingCurso.IdCurso)}>Adicionar</button>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Aluno</th>
                          <th>Turma</th>
                          <th>Status</th>
                          <th>Registro</th>
                          <th>Chamadas</th>
                          <th>Detalhes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cursoScopedMatriculas.length ? cursoScopedMatriculas.map((item) => (
                          <tr key={item.IdMatricula} onClick={() => startInspectMatricula(item)}>
                            <td>{item.NomeAluno || 'Aluno não encontrado'}</td>
                            <td>{item.NomeTurma || '-'}</td>
                            <td>{item.StatusMatricula || '-'}</td>
                            <td>{item.ativo !== false ? 'Ativo' : 'Inativo'}</td>
                            <td>{item.RelatedChamadas || 0}</td>
                            <td onClick={(event) => event.stopPropagation()}>
                              <button type="button" className="btn ghost" onClick={() => startInspectMatricula(item)}>Expandir</button>
                              <button type="button" className="icon-btn entity-edit-btn" aria-label="Editar matrícula" onClick={() => startEditMatricula(item)}>
                                <span aria-hidden="true">&gt;</span>
                              </button>
                            </td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={6}>Sem matrículas relacionadas.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {selectedMatriculaWorkbench && (
                    <div className="related-section-block" style={{ marginTop: 12 }}>
                      <div className="related-section-header">
                        <strong>Chamadas de {selectedMatriculaWorkbench.NomeAluno || 'matrícula selecionada'}</strong>
                        <div className="related-inline-actions">
                          <button type="button" className="btn ghost" onClick={() => fetchMatriculaChamadas(selectedMatriculaWorkbench)}>Expandir</button>
                          <button type="button" className="btn" onClick={() => setShowChamadaCreate((previous) => !previous)}>Adicionar chamada</button>
                        </div>
                      </div>
                      {showChamadaCreate && (
                        <form onSubmit={handleCreateChamada}>
                          <div className="form-row">
                            <div className="field">
                              <label>Data</label>
                              <input className="input" placeholder="DD/MM/YYYY" value={maskDateBRInput(newChamada.Data)} onChange={(event) => setNewChamada((previous) => ({ ...previous, Data: maskDateBRInput(event.target.value) }))} required />
                            </div>
                            <div className="field">
                              <label>Aula</label>
                              <select className="select" value={newChamada.Aula} onChange={(event) => setNewChamada((previous) => ({ ...previous, Aula: event.target.value }))}>
                                <option value="">Selecione</option>
                                {chamadaOptions.aulas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                              </select>
                            </div>
                            <div className="field">
                              <label>Presença</label>
                              <select className="select" value={newChamada.Presenca} onChange={(event) => setNewChamada((previous) => ({ ...previous, Presenca: event.target.value }))}>
                                {chamadaOptions.presencas.map((item) => <option key={item} value={item}>{item}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="toolbar">
                            <button className="btn" type="submit">Salvar chamada</button>
                            <button className="btn ghost" type="button" onClick={() => { setShowChamadaCreate(false); setNewChamada(createEmptyChamada()); }}>Cancelar</button>
                          </div>
                        </form>
                      )}
                      {loadingMatriculaChamadas ? <div className="helper-text">Carregando chamadas...</div> : (
                        <div className="table-wrap related-table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Data</th>
                                <th>Aula</th>
                                <th>Presença</th>
                              </tr>
                            </thead>
                            <tbody>
                              {matriculaChamadas.length ? matriculaChamadas.map((item) => (
                                <tr key={item.IdChamada}>
                                  <td>{formatDateBR(item.Data) || '-'}</td>
                                  <td>{item.NomeAula || '-'}</td>
                                  <td>{item.Presenca || '-'}</td>
                                </tr>
                              )) : (
                                <tr><td colSpan={3}>Sem chamadas relacionadas.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {(matriculaPanelMode === 'edit' || matriculaPanelMode === 'create') && (
                    <div className="workspace-overlay-panel">
                      <form onSubmit={matriculaPanelMode === 'edit' ? handleUpdateMatricula : handleCreateMatricula} className="card">
                        <div className="workspace-list-header">
                          <strong>{matriculaPanelMode === 'edit' ? 'Detalhes da Matrícula' : 'Nova Matrícula'}</strong>
                          <button type="button" className="icon-action-btn" aria-label="Fechar matrícula" onClick={closeMatriculaPanel}><X size={16} /></button>
                        </div>
                        <div className="form-row">
                          <div className="field">
                            <label>Aluno</label>
                            <select className="select" value={currentMatricula.IdAluno || ''} onChange={(event) => updateMatriculaDraft('IdAluno', event.target.value)}>
                              <option value="">Selecione</option>
                              {matriculaOptions.alunos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                            </select>
                          </div>
                          <div className="field">
                            <label>Curso</label>
                            <select className="select" value={currentMatricula.IdCurso || ''} onChange={(event) => updateMatriculaDraft('IdCurso', event.target.value)}>
                              <option value="">Selecione</option>
                              {matriculaOptions.cursos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                            </select>
                          </div>
                          <div className="field">
                            <label>Turma</label>
                            <select className="select" value={currentMatricula.IdTurma || ''} onChange={(event) => updateMatriculaDraft('IdTurma', event.target.value)}>
                              <option value="">Selecione</option>
                              {matriculaOptions.turmas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                            </select>
                          </div>
                          <div className="field">
                            <label>Data da Matrícula</label>
                            <input className="input" placeholder="DD/MM/YYYY" value={maskDateBRInput(currentMatricula.DataMatricula || '')} onChange={(event) => updateMatriculaDraft('DataMatricula', maskDateBRInput(event.target.value))} />
                          </div>
                          <div className="field">
                            <label>Data de Conclusão</label>
                            <input className="input" placeholder="DD/MM/YYYY" value={maskDateBRInput(currentMatricula.DataConclusao || '')} onChange={(event) => updateMatriculaDraft('DataConclusao', maskDateBRInput(event.target.value))} />
                          </div>
                          <div className="field">
                            <label>Status</label>
                            <select className="select" value={currentMatricula.StatusMatricula || 'Ativo'} onChange={(event) => updateMatriculaDraft('StatusMatricula', event.target.value)}>
                              {(matriculaOptions.status || ['Ativo', 'Trancado', 'Concluído', 'Cancelado']).map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                          </div>

                          {matriculaPanelMode === 'edit' && (
                            <DeleteBehaviorField
                              resourcePath="/cursos/matriculas"
                              entityId={editingMatricula?.IdMatricula}
                              active={currentMatricula.ativo !== false}
                              onActiveChange={(value) => updateMatriculaDraft('ativo', value)}
                              onDelete={(capability) => handleDeleteMatricula(editingMatricula.IdMatricula, capability)}
                            />
                          )}
                        </div>
                        <div className="toolbar" style={{ marginTop: 8 }}>
                          <button className="btn" type="submit">Salvar</button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
          <div className={`split-workspace ${expandedWorkspace ? `workspace-expanded-${expandedWorkspace}` : ''}`}>
            <div className={`workspace-column ${showCursoSelection ? 'selection-mode' : ''}`}>
              <div className="workspace-list-header">
                <strong>Cursos</strong>
                <div className="entity-actions">
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginRight: '12px',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      fontWeight: 'normal'
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

                  <button type="button" className="icon-action-btn" aria-label="Expandir cursos" onClick={() => setExpandedWorkspace('cursos')}>
                    <Maximize2 size={16} />
                  </button>
                  <button type="button" className="icon-action-btn filter-toggle-btn" aria-label="Abrir filtros de cursos" onClick={() => { setShowCursoFilters((previous) => !previous); setShowMatriculaFilters(false); }}>
                    {showCursoFilters ? <X size={17} /> : <ListFilter size={17} />}
                  </button>
                  <button
                    type="button"
                    className={`icon-action-btn selection-toggle-btn ${showCursoSelection ? 'active' : ''}`}
                    aria-label="Alternar seleção de cursos"
                    onClick={() => {
                      setShowCursoSelection((previous) => {
                        if (previous) setSelectedCursoIds([]);
                        return !previous;
                      });
                    }}
                  >
                    {showCursoSelection ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
                  </button>
                  <button type="button" className="icon-action-btn entity-add-btn" aria-label="Adicionar curso" onClick={startCreateCurso}>
                    <Plus size={17} />
                    <span>Adicionar</span>
                  </button>
                </div>
              </div>

              {showCursoFilters && (
                <ListFilterDrawer
                  open={showCursoFilters}
                  dataTestId="cursos-filter-drawer"
                  title="Filtros de cursos"
                  subtitle="A listagem expõe todos os critérios e valores disponíveis para cursos."
                  closeButton={<button type="button" className="icon-action-btn" aria-label="Fechar filtros de cursos" onClick={() => setShowCursoFilters(false)}><span aria-hidden="true">←</span></button>}
                  searchId="cursos-drawer-search"
                  query={query}
                  onQueryChange={(event) => { setQuery(event.target.value); setPage(1); }}
                  filterDefs={FILTER_DEFS}
                  filterOptions={filterOptions}
                  activeFilters={activeFilters}
                  onToggleFilterValue={toggleCursoFilterValue}
                  selectedFilterField={selectedFilterField}
                  onSelectedFilterFieldChange={(event) => { setSelectedFilterField(event.target.value); setSelectedFilterValue(''); }}
                  selectedFilterValue={selectedFilterValue}
                  onSelectedFilterValueChange={(event) => setSelectedFilterValue(event.target.value)}
                  selectableValues={cursoSelectableValues}
                  onAddFilterCriterion={addFilterCriterion}
                  showInativos={showInativos}
                  onShowInativosChange={(event) => { setShowInativos(event.target.checked); setPage(1); }}
                  activeFilterChips={cursoActiveFilterChips}
                  onRemoveFilterCriterion={removeFilterCriterion}
                  onClearAllFilterCriteria={clearAllFilterCriteria}
                  clearDisabled={!cursoActiveFilterCount}
                  showInlineActiveChips={false}
                />
              )}

              {selectedCursoIds.length > 0 && (
                <section className="bulk-action-bar card">
                  <strong>{selectedCursoIds.length} curso(s) selecionado(s)</strong>
                  <div className="entity-actions">
                    <button type="button" className="icon-action-btn danger" aria-label="Remover cursos selecionados" onClick={handleBulkDeleteCursos}><Trash2 size={17} /></button>
                    <button type="button" className="icon-action-btn" aria-label="Limpar seleção de cursos" onClick={() => setSelectedCursoIds([])}><X size={17} /></button>
                  </div>
                </section>
              )}

              {cursoPanelMode === 'create' && (
                <form onSubmit={handleCreateCurso} className="card">
                  <div className="workspace-list-header">
                    <strong>Novo Curso</strong>
                    <button type="button" className="icon-action-btn" aria-label="Fechar curso" onClick={closeCursoPanel}><X size={16} /></button>
                  </div>
                  <div className="form-row">
                    <div className="field">
                      <label>Nome do Curso</label>
                      <input className="input" required value={currentCurso.NomeCurso} onChange={(event) => updateCursoDraft('NomeCurso', event.target.value)} />
                    </div>
                    <div className="field">
                      <label>Descrição</label>
                      <textarea className="input details-textarea" value={currentCurso.DescricaoCurso || ''} onChange={(event) => updateCursoDraft('DescricaoCurso', event.target.value)} />
                    </div>
                  </div>
                  <div className="toolbar" style={{ marginTop: 8 }}>
                    <button className="btn" type="submit">Salvar</button>
                  </div>
                </form>
              )}

              <div className="card table-card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="compact-table-select"></th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleCursoSort('nome')}>
                            Nome do Curso <span className="sort-indicator">{cursoSortIndicator('nome')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleCursoSort('descricao')}>
                            Descrição <span className="sort-indicator">{cursoSortIndicator('descricao')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleCursoSort('ativo')}>
                            Status <span className="sort-indicator">{cursoSortIndicator('ativo')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleCursoSort('avaliacoes')}>
                            Avaliações Relacionadas <span className="sort-indicator">{cursoSortIndicator('avaliacoes')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleCursoSort('matriculas')}>
                            Matrículas Relacionadas <span className="sort-indicator">{cursoSortIndicator('matriculas')}</span>
                          </button>
                        </th>
                        <th>Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCursoItems.map((item) => (
                        <tr key={item.IdCurso} onClick={() => startEditCurso(item)}>
                          <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                            <input type="checkbox" checked={selectedCursoIds.includes(item.IdCurso)} onClick={(event) => event.stopPropagation()} onChange={(event) => handleCursoCheckboxChange(event, item.IdCurso)} />
                          </td>
                          <td>{item.NomeCurso}</td>
                          <td>{item.DescricaoCurso || '-'}</td>
                          <td>{item.ativo !== false ? 'Ativo' : 'Inativo'}</td>
                          <td>{avaliacaoCountsByCurso[item.IdCurso] || 0}</td>
                          <td>{matriculasByCurso[item.IdCurso] || 0}</td>
                          <td onClick={(event) => event.stopPropagation()}>
                            <button type="button" className="icon-btn entity-edit-btn" aria-label="Editar curso" onClick={() => startEditCurso(item)}>
                              <span aria-hidden="true">&gt;</span>
                            </button>
                          </td>
                        </tr>
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

            <div className={`workspace-column overlay-host ${matriculaPanelMode ? 'overlay-panel-active' : ''} ${showMatriculaSelection ? 'selection-mode' : ''}`}>
              <div className="workspace-list-header">
                <strong>Matrículas</strong>
                <div className="entity-actions">
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginRight: '12px',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      fontWeight: 'normal'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showInativosMatricula}
                      onChange={(e) => setShowInativosMatricula(e.target.checked)}
                    />
                    Inativos
                  </label>

                  <button type="button" className="icon-action-btn" aria-label="Expandir matrículas" onClick={() => setExpandedWorkspace('matriculas')}>
                    <Maximize2 size={16} />
                  </button>
                  <button type="button" className="icon-action-btn filter-toggle-btn" aria-label="Abrir filtros de matrículas" onClick={() => { setShowMatriculaFilters((previous) => !previous); setShowCursoFilters(false); }}>
                    {showMatriculaFilters ? <X size={17} /> : <ListFilter size={17} />}
                  </button>
                  <button
                    type="button"
                    className={`icon-action-btn selection-toggle-btn ${showMatriculaSelection ? 'active' : ''}`}
                    aria-label="Alternar seleção de matrículas"
                    onClick={() => {
                      setShowMatriculaSelection((previous) => {
                        if (previous) setSelectedMatriculaIds([]);
                        return !previous;
                      });
                    }}
                  >
                    {showMatriculaSelection ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
                  </button>
                  <button type="button" className="icon-action-btn entity-add-btn" aria-label="Adicionar matrícula" onClick={() => startCreateMatricula(editingCurso?.IdCurso || '')}><Plus size={16} /><span>Adicionar</span></button>
                </div>
              </div>

              {showMatriculaFilters && (
                <ListFilterDrawer
                  open={showMatriculaFilters}
                  dataTestId="matriculas-filter-drawer"
                  title="Filtros de matrículas"
                  subtitle="Filtre por aluno, curso, turma, status, período de matrícula e texto livre na própria lateral."
                  closeButton={<button type="button" className="icon-action-btn" aria-label="Fechar filtros de matrículas" onClick={() => setShowMatriculaFilters(false)}><span aria-hidden="true">←</span></button>}
                  searchId="matriculas-drawer-search"
                  query={matriculaQuery}
                  onQueryChange={(event) => setMatriculaQuery(event.target.value)}
                  filterDefs={MATRICULA_FILTER_DEFS}
                  filterOptions={matriculaFilterOptions}
                  activeFilters={activeMatriculaFilters}
                  onToggleFilterValue={toggleMatriculaFilterValue}
                  selectedFilterField={selectedMatriculaFilterField}
                  onSelectedFilterFieldChange={(event) => { setSelectedMatriculaFilterField(event.target.value); setSelectedMatriculaFilterValue(''); }}
                  selectedFilterValue={selectedMatriculaFilterValue}
                  onSelectedFilterValueChange={(event) => setSelectedMatriculaFilterValue(event.target.value)}
                  selectableValues={matriculaSelectableValues}
                  onAddFilterCriterion={addMatriculaFilterCriterion}
                  showInativos={showInativosMatricula}
                  onShowInativosChange={(event) => setShowInativosMatricula(event.target.checked)}
                  activeFilterChips={matriculaAllFilterChips}
                  onRemoveFilterCriterion={removeMatriculaFilterCriterion}
                  onClearAllFilterCriteria={clearAllMatriculaFilterCriteria}
                  clearDisabled={!matriculaAllFilterChips.length && !matriculaQuery}
                  showInlineActiveChips={false}
                />
              )}

              {showMatriculaFilters && (
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="field">
                      <label htmlFor="matricula-data-inicio">Data matrícula (início)</label>
                      <input
                        id="matricula-data-inicio"
                        className="input"
                        type="date"
                        value={matriculaDateStart}
                        onChange={(event) => setMatriculaDateStart(event.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="matricula-data-fim">Data matrícula (fim)</label>
                      <input
                        id="matricula-data-fim"
                        className="input"
                        type="date"
                        value={matriculaDateEnd}
                        onChange={(event) => setMatriculaDateEnd(event.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedMatriculaIds.length > 0 && (
                <section className="bulk-action-bar card">
                  <strong>{selectedMatriculaIds.length} matrícula(s) selecionada(s)</strong>
                  <div className="entity-actions">
                    <button type="button" className="icon-action-btn danger" aria-label="Remover matrículas selecionadas" onClick={handleBulkDeleteMatriculas}><Trash2 size={17} /></button>
                    <button type="button" className="icon-action-btn" aria-label="Limpar seleção de matrículas" onClick={() => setSelectedMatriculaIds([])}><X size={17} /></button>
                  </div>
                </section>
              )}

              <div className="card table-card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="compact-table-select"></th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleMatriculaSort('data_matricula')}>
                            Data da Matrícula <span className="sort-indicator">{matriculaSortIndicator('data_matricula')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleMatriculaSort('data_conclusao')}>
                            Data de Conclusão <span className="sort-indicator">{matriculaSortIndicator('data_conclusao')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleMatriculaSort('curso')}>
                            Curso <span className="sort-indicator">{matriculaSortIndicator('curso')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleMatriculaSort('turma')}>
                            Turma <span className="sort-indicator">{matriculaSortIndicator('turma')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleMatriculaSort('status')}>
                            Status <span className="sort-indicator">{matriculaSortIndicator('status')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleMatriculaSort('ativo')}>
                            Registro <span className="sort-indicator">{matriculaSortIndicator('ativo')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleMatriculaSort('chamadas')}>
                            Related Chamadas <span className="sort-indicator">{matriculaSortIndicator('chamadas')}</span>
                          </button>
                        </th>
                        <th>Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMatriculas.map((item) => (
                        <tr key={item.IdMatricula} onClick={() => startEditMatricula(item)}>
                          <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                            <input type="checkbox" checked={selectedMatriculaIds.includes(item.IdMatricula)} onClick={(event) => event.stopPropagation()} onChange={(event) => handleMatriculaCheckboxChange(event, item.IdMatricula)} />
                          </td>
                          <td>{formatDateBR(item.DataMatricula) || '-'}</td>
                          <td>{formatDateBR(item.DataConclusao) || '-'}</td>
                          <td>{item.NomeCurso || '-'}</td>
                          <td>{item.NomeTurma || '-'}</td>
                          <td>{item.StatusMatricula || '-'}</td>
                          <td>{item.ativo !== false ? 'Ativo' : 'Inativo'}</td>
                          <td>{item.RelatedChamadas || 0}</td>
                          <td onClick={(event) => event.stopPropagation()}>
                            <button type="button" className="icon-btn entity-edit-btn" aria-label="Editar matrícula" onClick={() => startEditMatricula(item)}>
                              <span aria-hidden="true">&gt;</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(matriculaPanelMode === 'edit' || matriculaPanelMode === 'create') && (
                <div className="workspace-overlay-panel">
                  <form onSubmit={matriculaPanelMode === 'edit' ? handleUpdateMatricula : handleCreateMatricula} className="card">
                    <div className="workspace-list-header">
                      <strong>{matriculaPanelMode === 'edit' ? 'Detalhes da Matrícula' : 'Nova Matrícula'}</strong>
                      <button type="button" className="icon-action-btn" aria-label="Fechar matrícula" onClick={closeMatriculaPanel}><X size={16} /></button>
                    </div>
                    <div className="form-row">
                      <div className="field">
                        <label>Aluno</label>
                        <select className="select" value={currentMatricula.IdAluno || ''} onChange={(event) => updateMatriculaDraft('IdAluno', event.target.value)}>
                          <option value="">Selecione</option>
                          {matriculaOptions.alunos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Curso</label>
                        <select className="select" value={currentMatricula.IdCurso || ''} onChange={(event) => updateMatriculaDraft('IdCurso', event.target.value)}>
                          <option value="">Selecione</option>
                          {matriculaOptions.cursos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Turma</label>
                        <select className="select" value={currentMatricula.IdTurma || ''} onChange={(event) => updateMatriculaDraft('IdTurma', event.target.value)}>
                          <option value="">Selecione</option>
                          {matriculaOptions.turmas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Data da Matrícula</label>
                        <input className="input" placeholder="DD/MM/YYYY" value={maskDateBRInput(currentMatricula.DataMatricula || '')} onChange={(event) => updateMatriculaDraft('DataMatricula', maskDateBRInput(event.target.value))} />
                      </div>
                      <div className="field">
                        <label>Data de Conclusão</label>
                        <input className="input" placeholder="DD/MM/YYYY" value={maskDateBRInput(currentMatricula.DataConclusao || '')} onChange={(event) => updateMatriculaDraft('DataConclusao', maskDateBRInput(event.target.value))} />
                      </div>
                      <div className="field">
                        <label>Status</label>
                        <select className="select" value={currentMatricula.StatusMatricula || 'Ativo'} onChange={(event) => updateMatriculaDraft('StatusMatricula', event.target.value)}>
                          {(matriculaOptions.status || ['Ativo', 'Trancado', 'Concluído', 'Cancelado']).map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>

                      {matriculaPanelMode === 'edit' && (
                        <DeleteBehaviorField
                          resourcePath="/cursos/matriculas"
                          entityId={editingMatricula?.IdMatricula}
                          active={currentMatricula.ativo !== false}
                          onActiveChange={(value) => updateMatriculaDraft('ativo', value)}
                          onDelete={(capability) => handleDeleteMatricula(editingMatricula.IdMatricula, capability)}
                        />
                      )}
                    </div>
                    <div className="toolbar" style={{ marginTop: 8 }}>
                      <button className="btn" type="submit">Salvar</button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
          )
        )}
      </section>
    </div>
  );
}
