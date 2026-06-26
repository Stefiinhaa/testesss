import React, { useEffect, useState } from 'react';
import { ListFilter, Plus, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
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

const FILTER_DEFS = [
  { key: 'id_aluno', label: 'Aluno', param: 'id_aluno' },
  { key: 'id_interesse', label: 'Interesse', param: 'id_interesse' },
];

const FILTER_DEF_MAP = FILTER_DEFS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

const normalizeAtivoValue = (value) => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return !['false', '0', 'nao', 'não', 'inativo'].includes(normalized);
  }
  return value !== false && value !== 0;
};

export default function AlunosInteressesPage() {
  const [searchParams] = useSearchParams();
  const origin = searchParams.get('origin');
  const alunoId = searchParams.get('aluno') || '';
  const alunoNome = searchParams.get('alunoNome') || 'Aluno';
  const isAlunoContext = origin === 'alunos' && Boolean(alunoId);
  const [items, setItems] = useState([]);
  const [formOptions, setFormOptions] = useState({ alunos: [], interesses: [] });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('id_aluno_interesse');
  const [sortDir, setSortDir] = useState('asc');

  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterField, setSelectedFilterField] = useState(FILTER_DEFS[0].key);
  const [selectedFilterValue, setSelectedFilterValue] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [showInativos, setShowInativos] = useState(false);
  const [showSelection, setShowSelection] = useState(false);

  const [panelMode, setPanelMode] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [newItem, setNewItem] = useState({ IdAlunoInteresse: '', IdAluno: '', IdInteresse: '' });

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
      const resp = await api.get('/alunos-interesses/', {
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
      setError('Erro ao carregar alunos interesses.');
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const resp = await api.get('/alunos-interesses/filter-options', {
        params: {
          include_inativos: showInativos,
        },
      });
      setFilterOptions((resp.data || {}).options || {});
    } catch (err) {
      console.error(err);
      setFilterOptions({});
    }
  };

  const fetchFormOptions = async (alunoId = '', currentId = '') => {
    try {
      const response = await api.get('/alunos-interesses/form-options', {
        params: {
          aluno_id: alunoId || undefined,
          current_id: currentId || undefined,
        },
      });
      setFormOptions({
        alunos: response.data?.alunos || [],
        interesses: response.data?.interesses || [],
      });
    } catch (err) {
      console.error(err);
      setFormOptions({ alunos: [], interesses: [] });
    }
  };

  useEffect(() => {
    fetchFormOptions(searchParams.get('aluno') || '');
    fetchFilterOptions();
    fetchItems(1, DEFAULT_PAGE_SIZE, '', {}, 'id_aluno_interesse', 'asc', showInativos);
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
      IdAlunoInteresse: '',
      IdAluno: searchParams.get('aluno') || previous.IdAluno || '',
      IdInteresse: searchParams.get('interesse') || previous.IdInteresse || '',
    }));
    setPanelMode('create');
  }, [searchParams]);

  const selectedAlunoId = panelMode === 'edit' ? (editingItem?.IdAluno || '') : (newItem.IdAluno || searchParams.get('aluno') || '');
  const selectedCurrentId = panelMode === 'edit' ? (editingItem?.IdAlunoInteresse || '') : '';
  const availableInteresses = formOptions.interesses || [];
  const hideCreateAction = Boolean(searchParams.get('aluno')) && !availableInteresses.length;

  useEffect(() => {
    if (!panelMode) return;
    fetchFormOptions(selectedAlunoId, selectedCurrentId);
  }, [panelMode, selectedAlunoId, selectedCurrentId]);

  useEffect(() => {
    const selectedInteresseId = panelMode === 'edit' ? editingItem?.IdInteresse : newItem.IdInteresse;
    if (!selectedInteresseId) return;
    if (availableInteresses.some((item) => item.id === selectedInteresseId)) return;
    if (panelMode === 'edit') {
      setEditingItem((previous) => ({ ...(previous || {}), IdInteresse: '' }));
      return;
    }
    setNewItem((previous) => ({ ...previous, IdInteresse: '' }));
  }, [availableInteresses, panelMode]);

  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const rangeStart = total ? ((page - 1) * pageSize) + 1 : 0;
  const rangeEnd = total ? Math.min(page * pageSize, total) : 0;
  const isReadOnlyDetails = false;

  const resetForm = () => setNewItem({ IdAlunoInteresse: '', IdAluno: '', IdInteresse: '' });

  const startCreate = () => {
    setEditingItem(null);
    resetForm();
    setPanelMode('create');
  };

  const startEdit = (item) => {
    setEditingItem({
      ativo: normalizeAtivoValue(item.ativo ?? item.Ativo),
      ...item,
    });
    setPanelMode('edit');
  };

  const closePanel = () => {
    setEditingItem(null);
    setPanelMode(null);
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
      await api.post('/alunos-interesses/', {
        IdAlunoInteresse: newItem.IdAlunoInteresse || undefined,
        IdAluno: newItem.IdAluno,
        IdInteresse: newItem.IdInteresse,
      });
      resetForm();
      closePanel();
      fetchItems(1, pageSize, query, activeFilters, sortBy, sortDir);
      fetchFilterOptions();
      notify('Vínculo criado', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao criar vínculo', { duration: 3500 });
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!validateFormInDomOrder({ form: e.currentTarget, notify })) return;
    if (!editingItem) return;
    try {
      await api.put(`/alunos-interesses/${editingItem.IdAlunoInteresse}`, {
        IdAluno: editingItem.IdAluno,
        IdInteresse: editingItem.IdInteresse,
        Ativo: editingItem.ativo !== false,
      });
      closePanel();
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
      fetchFilterOptions();
      notify('Vínculo atualizado', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao atualizar vínculo', { duration: 3500 });
    }
  };

  const handleDelete = async (id, capability = null) => {
    const confirmationMessage = capability?.confirmation_message || 'Remover vínculo?';
    if (!confirm(confirmationMessage)) return;
    try {
      const response = await api.delete(`/alunos-interesses/${id}`);
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
      fetchFilterOptions();
      notify(response?.data?.message || 'Vínculo removido', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao remover vínculo', { duration: 3500 });
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
    if (!selectedIds.length || !window.confirm('Remover vínculos selecionados?')) return;
    try {
      await Promise.all(selectedIds.map((id) => api.delete(`/alunos-interesses/${id}`)));
      resetSelection();
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
      fetchFilterOptions();
      notify('Vínculos removidos', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao remover vínculos', { duration: 3500 });
    }
  };

  return (
    <div className={`app-shell app-shell-tight entity-page ${showSelection ? 'selection-mode' : ''}`}>
      <EntityHeader
        breadcrumbs={origin === 'alunos'
          ? [
            { label: 'Alunos', to: '/alunos' },
            { label: alunoNome, to: alunoId ? `/alunos?edit=${encodeURIComponent(alunoId)}` : '/alunos' },
            { label: 'Interesses' },
          ]
          : [
            { label: 'Alunos Interesses' },
          ]}
        title="Listagem de Alunos Interesses"
        meta={`${total} registro(s)`}
        filterChips={activeFilterChips}
        onRemoveFilterChip={removeFilterCriterion}
        actions={(
          <>
          <button type="button" className="icon-action-btn filter-toggle-btn" aria-label="Abrir filtros" onClick={() => setShowFilters((prev) => !prev)}>
            {showFilters ? <X size={17} /> : <ListFilter size={17} />}
          </button>
          <button type="button" className={`icon-action-btn selection-toggle-btn ${showSelection ? 'active' : ''}`} aria-label="Alternar seleção" onClick={() => { setShowSelection((previous) => { if (previous) resetSelection(); return !previous; }); }}>
            {showSelection ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
          </button>
          {!hideCreateAction && (
            <button type="button" className="icon-action-btn entity-add-btn" aria-label="Adicionar vínculo" onClick={startCreate}>
              <Plus size={17} />
              <span>Adicionar</span>
            </button>
          )}
          </>
        )}
      />

      {selectedIds.length > 0 && (
        <section className="bulk-action-bar card">
          <strong>{bulkCountLabel}</strong>
          <div className="entity-actions">
            <button type="button" className="icon-action-btn danger" aria-label="Remover selecionados" onClick={handleBulkDelete}>
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
        dataTestId="alunos-interesses-filter-drawer"
        subtitle="Concentre os critérios no drawer e deixe a grade focada na relação."
        closeButton={<button type="button" className="icon-action-btn" aria-label="Fechar filtros" onClick={() => setShowFilters(false)}><span aria-hidden="true">←</span></button>}
        searchId="alunos-interesses-drawer-search"
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
        showInlineActiveChips={false}
      />

      <section>
        {loading ? <div>Carregando...</div> : (
          <div className={`split-layout ${panelMode ? 'has-panel' : ''}`}>
            <div className="split-main">
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
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('id_aluno')}>
                            Aluno vinculado <span className="sort-indicator">{sortIndicator('id_aluno')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('id_interesse')}>
                            Interesse vinculado <span className="sort-indicator">{sortIndicator('id_interesse')}</span>
                          </button>
                        </th>
                        <th className="sticky-actions">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length > 0 ? items.map((item) => {
                        const isItemActive = item.ativo !== false;
                        return (
                          <tr key={item.IdAlunoInteresse} className="data-row" onClick={() => startEdit(item)}>
                            <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                              <input type="checkbox" checked={selectedIds.includes(item.IdAlunoInteresse)} onClick={(event) => event.stopPropagation()} onChange={(event) => handleSelectionChange(event, item.IdAlunoInteresse)} />
                            </td>
                            <td>
                              <div className="table-primary-text">{item.NomeAluno || 'Aluno não encontrado'}</div>
                              <div className="table-secondary-text">Relação ativa</div>
                            </td>
                            <td>
                              <div className="table-primary-text">{item.DescricaoInteresse || 'Interesse não encontrado'}</div>
                              <div className="table-secondary-text">Interesse vinculado</div>
                            </td>
                            <td className="sticky-actions">
                              <button className="icon-btn entity-edit-btn" aria-label="Detalhes" title="Detalhes" onClick={(e) => { e.stopPropagation(); startEdit(item); }}>
                                <span aria-hidden="true">&gt;</span>
                              </button>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center' }}>Nenhum vínculo encontrado.</td>
                        </tr>
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
                <form onSubmit={panelMode === 'edit' ? handleUpdate : handleCreate} noValidate className="card">
                  <div className="panel-header">
                    <h3>{panelMode === 'edit' ? 'Detalhes do Vínculo' : 'Novo Vínculo'}</h3>
                    <div className="panel-header-actions">
                      <button className="btn ghost" type="button" onClick={closePanel}>Fechar</button>
                    </div>
                  </div>

                  <div className="form-row">
                    {isAlunoContext ? (
                      <div className="field">
                        <label>Aluno</label>
                        <div className="record-meta">
                          <strong>{alunoNome}</strong>
                        </div>
                      </div>
                    ) : (
                      <div className="field">
                        <label>Aluno *</label>
                        <select
                          required
                          className="select"
                          value={panelMode === 'edit' ? editingItem.IdAluno : newItem.IdAluno}
                          disabled={isReadOnlyDetails}
                          onChange={(e) => panelMode === 'edit'
                            ? updateEditingItem('IdAluno', e.target.value)
                            : setNewItem({ ...newItem, IdAluno: e.target.value })}
                        >
                          <option value="">Selecione...</option>
                          {formOptions.alunos.map((item) => (
                            <option key={item.id} value={item.id}>{item.nome}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="field">
                      <label>Interesse *</label>
                      <select
                        required
                        className="select"
                        value={panelMode === 'edit' ? editingItem.IdInteresse : newItem.IdInteresse}
                        disabled={isReadOnlyDetails}
                        onChange={(e) => panelMode === 'edit'
                          ? updateEditingItem('IdInteresse', e.target.value)
                          : setNewItem({ ...newItem, IdInteresse: e.target.value })}
                      >
                        <option value="">Selecione...</option>
                        {availableInteresses.map((item) => (
                          <option key={item.id} value={item.id}>{item.nome}</option>
                        ))}
                      </select>
                      {!availableInteresses.length && (
                        <span className="helper-text">Nenhum interesse restante disponível para vínculo.</span>
                      )}
                    </div>
                  </div>

                  {panelMode === 'edit' && (
                    <DeleteBehaviorField
                      resourcePath="/alunos-interesses"
                      entityId={editingItem?.IdAlunoInteresse}
                      active={editingItem?.ativo ?? true}
                      disabled={isReadOnlyDetails}
                      onActiveChange={(value) => updateEditingItem('ativo', value)}
                      onDelete={(capability) => handleDelete(editingItem.IdAlunoInteresse, capability)}
                    />
                  )}

                  <div className="toolbar" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
                    {!isReadOnlyDetails && <button className="btn" type="submit" disabled={!availableInteresses.length}>Salvar</button>}
                    {panelMode === 'edit' && <DeleteBehaviorField placement="toolbar" resourcePath="/alunos-interesses" entityId={editingItem?.IdAlunoInteresse} active={editingItem?.ativo ?? true} disabled={isReadOnlyDetails} onActiveChange={(value) => updateEditingItem('ativo', value)} onDelete={(capability) => handleDelete(editingItem.IdAlunoInteresse, capability)} />}
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
