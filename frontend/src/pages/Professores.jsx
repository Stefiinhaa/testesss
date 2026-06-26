import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ListFilter, Plus, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import api from '../api/apiConfig';
import DeleteBehaviorField from '../components/DeleteBehaviorField';
import EntityHeader from '../components/EntityHeader';
import ListFilterDrawer from '../components/ListFilterDrawer';
import ListPagination, { DEFAULT_PAGE_SIZE } from '../components/ListPagination';
import notify from '../utils/notify';
import { buildFilterParams } from '../utils/filterParams';
import { validateFormInDomOrder } from '../utils/formValidation';
import { buildLocalPhone, buildWhatsAppHref, digitsOnly, formatPhoneBR, parsePhoneParts } from '../utils/formatters';
import { resolveProfessorImageUrl } from '../utils/media';
import { DIAL_CODE_OPTIONS } from '../utils/dialCodes';

const FILTER_DEFS = [
  { key: 'nome', label: 'Nome', param: 'nome_in' },
  { key: 'email', label: 'E-mail', param: 'email_in' },
  { key: 'telefone', label: 'Telefone', param: 'telefone_in' },
  { key: 'ativo', label: 'Status', param: 'ativo_in' },
  { key: 'whatsapp', label: 'WhatsApp', param: 'whatsapp_in' },
  { key: 'endereco', label: 'Endereço', param: 'endereco_in' },
  { key: 'foto', label: 'Foto', param: 'foto_in' },
];

const FILTER_DEF_MAP = FILTER_DEFS.reduce((accumulator, item) => {
  accumulator[item.key] = item;
  return accumulator;
}, {});

const createEmptyProfessor = () => ({
  id_professor: '',
  nome: '',
  email: '',
  telefone: '',
  telefone_ddi: '55',
  telefone_ddd: '',
  telefone_numero: '',
  whatsapp: false,
  endereco: '',
  foto: '',
  ativo: true,
});

const getProfessorInitials = (name) => {
  if (!name) return 'P';
  const parts = String(name).trim().split(' ').filter(Boolean);
  if (!parts.length) return 'P';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
};

const sanitizePersistedMediaValue = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.startsWith('data:')) return null;
  return normalized;
};

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

// Adicionado o normalizador de status
const normalizeAtivoValue = (value) => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return !['false', '0', 'nao', 'não', 'inativo'].includes(normalized);
  }
  return value !== false && value !== 0;
};

const normalizeLegacyProfessorRow = (row) => {
  const phoneParts = parsePhoneParts(row.telefone || row.Telefone || '', row.telefone_ddi || row.TelefoneDDI || '55');
  return {
    id_professor: row.id_professor || row.IdProfessor || '',
    nome: row.nome || row.NomeProfessor || '',
    email: row.email || row.EmailProfessor || '',
    telefone: row.telefone || row.Telefone || '',
    telefone_ddi: row.telefone_ddi || row.TelefoneDDI || phoneParts.ddi,
    telefone_ddd: row.telefone_ddd || row.TelefoneDDD || phoneParts.ddd,
    telefone_numero: row.telefone_numero || row.TelefoneNumero || phoneParts.number,
    whatsapp: Boolean(row.whatsapp ?? row.WhatsApp),
    endereco: row.endereco || row.Endereco || '',
    foto: sanitizePersistedMediaValue(row.foto || row.Foto) || '',
    ativo: normalizeAtivoValue(row.ativo ?? row.Ativo),
  };
};

const buildProfessorFilterOptions = (rows) => ({
  nome: Array.from(new Set(rows.map((row) => String(row.nome || '').trim()).filter(Boolean))).sort(),
  email: Array.from(new Set(rows.map((row) => String(row.email || '').trim()).filter(Boolean))).sort(),
  telefone: Array.from(new Set(rows.map((row) => String(row.telefone || '').trim()).filter(Boolean))).sort(),
  ativo: Array.from(new Set(rows.map((row) => (row.ativo !== false ? 'Ativo' : 'Inativo')))).sort(),
  whatsapp: Array.from(new Set(rows.map((row) => (row.whatsapp ? 'Sim' : 'Não')))).sort(),
  endereco: Array.from(new Set(rows.map((row) => String(row.endereco || '').trim()).filter(Boolean))).sort(),
  foto: Array.from(new Set(rows.map((row) => (row.foto ? 'Com foto' : 'Sem foto')))).sort(),
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

export default function ProfessoresPage() {
  const photoInputRef = useRef(null);
  const pendingPhotoPreviewRef = useRef(null);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('nome');
  const [sortDir, setSortDir] = useState('asc');
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterField, setSelectedFilterField] = useState(FILTER_DEFS[0].key);
  const [selectedFilterValue, setSelectedFilterValue] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [showInativos, setShowInativos] = useState(false);
  const [showSelection, setShowSelection] = useState(false);
  const [panelMode, setPanelMode] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [newItem, setNewItem] = useState(createEmptyProfessor());
  const [selectedIds, setSelectedIds] = useState([]);
  const [pendingPhotoFile, setPendingPhotoFile] = useState(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState('');
  const [brokenMediaUrls, setBrokenMediaUrls] = useState({});

  const currentProfessor = panelMode === 'edit' ? (editingItem || createEmptyProfessor()) : newItem;
  const currentPhotoPreview = pendingPhotoPreview || resolveProfessorImageUrl(currentProfessor.foto);
  const hasProfessorPhoto = Boolean(currentPhotoPreview || currentProfessor.foto || pendingPhotoFile);
  const photoActionLabel = hasProfessorPhoto ? 'Trocar foto' : 'Nova foto';

  const markMediaUrlAsBroken = (url) => {
    if (!url) return;
    setBrokenMediaUrls((previous) => (previous[url] ? previous : { ...previous, [url]: true }));
  };

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

      const response = await api.get('/professores/', {
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
      const normalized = normalizePagedResponse(response.data, pageToFetch);
      setItems(normalized.items.map((item) => normalizeLegacyProfessorRow(item)));
      setTotal(normalized.total);
      setPage(normalized.page);
    } catch (error) {
      try {
        const fallbackResponse = await api.get('/academico/professores');
        const normalized = normalizePagedResponse(fallbackResponse.data, pageToFetch);
        const fallbackItems = normalized.items.map((item) => normalizeLegacyProfessorRow(item));
        setItems(fallbackItems);
        setTotal(normalized.total || fallbackItems.length);
        setPage(normalized.page);
      } catch (fallbackError) {
        console.error(fallbackError);
        setItems([]);
        setTotal(0);
        notify('Erro ao buscar professores', { duration: 3000 });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const response = await api.get('/professores/filter-options', { params: { include_inativos: showInativos } });
      const options = (response.data || {}).options || {};
      if (Object.keys(options).length) {
        setFilterOptions(mergeFilterOptions(buildProfessorFilterOptions(items), options));
        return;
      }
      setFilterOptions(buildProfessorFilterOptions(items));
    } catch (error) {
      try {
        const fallbackResponse = await api.get('/academico/professores');
        const fallbackItems = normalizePagedResponse(fallbackResponse.data).items.map((item) => normalizeLegacyProfessorRow(item));
        setFilterOptions(buildProfessorFilterOptions(fallbackItems));
      } catch (fallbackError) {
        console.error(fallbackError);
        setFilterOptions(buildProfessorFilterOptions(items));
      }
    }
  };

  useEffect(() => {
    fetchFilterOptions();
    fetchItems(1, DEFAULT_PAGE_SIZE, '', {}, sortBy, sortDir);
  }, []);

  useEffect(() => () => {
    if (pendingPhotoPreviewRef.current) {
      URL.revokeObjectURL(pendingPhotoPreviewRef.current);
      pendingPhotoPreviewRef.current = null;
    }
  }, []);

  useEffect(() => {
    fetchFilterOptions();
  }, [showInativos]);

  useEffect(() => {
    if (!items.length) return;
    setFilterOptions((previous) => mergeFilterOptions(previous, buildProfessorFilterOptions(items)));
  }, [items]);

  useEffect(() => {
    if (page) fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
  }, [page, pageSize, query, activeFilters, sortBy, sortDir, showInativos]);

  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const rangeStart = total ? ((page - 1) * pageSize) + 1 : 0;
  const rangeEnd = total ? Math.min(page * pageSize, total) : 0;

  const activeFilterChips = Object.entries(activeFilters).flatMap(([fieldKey, values]) => (
    (values || []).map((value) => ({ fieldKey, value, label: FILTER_DEF_MAP[fieldKey]?.label || fieldKey }))
  ));

  const selectableValues = filterOptions[selectedFilterField] || [];
  const activeFilterCount = activeFilterChips.length;

  const bulkCountLabel = useMemo(() => `${selectedIds.length} selecionado(s)`, [selectedIds]);

  const resetSelection = () => setSelectedIds([]);

  const toggleSelection = (id) => {
    setSelectedIds((previous) => (
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id]
    ));
  };

  const handleSelectionChange = (event, id) => {
    event.stopPropagation();
    toggleSelection(id);
  };

  const startCreate = () => {
    setEditingItem(null);
    setNewItem(createEmptyProfessor());
    setPanelMode('create');
  };

  const startEdit = (item) => {
    setEditingItem({
      ...createEmptyProfessor(),
      ...item,
      whatsapp: Boolean(item.whatsapp ?? item.WhatsApp),
      ativo: item.ativo !== false,
    });
    setPanelMode('edit');
  };

  const closePanel = () => {
    setEditingItem(null);
    setPanelMode(null);
    if (pendingPhotoPreviewRef.current) {
      URL.revokeObjectURL(pendingPhotoPreviewRef.current);
      pendingPhotoPreviewRef.current = null;
    }
    setPendingPhotoFile(null);
    setPendingPhotoPreview('');
  };

  const updateDraft = (field, value) => {
    const normalizeProfessorDraft = (draft) => {
      const nextDraft = { ...draft };
      nextDraft.telefone_ddi = digitsOnly(nextDraft.telefone_ddi).slice(0, 4);
      nextDraft.telefone_ddd = digitsOnly(nextDraft.telefone_ddd).slice(0, 4);
      nextDraft.telefone_numero = digitsOnly(nextDraft.telefone_numero).slice(0, 12);
      nextDraft.telefone = buildLocalPhone({ ddd: nextDraft.telefone_ddd, number: nextDraft.telefone_numero });
      return nextDraft;
    };

    if (panelMode === 'edit') {
      setEditingItem((previous) => normalizeProfessorDraft({ ...(previous || createEmptyProfessor()), [field]: value }));
      return;
    }
    setNewItem((previous) => normalizeProfessorDraft({ ...previous, [field]: value }));
  };

  const clearPhotoSelection = () => {
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = () => {
    updateDraft('foto', '');
    if (pendingPhotoPreviewRef.current) {
      URL.revokeObjectURL(pendingPhotoPreviewRef.current);
      pendingPhotoPreviewRef.current = null;
    }
    setPendingPhotoFile(null);
    setPendingPhotoPreview('');
    clearPhotoSelection();
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      clearPhotoSelection();
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    if (panelMode !== 'edit' || !currentProfessor.id_professor) {
      if (pendingPhotoPreviewRef.current) {
        URL.revokeObjectURL(pendingPhotoPreviewRef.current);
      }
      pendingPhotoPreviewRef.current = previewUrl;
      setPendingPhotoFile(file);
      setPendingPhotoPreview(previewUrl);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (pendingPhotoPreviewRef.current) {
      URL.revokeObjectURL(pendingPhotoPreviewRef.current);
    }
    pendingPhotoPreviewRef.current = previewUrl;
    setPendingPhotoFile(file);
    setPendingPhotoPreview(previewUrl);
    try {
      const response = await api.post(`/professores/${currentProfessor.id_professor}/imagem`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (pendingPhotoPreviewRef.current) {
        URL.revokeObjectURL(pendingPhotoPreviewRef.current);
        pendingPhotoPreviewRef.current = null;
      }
      setPendingPhotoFile(null);
      setPendingPhotoPreview('');
      updateDraft('foto', response.data.url);
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
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
      clearPhotoSelection();
      return;
    }
    URL.revokeObjectURL(previewUrl);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!validateFormInDomOrder({ form: event.currentTarget, notify })) return;
    try {
      const response = await api.post('/professores/', {
        IdProfessor: newItem.id_professor || undefined,
        NomeProfessor: newItem.nome,
        EmailProfessor: newItem.email,
        Telefone: newItem.telefone || null,
        TelefoneDDI: newItem.telefone_ddi || null,
        TelefoneDDD: newItem.telefone_ddd || null,
        TelefoneNumero: newItem.telefone_numero || null,
        WhatsApp: !!newItem.whatsapp,
        Endereco: newItem.endereco || null,
        Foto: pendingPhotoFile ? null : sanitizePersistedMediaValue(newItem.foto),
        Ativo: !!newItem.ativo,
      });
      const createdProfessorId = response.data?.id_professor || response.data?.IdProfessor || response.data?.id;
      if (pendingPhotoFile && createdProfessorId) {
        try {
          const formData = new FormData();
          formData.append('file', pendingPhotoFile);
          await api.post(`/professores/${createdProfessorId}/imagem`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (uploadError) {
          console.error(uploadError);
        }
      }
      notify('Professor criado', { duration: 2500 });
      setNewItem(createEmptyProfessor());
      closePanel();
      fetchItems(1, pageSize, query, activeFilters, sortBy, sortDir);
      fetchFilterOptions();
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao criar professor', { duration: 3500 });
    }
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!validateFormInDomOrder({ form: event.currentTarget, notify })) return;
    if (!editingItem) return;
    try {
      await api.put(`/professores/${editingItem.id_professor}`, {
        NomeProfessor: editingItem.nome,
        EmailProfessor: editingItem.email,
        Telefone: editingItem.telefone || null,
        TelefoneDDI: editingItem.telefone_ddi || null,
        TelefoneDDD: editingItem.telefone_ddd || null,
        TelefoneNumero: editingItem.telefone_numero || null,
        WhatsApp: !!editingItem.whatsapp,
        Endereco: editingItem.endereco || null,
        Foto: sanitizePersistedMediaValue(editingItem.foto),
        Ativo: !!editingItem.ativo,
      });
      if (pendingPhotoFile) {
        try {
          const formData = new FormData();
          formData.append('file', pendingPhotoFile);
          await api.post(`/professores/${editingItem.id_professor}/imagem`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (uploadError) {
          console.error(uploadError);
          notify('Dados salvos, mas houve erro ao enviar a foto.', { duration: 3500 });
        }
      }
      notify('Professor atualizado', { duration: 2500 });
      closePanel();
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
      fetchFilterOptions();
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao atualizar professor', { duration: 3500 });
    }
  };

  const inactivateProfessor = async (id) => api.delete(`/professores/${id}`);

  const handleDeleteProfessor = async (id, capability = null) => {
    const confirmationMessage = capability?.confirmation_message || 'Remover professor?';
    if (!window.confirm(confirmationMessage)) return;
    try {
      const response = await inactivateProfessor(id);
      closePanel();
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
      fetchFilterOptions();
      notify(response?.data?.message || 'Professor removido', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify(error?.response?.data?.detail || 'Erro ao remover professor', { duration: 3500 });
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length || !window.confirm('Inativar professores selecionados?')) return;
    try {
      await Promise.all(selectedIds.map((id) => inactivateProfessor(id)));
      resetSelection();
      fetchItems(page, pageSize, query, activeFilters, sortBy, sortDir);
      fetchFilterOptions();
      notify('Professores inativados', { duration: 2500 });
    } catch (error) {
      console.error(error);
      notify('Erro ao inativar professores', { duration: 3500 });
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
          { label: 'Professores' },
        ]}
        title="Professores"
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

          <button type="button" className="icon-action-btn filter-toggle-btn" aria-label="Abrir filtros" onClick={() => setShowFilters((previous) => !previous)}>
            {showFilters ? <X size={17} /> : <ListFilter size={17} />}
          </button>
          <button type="button" className={`icon-action-btn selection-toggle-btn ${showSelection ? 'active' : ''}`} aria-label="Alternar seleção" onClick={() => { setShowSelection((previous) => { if (previous) resetSelection(); return !previous; }); }}>
            {showSelection ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
          </button>
          <button type="button" className="icon-action-btn entity-add-btn" aria-label="Adicionar professor" onClick={startCreate}>
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
            <button type="button" className="icon-action-btn danger" aria-label="Inativar selecionados" onClick={handleBulkDelete}>
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
        dataTestId="professores-filter-drawer"
        subtitle="Filtre por campos do formulário sem ocupar o topo da listagem."
        closeButton={<button type="button" className="icon-action-btn" aria-label="Fechar filtros" onClick={() => setShowFilters(false)}><span aria-hidden="true">←</span></button>}
        searchId="professores-drawer-search"
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
                <div className="dashboard-grid" style={{ marginBottom: '12px' }}>
                  {items.map((item) => {
                    const selected = selectedIds.includes(item.id_professor);
                    return (
                      <div className="card professor-card is-clickable" key={item.id_professor} onClick={() => startEdit(item)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                          <label className="selection-card-control" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }} onClick={(event) => event.stopPropagation()}>
                            <input type="checkbox" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => handleSelectionChange(event, item.id_professor)} />
                            <span className="table-secondary-text">Selecionar</span>
                          </label>
                          <button className="icon-btn entity-edit-btn" type="button" aria-label="Editar professor" onClick={(event) => { event.stopPropagation(); startEdit(item); }}>
                            <span aria-hidden="true">&gt;</span>
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                          {(() => {
                            const photoUrl = resolveProfessorImageUrl(item.foto);
                            if (!photoUrl || brokenMediaUrls[photoUrl]) {
                              return (
                                <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 'bold' }}>
                                  {getProfessorInitials(item.nome)}
                                </div>
                              );
                            }
                            return <img src={photoUrl} alt={`Foto de ${item.nome || 'professor'}`} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary-color)' }} onError={() => markMediaUrlAsBroken(photoUrl)} />;
                          })()}
                          <div style={{ textAlign: 'center' }}>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem' }}>{item.nome}</h3>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem', wordBreak: 'break-word' }}>{item.email || item.telefone || 'Sem contato principal'}</p>
                            {item.telefone && <p className="table-secondary-text" style={{ margin: '4px 0 0 0', textAlign: 'center' }}>{formatPhoneBR(item.telefone)}</p>}
                            <p className="table-secondary-text" style={{ margin: '6px 0 0 0', textAlign: 'center' }}>{item.ativo !== false ? 'Ativo' : 'Inativo'}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                    <h3>{panelMode === 'edit' ? 'Detalhes do Professor' : 'Novo Professor'}</h3>
                    <div className="panel-header-actions">
                      <button className="btn ghost" type="button" onClick={closePanel}>Fechar</button>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="field">
                      <label className="field-label-required">Nome</label>
                      <input className="input" required value={currentProfessor.nome} onChange={(event) => updateDraft('nome', event.target.value)} />
                    </div>

                    <div className="field">
                      <label className="field-label-required">E-mail</label>
                      <input className="input" type="email" required value={currentProfessor.email} onChange={(event) => updateDraft('email', event.target.value)} />
                    </div>

                    <div className="field">
                      <label className="field-label-required">Telefone</label>
                      <div className="form-row">
                        <div className="field">
                          <label>DDI</label>
                          <select className="select" value={currentProfessor.telefone_ddi || '55'} onChange={(event) => updateDraft('telefone_ddi', event.target.value)}>
                            {DIAL_CODE_OPTIONS.map((option) => <option key={`${option.code}-${option.dialCode}`} value={option.dialCode}>{option.label}</option>)}
                          </select>
                        </div>
                        <div className="field">
                          <label className="field-label-required">DDD</label>
                          <input className="input" required value={currentProfessor.telefone_ddd || ''} onChange={(event) => updateDraft('telefone_ddd', event.target.value)} />
                        </div>
                        <div className="field">
                          <label className="field-label-required">Número do telefone</label>
                          <div className="contact-inline">
                            <input className="input" required value={currentProfessor.telefone_numero || ''} onChange={(event) => updateDraft('telefone_numero', event.target.value)} />
                            {currentProfessor.whatsapp && currentProfessor.telefone && (
                              <a className="btn ghost" href={buildWhatsAppHref({ ddi: currentProfessor.telefone_ddi, ddd: currentProfessor.telefone_ddd, number: currentProfessor.telefone_numero })} target="_blank" rel="noreferrer">WhatsApp</a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <label className="field checkbox">
                      <span>Telefone tem WhatsApp</span>
                      <input type="checkbox" checked={!!currentProfessor.whatsapp} onChange={(event) => updateDraft('whatsapp', event.target.checked)} />
                    </label>

                    <div className="field">
                      <label>Endereço</label>
                      <input className="input" value={currentProfessor.endereco || ''} onChange={(event) => updateDraft('endereco', event.target.value)} />
                    </div>

                    <div className="field">
                      <label>Foto</label>
                      <div className="professor-photo-card">
                        <div className="professor-photo-stage">
                          <div className="aluno-image-preview professor-photo-preview" data-testid="professor-photo-preview">
                            {currentPhotoPreview && !brokenMediaUrls[currentPhotoPreview] ? (
                              <img src={currentPhotoPreview} alt={`Foto de ${currentProfessor.nome || 'professor'}`} onError={() => markMediaUrlAsBroken(currentPhotoPreview)} />
                            ) : (
                              <span>{getProfessorInitials(currentProfessor.nome)}</span>
                            )}
                          </div>
                          <div className="professor-photo-copy">
                            <strong>Foto do professor</strong>
                            <span>{panelMode === 'edit' ? 'Capture ou troque a foto com envio imediato.' : 'Escolha a foto agora e o envio será feito ao salvar o cadastro.'}</span>
                          </div>
                        </div>
                        <div className="upload-field-row professor-photo-actions">
                          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="upload-field-input" id="professor-photo-upload" />
                          <button type="button" className="btn upload-field-trigger professor-photo-primary-action media-action-btn" onClick={() => photoInputRef.current?.click()}>
                            <Camera size={16} />
                            <span>{photoActionLabel}</span>
                          </button>
                          <button type="button" className="btn ghost" onClick={handleRemovePhoto} disabled={!hasProfessorPhoto}>Remover foto</button>
                        </div>
                        {pendingPhotoFile ? <span className="helper-text">Arquivo selecionado: {pendingPhotoFile.name}</span> : null}
                        <span className="helper-text">O fluxo segue o padrão App Sheet: foto em destaque, ação de câmera e troca rápida sem campo manual de URL.</span>
                      </div>
                    </div>

                    {panelMode === 'edit' && (
                      <DeleteBehaviorField
                        resourcePath="/professores"
                        entityId={currentProfessor.id_professor}
                        active={!!currentProfessor.ativo}
                        onActiveChange={(value) => updateDraft('ativo', value)}
                        onDelete={(capability) => handleDeleteProfessor(currentProfessor.id_professor, capability)}
                      />
                    )}

                    {panelMode === 'edit' && currentProfessor.email && (
                      <div className="field">
                        <label>Contato principal</label>
                        <div className="record-meta">
                          <strong>{currentProfessor.email}</strong>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="toolbar" style={{ marginTop: 8 }}>
                    <button className="btn" type="submit">Salvar</button>
                    {panelMode === 'edit' && <DeleteBehaviorField placement="toolbar" resourcePath="/professores" entityId={currentProfessor.id_professor} active={!!currentProfessor.ativo} onActiveChange={(value) => updateDraft('ativo', value)} onDelete={(capability) => handleDeleteProfessor(currentProfessor.id_professor, capability)} />}
                    <button className="btn ghost" type="button" onClick={closePanel}>Cancelar</button>
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