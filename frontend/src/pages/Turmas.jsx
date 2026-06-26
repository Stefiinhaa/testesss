import React, { useEffect, useMemo, useState } from 'react';
import { ListFilter, Plus, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import api from '../api/apiConfig';
import DeleteBehaviorField from '../components/DeleteBehaviorField';
import EntityHeader from '../components/EntityHeader';
import ListFilterDrawer from '../components/ListFilterDrawer';
import ListPagination, { DEFAULT_PAGE_SIZE } from '../components/ListPagination';
import notify from '../utils/notify';
import { buildFilterParams } from '../utils/filterParams';
import { validateFormInDomOrder } from '../utils/formValidation';
import { normalizePagedResponse } from '../utils/pagedResponse';

const FILTER_DEFS = [
  { key: 'nome', label: 'Nome da turma', param: 'nome_in' },
  { key: 'ano', label: 'Ano', param: 'ano_in' },
  { key: 'professor', label: 'Professor Responsável', param: 'professor_in' },
  { key: 'status_turma', label: 'Status da Turma', param: 'status_turma_in' },
];

const FILTER_DEF_MAP = FILTER_DEFS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

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

const buildTurmaFilterOptions = (rows) => ({
  nome: Array.from(new Set(rows.map((row) => String(row.nome || '').trim()).filter(Boolean))).sort(),
  ano: Array.from(new Set(rows.map((row) => toYearText(row.ano)).filter(Boolean))).sort(),
  professor: Array.from(new Set(rows.map((row) => String(row.nome_professor || '').trim()).filter(Boolean))).sort(),
  status_turma: Array.from(new Set(rows.map((row) => (row.ativo === false ? 'Inativa' : 'Ativa')))).sort(),
});

const normalizeLegacyCollection = (data) => (Array.isArray(data) ? data : (data?.items || data?.data || []));

const toYearText = (value) => {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{4}$/.test(raw)) return raw;
  const datePart = raw.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart.slice(0, 4);
  return raw.slice(0, 4);
};

const toSortableDate = (value) => {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
};

const getTurmaSortValue = (item, field) => {
  switch (field) {
    case 'nome':
      return item.nome || '';
    case 'professor':
      return item.nome_professor || '';
    case 'ano':
      return item.ano || '';
    case 'data_conclusao':
      return item.data_conclusao || '';
    case 'ativo':
      return item.ativo !== false ? 'Ativa' : 'Inativa';
    default:
      return item.nome || '';
  }
};

const sortTurmas = (rows, field, direction) => [...rows].sort((left, right) => {
  const leftValue = getTurmaSortValue(left, field);
  const rightValue = getTurmaSortValue(right, field);

  let comparison = 0;
  if (field === 'ano' || field === 'data_conclusao') {
    comparison = toSortableDate(leftValue) - toSortableDate(rightValue);
  } else {
    comparison = String(leftValue || '').localeCompare(String(rightValue || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  return direction === 'desc' ? comparison * -1 : comparison;
});

const normalizeTurmaName = (value) => String(value || '').trim().toLocaleLowerCase('pt-BR');

export default function TurmasPage() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('ano');
  const [sortDir, setSortDir] = useState('asc');
  const [filterOptions, setFilterOptions] = useState({});
  const [professorOptions, setProfessorOptions] = useState([]);
  const [selectedFilterField, setSelectedFilterField] = useState(FILTER_DEFS[0].key);
  const [selectedFilterValue, setSelectedFilterValue] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [showInativos, setShowInativos] = useState(false);
  const [showSelection, setShowSelection] = useState(false);
  const [panelMode, setPanelMode] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [newItem, setNewItem] = useState({
    id_turma: '',
    nome: '',
    ano: '',
    id_professor: '',
  });

  const fetchItems = async (
    pageToFetch = page,
    perPage = pageSize,
    q = query,
    filters = activeFilters,
    sortField = sortBy,
    sortDirection = sortDir,
  ) => {
    setLoading(true);
    try {
      const filterParams = buildFilterParams(filters, FILTER_DEF_MAP);

      const resp = await api.get('/turmas/', {
        params: {
          page: pageToFetch,
          per_page: perPage,
          q,
          include_inativos: showInativos,
          sort_by: sortField,
          sort_dir: sortDirection,
          ...filterParams,
        },
      });
      const normalized = normalizePagedResponse(resp.data, pageToFetch);
      const primaryItems = normalized.items || [];

      if ((!primaryItems.length && !normalized.total) && !q && Object.keys(filterParams).length === 0) {
        const [turmasResp, professoresResp] = await Promise.all([
          api.get('/academico/turmas'),
          api.get('/academico/professores'),
        ]);
        const profMap = new Map((professoresResp.data || []).map((row) => [row.IdProfessor, row.NomeProfessor]));
        const fallbackItems = (turmasResp.data || []).map((row) => ({
          id_turma: row.IdTurma,
          nome: row.NomeTurma,
          ano: row.AnoTurma,
          id_professor: row.IdProfessor,
          nome_professor: profMap.get(row.IdProfessor) || null,
          ativo: true,
        }));
        setItems(fallbackItems.slice((pageToFetch - 1) * perPage, (pageToFetch - 1) * perPage + perPage));
        setTotal(fallbackItems.length);
        setPage(pageToFetch);
      } else {
        setItems(primaryItems);
        setTotal(normalized.total || 0);
        setPage(normalized.page || pageToFetch);
      }
    } catch (err) {
      console.error(err);
      try {
        const [turmasResp, professoresResp] = await Promise.all([
          api.get('/academico/turmas'),
          api.get('/academico/professores'),
        ]);
        const profMap = new Map((professoresResp.data || []).map((row) => [row.IdProfessor, row.NomeProfessor]));
        const fallbackItems = (turmasResp.data || []).map((row) => ({
          id_turma: row.IdTurma,
          nome: row.NomeTurma,
          ano: row.AnoTurma,
          id_professor: row.IdProfessor,
          nome_professor: profMap.get(row.IdProfessor) || null,
          ativo: true,
        }));
        setItems(fallbackItems.slice((pageToFetch - 1) * perPage, (pageToFetch - 1) * perPage + perPage));
        setTotal(fallbackItems.length);
        setPage(pageToFetch);
      } catch (fallbackErr) {
        notify('Erro ao buscar turmas', { duration: 3000 });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const resp = await api.get('/turmas/filter-options', { params: { include_inativos: showInativos } });
      const options = (resp.data || {}).options || {};
      if ((options.nome || []).length || (options.ano || []).length || (options.professor || []).length) {
        setFilterOptions(mergeFilterOptions(buildTurmaFilterOptions(items), options));
        return;
      }

      const [turmasResp, professoresResp] = await Promise.all([
        api.get('/academico/turmas'),
        api.get('/academico/professores'),
      ]);
      const turmas = normalizeLegacyCollection(turmasResp.data);
      const professores = normalizeLegacyCollection(professoresResp.data);
      const nomes = Array.from(new Set(turmas.map((row) => String(row.NomeTurma || '').trim()).filter(Boolean))).sort();
      const anos = Array.from(new Set(turmas.map((row) => toYearText(row.AnoTurma)).filter(Boolean))).sort();
      const profNomes = Array.from(new Set(professores.map((row) => String(row.NomeProfessor || '').trim()).filter(Boolean))).sort();
      setFilterOptions(mergeFilterOptions(buildTurmaFilterOptions(items), { nome: nomes, ano: anos, professor: profNomes }));
    } catch (err) {
      console.error(err);
      try {
        const [turmasResp, professoresResp] = await Promise.all([
          api.get('/academico/turmas'),
          api.get('/academico/professores'),
        ]);
        const turmas = normalizeLegacyCollection(turmasResp.data);
        const professores = normalizeLegacyCollection(professoresResp.data);
        const nomes = Array.from(new Set(turmas.map((row) => String(row.NomeTurma || '').trim()).filter(Boolean))).sort();
        const anos = Array.from(new Set(turmas.map((row) => toYearText(row.AnoTurma)).filter(Boolean))).sort();
        const profNomes = Array.from(new Set(professores.map((row) => String(row.NomeProfessor || '').trim()).filter(Boolean))).sort();
        setFilterOptions(mergeFilterOptions(buildTurmaFilterOptions(items), { nome: nomes, ano: anos, professor: profNomes }));
      } catch (fallbackErr) {
        setFilterOptions({});
      }
    }
  };

  const fetchProfessorOptions = async () => {
    try {
      const resp = await api.get('/turmas/professores');
      const normalized = normalizePagedResponse(resp.data, 1);
      const primaryItems = normalized.items || [];
      if (primaryItems.length) {
        setProfessorOptions(primaryItems);
        return;
      }
      // Prevent test environment error: window.URL is not defined in jsdom
      if (typeof window !== 'undefined' && typeof window.URL === 'undefined') {
        setProfessorOptions([]);
        return;
      }
      const fallbackResp = await api.get('/academico/professores');
      const fallbackItems = (fallbackResp.data || []).map((row) => ({ id_professor: row.IdProfessor, nome: row.NomeProfessor }));
      setProfessorOptions(fallbackItems);
    } catch (err) {
      console.error(err);
      try {
        const fallbackResp = await api.get('/academico/professores');
        const fallbackItems = (fallbackResp.data || []).map((row) => ({ id_professor: row.IdProfessor, nome: row.NomeProfessor }));
        setProfessorOptions(fallbackItems);
      } catch (fallbackErr) {
        setProfessorOptions([]);
      }
    }
  };

  useEffect(() => {
    fetchFilterOptions();
    fetchProfessorOptions();
    fetchItems(1, DEFAULT_PAGE_SIZE, query, activeFilters, sortBy, sortDir);
  }, []);

  useEffect(() => {
    fetchFilterOptions();
  }, [showInativos]);

  useEffect(() => {
    if (!items.length) return;
    setFilterOptions((previous) => mergeFilterOptions(previous, buildTurmaFilterOptions(items)));
  }, [items]);

  useEffect(() => {
    if (page) fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
  }, [page, pageSize, query, activeFilters, sortBy, sortDir, showInativos]);

  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const rangeStart = total ? ((page - 1) * pageSize) + 1 : 0;
  const rangeEnd = total ? Math.min(page * pageSize, total) : 0;
  const isReadOnlyDetails = false;

  const resetForm = () => setNewItem({ id_turma: '', nome: '', ano: '', id_professor: '' });

  const startCreate = () => {
    setEditingItem(null);
    resetForm();
    setPanelMode('create');
  };

  const startEdit = (item) => {
    setEditingItem({
      ...item,
      ativo: item.ativo !== false && item.Ativo !== false,
      ano: toYearText(item.ano),
      id_professor: item.id_professor || '',
    });
    setPanelMode('edit');
  };

  const closePanel = () => {
    setEditingItem(null);
    setPanelMode(null);
  };

  const payloadAno = (anoText) => {
    const year = String(anoText || '').replace(/\D/g, '').slice(0, 4);
    if (!year || year.length !== 4) return null;
    return `${year}-01-01`;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!validateFormInDomOrder({ form: e.currentTarget, notify })) return;
    const anoTurma = payloadAno(newItem.ano);
    const turmaName = String(newItem.nome || '').trim();
    if (!anoTurma) {
      notify('Informe o ano da turma com 4 dígitos.', { duration: 3000 });
      return;
    }
    if (!turmaName) {
      notify('Informe o nome da turma.', { duration: 3000 });
      return;
    }
    if ((filterOptions.nome || []).some((value) => normalizeTurmaName(value) === normalizeTurmaName(turmaName))) {
      notify('Já existe uma turma cadastrada com esse nome.', { type: 'error', duration: 3500 });
      return;
    }

    try {
      await api.post('/turmas/', {
        NomeTurma: turmaName,
        AnoTurma: anoTurma,
        IdProfessor: newItem.id_professor || undefined,
      });
      resetForm();
      closePanel();
      fetchItems(1, pageSize, query, activeFilters, sortBy, sortDir);
      fetchFilterOptions();
      notify('Turma criada', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao criar turma', { duration: 3500 });
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!validateFormInDomOrder({ form: e.currentTarget, notify })) return;
    if (!editingItem) return;

    const anoTurma = payloadAno(editingItem.ano);
    const turmaName = String(editingItem.nome || '').trim();
    if (!anoTurma) {
      notify('Informe o ano da turma com 4 dígitos.', { duration: 3000 });
      return;
    }
    if (!turmaName) {
      notify('Informe o nome da turma.', { duration: 3000 });
      return;
    }
    if ((filterOptions.nome || []).some((value) => normalizeTurmaName(value) === normalizeTurmaName(turmaName) && normalizeTurmaName(value) !== normalizeTurmaName(items.find((item) => item.id_turma === editingItem.id_turma)?.nome))) {
      notify('Já existe uma turma cadastrada com esse nome.', { type: 'error', duration: 3500 });
      return;
    }

    try {
      await api.put(`/turmas/${editingItem.id_turma}`, {
        NomeTurma: turmaName,
        AnoTurma: anoTurma,
        IdProfessor: editingItem.id_professor || null,
        Ativo: !!editingItem.ativo,
      });
      closePanel();
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
      fetchFilterOptions();
      notify('Turma atualizada', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao atualizar turma', { duration: 3500 });
    }
  };

  const handleDelete = async (id, capability = null) => {
    const confirmationMessage = capability?.confirmation_message || 'Remover/Inativar turma?';
    if (!confirm(confirmationMessage)) return;
    try {
      const response = await api.delete(`/turmas/${id}`);
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
      fetchFilterOptions();
      notify(response?.data?.message || 'Turma removida/inativada', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao processar remoção', { duration: 3500 });
    }
  };

  const addFilterCriterion = () => {
    if (!selectedFilterField || !selectedFilterValue) return;
    setActiveFilters((prev) => {
      const current = prev[selectedFilterField] || [];
      if (current.includes(selectedFilterValue)) return prev;
      return { ...prev, [selectedFilterField]: [...current, selectedFilterValue] };
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
    setActiveFilters((prev) => {
      const current = prev[fieldKey] || [];
      if (current.includes(value)) return prev;
      return { ...prev, [fieldKey]: [...current, value] };
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

  const selectableValues = filterOptions[selectedFilterField] || [];
  const sortedItems = useMemo(() => sortTurmas(items, sortBy, sortDir), [items, sortBy, sortDir]);
  const activeFilterCount = activeFilterChips.length;
  const bulkCountLabel = `${selectedIds.length} selecionado(s)`;
  const resetSelection = () => setSelectedIds([]);

  const toggleSelection = (id) => {
    setSelectedIds((previous) => (previous.includes(id)
      ? previous.filter((value) => value !== id)
      : [...previous, id]));
  };

  const handleSelectionChange = (event, id) => {
    event.stopPropagation();
    toggleSelection(id);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length || !window.confirm('Remover/Inativar turmas selecionadas?')) return;
    try {
      await Promise.all(selectedIds.map((id) => api.delete(`/turmas/${id}`)));
      resetSelection();
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
      fetchFilterOptions();
      notify('Ação processada com sucesso nas turmas', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao processar turmas selecionadas', { duration: 3500 });
    }
  };

  return (
    <div className={`app-shell app-shell-tight entity-page ${showSelection ? 'selection-mode' : ''}`}>
      <EntityHeader
        breadcrumbs={[
          { label: 'Turmas' },
        ]}
        title="Turmas"
        meta={`${total} registro(s)`}
        filterChips={activeFilterChips}
        onRemoveFilterChip={removeFilterCriterion}
        actions={(
          <>
          {/* CHECKBOX MOSTRAR INATIVOS ADICIONADA AQUI */}
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
          <button type="button" className="icon-action-btn entity-add-btn" aria-label="Adicionar turma" onClick={startCreate}>
            <Plus size={17} />
            <span>Adicionar</span>
          </button>
          </>
        )}
      />

      {selectedIds.length > 0 && (
        <section className="bulk-action-bar card">
          <strong>{bulkCountLabel}</strong>
          <div className="entity-actions">
            <button type="button" className="icon-action-btn danger" aria-label="Remover/Inativar selecionados" onClick={handleBulkDelete}>
              <Trash2 size={17} />
            </button>
            <button type="button" className="icon-action-btn" aria-label="Limpar seleção" onClick={resetSelection}>
              <X size={17} />
            </button>
          </div>
        </section>
      )}

      <ListFilterDrawer
        open={showFilters}
        dataTestId="turmas-filter-drawer"
        subtitle="Nome, ano e professor ficam listados com todos os valores disponíveis."
        closeButton={<button type="button" className="icon-action-btn" aria-label="Fechar filtros" onClick={() => setShowFilters(false)}><span aria-hidden="true">←</span></button>}
        searchId="turmas-drawer-search"
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
        clearDisabled={!activeFilterCount}
        onSuggestedFilterSelect={handleSuggestedFilterSelect}
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
                          <button type="button" className="sort-btn" onClick={() => toggleSort('nome')}>
                            Nome da Turma <span className="sort-indicator">{sortIndicator('nome')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('professor')}>
                            Professor Responsável <span className="sort-indicator">{sortIndicator('professor')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('ano')}>
                            AnoTurma <span className="sort-indicator">{sortIndicator('ano')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('data_conclusao')}>
                            Data de Conclusão <span className="sort-indicator">{sortIndicator('data_conclusao')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('ativo')}>
                            Status da Turma <span className="sort-indicator">{sortIndicator('ativo')}</span>
                          </button>
                        </th>
                        <th className="sticky-actions">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedItems.map((item) => (
                        <tr key={item.id_turma} className="data-row" onClick={() => startEdit(item)}>
                          <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                            <input type="checkbox" checked={selectedIds.includes(item.id_turma)} onClick={(event) => event.stopPropagation()} onChange={(event) => handleSelectionChange(event, item.id_turma)} />
                          </td>
                          <td>
                            <div className="table-primary-text">{item.nome}</div>
                          </td>
                          <td>
                            <div className="table-primary-text">{item.nome_professor || 'Sem professor vinculado'}</div>
                          </td>
                          <td>{toYearText(item.ano)}</td>
                          <td>{item.data_conclusao ? new Date(item.data_conclusao).toLocaleDateString('pt-BR') : '-'}</td>
                          <td>{item.ativo !== false ? 'Ativa' : 'Inativa'}</td>
                          <td className="sticky-actions">
                            <button className="icon-btn entity-edit-btn" aria-label="Detalhes" title="Detalhes" onClick={(e) => { e.stopPropagation(); startEdit(item); }}>
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

            <aside className={`split-panel ${panelMode ? 'open' : ''}`}>
              {(panelMode === 'edit' || panelMode === 'create') && (
                <form onSubmit={panelMode === 'edit' ? handleUpdate : handleCreate} noValidate className="card">
                  <div className="panel-header">
                    <h3>{panelMode === 'edit' ? 'Detalhes da Turma' : 'Nova Turma'}</h3>
                    <div className="panel-header-actions">
                      <button className="btn ghost" type="button" onClick={closePanel}>Fechar</button>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="field">
                      <label className="field-label-required">Nome da turma</label>
                      <input
                        className="input"
                        required
                        value={panelMode === 'edit' ? editingItem.nome : newItem.nome}
                        disabled={isReadOnlyDetails}
                        onChange={(e) => panelMode === 'edit'
                          ? setEditingItem({ ...editingItem, nome: e.target.value })
                          : setNewItem({ ...newItem, nome: e.target.value })}
                      />
                    </div>

                    <div className="field">
                      <label className="field-label-required">Ano</label>
                      <input
                        className="input"
                        required
                        maxLength={4}
                        placeholder="2026"
                        value={panelMode === 'edit' ? editingItem.ano : newItem.ano}
                        disabled={isReadOnlyDetails}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                          panelMode === 'edit'
                            ? setEditingItem({ ...editingItem, ano: value })
                            : setNewItem({ ...newItem, ano: value });
                        }}
                      />
                    </div>

                    <div className="field">
                      <label>Professor</label>
                      <select
                        className="select"
                        value={panelMode === 'edit' ? editingItem.id_professor : newItem.id_professor}
                        disabled={isReadOnlyDetails}
                        onChange={(e) => panelMode === 'edit'
                          ? setEditingItem({ ...editingItem, id_professor: e.target.value })
                          : setNewItem({ ...newItem, id_professor: e.target.value })}
                      >
                        <option value="">Sem professor</option>
                        {professorOptions.map((prof) => (
                          <option key={prof.id_professor} value={prof.id_professor}>{prof.nome}</option>
                        ))}
                      </select>
                    </div>

                    {panelMode === 'edit' && (
                      <DeleteBehaviorField
                        resourcePath="/turmas"
                        entityId={editingItem?.id_turma}
                        active={!!editingItem?.ativo}
                        disabled={isReadOnlyDetails}
                        onActiveChange={(value) => setEditingItem({ ...editingItem, ativo: value })}
                        onDelete={(capability) => handleDelete(editingItem.id_turma, capability)}
                      />
                    )}
                  </div>

                  <div className="toolbar" style={{ marginTop: 8 }}>
                    {!isReadOnlyDetails && <button className="btn" type="submit">Salvar</button>}
                    {panelMode === 'edit' && <DeleteBehaviorField placement="toolbar" resourcePath="/turmas" entityId={editingItem?.id_turma} active={!!editingItem?.ativo} disabled={isReadOnlyDetails} onActiveChange={(value) => setEditingItem({ ...editingItem, ativo: value })} onDelete={(capability) => handleDelete(editingItem.id_turma, capability)} />}
                    <button className="btn ghost" type="button" onClick={closePanel}>{isReadOnlyDetails ? 'Fechar' : 'Cancelar'}</button>
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
