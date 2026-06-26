import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
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
  { key: 'descricao', label: 'Descricao', param: 'descricao_in' },
  { key: 'ativo', label: 'Status', param: 'ativo_in' },
];

const FILTER_DEF_MAP = FILTER_DEFS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

const createEmptyInteresse = () => ({ IdInteresse: '', Descricao: '', ativo: true });

// Normalizador para lidar de forma robusta com valores de Ativo/Inativo
const normalizeAtivoValue = (value) => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return !['false', '0', 'nao', 'não', 'inativo'].includes(normalized);
  }
  return value !== false && value !== 0;
};

export default function InteressesPage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('descricao');
  const [sortDir, setSortDir] = useState('asc');
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterField, setSelectedFilterField] = useState(FILTER_DEFS[0].key);
  const [selectedFilterValue, setSelectedFilterValue] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [showInativos, setShowInativos] = useState(false);
  const [showSelection, setShowSelection] = useState(false);
  const [panelMode, setPanelMode] = useState(null);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [newItem, setNewItem] = useState(createEmptyInteresse());
  const [relatedLinks, setRelatedLinks] = useState([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

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
      // Diferente de Alunos, aqui nós garantimos que não forçamos um array exclusivo
      // de ['Inativo'], apenas passamos o includeInactive. Assim ele traz os inativos
      // *junto* com os ativos quando a checkbox estiver marcada.
      const filterParams = buildFilterParams(filters, FILTER_DEF_MAP);
      const resp = await api.get('/interesses/', {
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

      // Mapeando para garantir o status ativo blindado
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
      setError('Erro ao carregar interesses.');
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const resp = await api.get('/interesses/filter-options', {
        params: { include_inativos: showInativos },
      });
      setFilterOptions((resp.data || {}).options || {});
    } catch (err) {
      console.error(err);
      setFilterOptions({});
    }
  };

  const fetchRelatedLinks = async (idInteresse) => {
    if (!idInteresse) {
      setRelatedLinks([]);
      return;
    }
    setLoadingRelated(true);
    try {
      const response = await api.get('/alunos-interesses/', {
        params: {
          page: 1,
          per_page: 5000,
          include_inativos: true,
          id_interesse: idInteresse,
        },
      });
      const normalized = normalizePagedResponse(response.data, 1);
      setRelatedLinks(normalized.items || []);
    } catch (err) {
      console.error(err);
      setRelatedLinks([]);
    } finally {
      setLoadingRelated(false);
    }
  };

  useEffect(() => {
    fetchFilterOptions();
    fetchItems(1, DEFAULT_PAGE_SIZE, query, activeFilters, sortBy, sortDir, showInativos);
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
    setNewItem(createEmptyInteresse());
    setPanelMode('create');
    setRelatedLinks([]);
  }, [searchParams]);

  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const rangeStart = total ? ((page - 1) * pageSize) + 1 : 0;
  const rangeEnd = total ? Math.min(page * pageSize, total) : 0;
  const activeItemId = editingItem?.IdInteresse || null;
  const activeItemIndex = useMemo(
    () => items.findIndex((item) => item.IdInteresse === activeItemId),
    [items, activeItemId],
  );
  const hasPrev = activeItemIndex > 0;
  const hasNext = activeItemIndex >= 0 && activeItemIndex < items.length - 1;

  const resetForm = () => setNewItem(createEmptyInteresse());

  const openEdit = (item) => {
    const normalized = { ...item, ativo: normalizeAtivoValue(item.ativo ?? item.Ativo) };
    setEditingItem(normalized);
    setPanelMode('edit');
    fetchRelatedLinks(normalized.IdInteresse);
  };

  const startCreate = () => {
    setEditingItem(null);
    resetForm();
    setPanelMode('create');
    setRelatedLinks([]);
  };

  const closePanel = () => {
    setEditingItem(null);
    setPanelMode(null);
    setDetailExpanded(false);
    setRelatedLinks([]);
  };

  const navigateRecord = (direction) => {
    if (activeItemIndex < 0) return;
    const target = items[activeItemIndex + direction];
    if (!target) return;
    openEdit(target);
  };

  const updateEditingItem = (field, value) => {
    setEditingItem((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!validateFormInDomOrder({ form: event.currentTarget, notify })) return;
    try {
      await api.post('/interesses/', {
        IdInteresse: newItem.IdInteresse || undefined,
        Descricao: newItem.Descricao,
      });
      notify('Interesse criado', { duration: 2500 });
      closePanel();
      fetchItems(1, pageSize, query, activeFilters, sortBy, sortDir, showInativos);
      fetchFilterOptions();
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao criar interesse', { duration: 3500 });
    }
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!validateFormInDomOrder({ form: event.currentTarget, notify })) return;
    if (!editingItem) return;
    try {
      await api.put(`/interesses/${editingItem.IdInteresse}`, {
        Descricao: editingItem.Descricao,
        Ativo: editingItem.ativo !== false,
      });
      notify('Interesse atualizado', { duration: 2500 });
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir, showInativos);
      fetchFilterOptions();
      fetchRelatedLinks(editingItem.IdInteresse);
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao atualizar interesse', { duration: 3500 });
    }
  };

  const handleDelete = async (id, capability = null) => {
    const confirmationMessage = capability?.confirmation_message || 'Remover interesse?';
    if (!window.confirm(confirmationMessage)) return;
    try {
      const response = await api.delete(`/interesses/${id}`);
      notify(response?.data?.message || 'Interesse removido/inativado', { duration: 2500 });
      if (editingItem?.IdInteresse === id) closePanel();
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir, showInativos);
      fetchFilterOptions();
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao remover interesse', { duration: 3500 });
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

  const selectableValues = filterOptions[selectedFilterField] || [];
  const bulkCountLabel = `${selectedIds.length} selecionado(s)`;

  const resetSelection = () => setSelectedIds([]);

  const toggleSelection = (id) => {
    setSelectedIds((previous) => (
      previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]
    ));
  };

  const handleSelectionChange = (event, id) => {
    event.stopPropagation();
    toggleSelection(id);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length || !window.confirm('Remover/Inativar interesses selecionados?')) return;
    try {
      await Promise.all(selectedIds.map((id) => api.delete(`/interesses/${id}`)));
      resetSelection();
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir, showInativos);
      fetchFilterOptions();
      notify('Ação processada com sucesso nos interesses', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao remover interesses', { duration: 3500 });
    }
  };

  return (
    <div className={`app-shell app-shell-tight entity-page ${showSelection ? 'selection-mode' : ''}`}>
      <EntityHeader
        breadcrumbs={[{ label: 'Interesses' }]}
        title="Listagem de Interesses"
        meta={`${total} registro(s)`}
        filterChips={activeFilterChips}
        onRemoveFilterChip={removeFilterCriterion}
        actions={(
          <>
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

            <button type="button" className="icon-action-btn filter-toggle-btn" aria-label="Abrir filtros" onClick={() => setShowFilters((prev) => !prev)}>
              {showFilters ? <X size={17} /> : <ListFilter size={17} />}
            </button>
            <button
              type="button"
              className={`icon-action-btn selection-toggle-btn ${showSelection ? 'active' : ''}`}
              aria-label="Alternar selecao"
              onClick={() => {
                setShowSelection((previous) => {
                  if (previous) resetSelection();
                  return !previous;
                });
              }}
            >
              {showSelection ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
            </button>
            <button type="button" className="icon-action-btn entity-add-btn" aria-label="Adicionar interesse" onClick={startCreate}>
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
            <button type="button" className="icon-action-btn danger" aria-label="Remover selecionados" onClick={handleBulkDelete}>
              <Trash2 size={17} />
            </button>
            <button type="button" className="icon-action-btn" aria-label="Limpar selecao" onClick={resetSelection}>
              <X size={17} />
            </button>
          </div>
        </section>
      )}

      <ListFilterDrawer
        open={showFilters}
        dataTestId="interesses-filter-drawer"
        subtitle="Mantenha a grade focada na descricao e use filtros quando precisar refinar."
        closeButton={<button type="button" className="icon-action-btn" aria-label="Fechar filtros" onClick={() => setShowFilters(false)}><span aria-hidden="true">←</span></button>}
        searchId="interesses-drawer-search"
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
        showInlineActiveChips={false}
      />

      <section>
        {loading ? <div>Carregando...</div> : (
          <div className={`relationship-workspace ${panelMode ? 'has-detail' : ''} ${detailExpanded ? 'detail-expanded' : ''}`}>
            <div className="relationship-list-column">
              {error && (
                <section className="card error-message">
                  <strong>Erro:</strong> {error}
                </section>
              )}

              <div className="card relationship-list-card">
                <div className="relationship-list-header">
                  <button type="button" className="sort-btn" onClick={() => toggleSort('descricao')}>
                    Ordenar por descricao <span className="sort-indicator">{sortIndicator('descricao')}</span>
                  </button>
                  <span className="muted">{total} registro(s)</span>
                </div>

                <div className="relationship-card-grid" data-testid="interesses-card-list">
                  {items.length > 0 ? items.map((item) => {
                    const isActive = item.IdInteresse === activeItemId;
                    return (
                      <article key={item.IdInteresse} className={`relationship-card ${isActive ? 'is-active' : ''}`} data-testid={`interesse-card-${item.IdInteresse}`}>
                           {showSelection ? (
                            <label className="selection-card-control" aria-label={`Selecionar interesse ${item.Descricao}`}>
                              <input type="checkbox" checked={selectedIds.includes(item.IdInteresse)} onChange={(event) => handleSelectionChange(event, item.IdInteresse)} />
                            </label>
                          ) : null}
                        <button
                          type="button"
                          className="relationship-card-main"
                          aria-label={`Editar interesse ${item.Descricao}`}
                          onClick={() => openEdit(item)}
                        >
                          
                          <strong>{item.Descricao}</strong>
                          <span>{item.ativo !== false ? 'Ativo' : 'Inativo'}</span>
                        </button>

                        <div className="relationship-card-actions">
                          <button
                            type="button"
                            className="icon-action-btn"
                            aria-label={`Editar interesse ${item.Descricao}`}
                            onClick={() => openEdit(item)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-action-btn danger"
                            aria-label={`Apagar interesse ${item.Descricao}`}
                            onClick={() => handleDelete(item.IdInteresse)}
                          >
                            <Trash2 size={14} />
                          </button>
                       
                        </div>
                      </article>
                    );
                  }) : (
                    <div className="muted">Nenhum interesse encontrado.</div>
                  )}
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

            {panelMode ? (
              <aside className="card relationship-detail-column" data-testid="interesse-detail-pane">
                <div className="relationship-detail-toolbar">
                  <button
                    type="button"
                    className="icon-action-btn danger"
                    aria-label="Remover interesse"
                    onClick={() => editingItem && handleDelete(editingItem.IdInteresse)}
                    disabled={!editingItem || panelMode === 'create'}
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-action-btn"
                    title="Prev"
                    aria-label="Registro anterior"
                    onClick={() => navigateRecord(-1)}
                    disabled={!hasPrev || panelMode === 'create'}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-action-btn"
                    title="Next"
                    aria-label="Proximo registro"
                    onClick={() => navigateRecord(1)}
                    disabled={!hasNext || panelMode === 'create'}
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-action-btn"
                    aria-label={detailExpanded ? 'Retrair painel' : 'Expandir painel'}
                    onClick={() => setDetailExpanded((previous) => !previous)}
                  >
                    {detailExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                  <button type="button" className="icon-action-btn" aria-label="Fechar detalhe" onClick={closePanel}>
                    <X size={16} />
                  </button>
                </div>

                <div className="relationship-breadcrumb-row">
                  <button type="button" className="entity-breadcrumb-link" aria-label="Voltar para lista de interesses" onClick={closePanel}>Interesses</button>
                  <span className="entity-breadcrumb-separator">›</span>
                  <span className="entity-breadcrumb-current" data-testid="interesse-breadcrumb-current">
                    {panelMode === 'create' ? 'Novo Interesse' : `Interesse: ${editingItem?.Descricao || ''}`}
                  </span>
                </div>

                <form onSubmit={panelMode === 'edit' ? handleUpdate : handleCreate} noValidate className="relationship-form-stack">
                  <section className="related-section-block">
                    <div className="related-section-header">
                      <strong>Atributos</strong>
                    </div>
                    <div className="form-row">
                      <div className="field">
                        <label className="field-label-required">Descricao</label>
                        <input
                          className="input"
                          required
                          value={panelMode === 'edit' ? editingItem?.Descricao || '' : newItem.Descricao}
                          onChange={(event) => {
                            if (panelMode === 'edit') {
                              updateEditingItem('Descricao', event.target.value);
                              return;
                            }
                            setNewItem({ ...newItem, Descricao: event.target.value });
                          }}
                        />
                      </div>
                    </div>

                    {panelMode === 'edit' && (
                      <DeleteBehaviorField
                        resourcePath="/interesses"
                        entityId={editingItem?.IdInteresse}
                        active={editingItem?.ativo ?? true}
                        onActiveChange={(value) => updateEditingItem('ativo', value)}
                        onDelete={(capability) => handleDelete(editingItem.IdInteresse, capability)}
                      />
                    )}

                    <div className="toolbar" style={{ marginTop: 8 }}>
                      <button className="btn" type="submit">Salvar</button>
                      <button className="btn ghost" type="button" onClick={closePanel}>Cancelar</button>
                    </div>
                  </section>

                  {panelMode === 'edit' && (
                    <section className="related-section-block">
                      <div className="related-section-header">
                        <strong>Interesses relacionados</strong>
                      </div>

                      {loadingRelated ? <p className="muted">Carregando relacionamentos...</p> : null}
                      {!loadingRelated && relatedLinks.length === 0 ? <p className="muted">Nenhum relacionamento encontrado.</p> : null}

                      {!loadingRelated && relatedLinks.length > 0 ? (
                        <div className="cell-list">
                          {relatedLinks.map((link) => (
                            <span key={link.IdAlunoInteresse || `${link.IdAluno}-${link.IdInteresse}`} className="cell-tag">
                              {link.NomeAluno || link.IdAluno || 'Aluno'}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  )}
                </form>
              </aside>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
