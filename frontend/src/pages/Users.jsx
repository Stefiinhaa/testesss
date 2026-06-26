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
import { queueOfflineWrite, writeOfflineSnapshot } from '../utils/offlineManager';
import { getSessionUserId } from '../utils/sessionStore';
import { normalizePagedResponse } from '../utils/pagedResponse';


const FILTER_DEFS = [
  { key: 'login', label: 'E-mail', param: 'login_in' },
  { key: 'perfil', label: 'Perfil', param: 'perfil_in' },
  { key: 'id_aluno', label: 'IdAluno', param: 'id_aluno_in' },
  { key: 'ativo', label: 'Status', param: 'ativo_in' },
];

const FILTER_DEF_MAP = FILTER_DEFS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

const buildUserFilterOptions = (rows) => ({
  login: Array.from(new Set(rows.map((row) => String(row.login || '').trim()).filter(Boolean))).sort(),
  perfil: Array.from(new Set(rows.map((row) => String(row.perfil || '').trim()).filter(Boolean))).sort(),
  id_aluno: Array.from(new Set(rows.map((row) => String(row.id_aluno || '').trim()).filter(Boolean))).sort(),
  ativo: Array.from(new Set(rows.map((row) => (row.ativo !== false ? 'Ativo' : 'Inativo')))).sort(),
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

export default function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('id');
  const [sortDir, setSortDir] = useState('asc');
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterField, setSelectedFilterField] = useState(FILTER_DEFS[0].key);
  const [selectedFilterValue, setSelectedFilterValue] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [showInativos, setShowInativos] = useState(false);
  const [showSelection, setShowSelection] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUser, setNewUser] = useState({ login: '', senha: '', perfil: 'aluno', id_aluno: '' });
  const [panelMode, setPanelMode] = useState(null); // 'create' | 'edit' | null
  const [detailsEditable, setDetailsEditable] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingBaseline, setEditingBaseline] = useState(null);
  const [alunosList, setAlunosList] = useState([]);
  const [loadingAlunos, setLoadingAlunos] = useState(false);

  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  const fetchUsers = async (
    pageToFetch = page,
    perPage = pageSize,
    q = query,
    sortField = sortBy,
    sortDirection = sortDir,
    filters = activeFilters,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const filterParams = buildFilterParams(filters, FILTER_DEF_MAP);

      const params = {
        include_inativos: showInativos,
        page: pageToFetch,
        per_page: perPage,
        sort_by: sortField,
        sort_dir: sortDirection,
        ...filterParams,
      };
      
      // Only add q parameter if it has value
      if (q && q.trim()) {
        params.q = q.trim();
      }

      console.log('Fetching users with params:', params);
      const resp = await api.get('/usuarios/', { params });
      const normalized = normalizePagedResponse(resp.data, pageToFetch);
      console.log('Users received:', normalized.items?.length || 0, 'Total:', normalized.total);
      setUsers(normalized.items || []);
      setTotal(normalized.total || 0);
      setPage(normalized.page || pageToFetch);
      setError(null);
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
      setError('Erro ao buscar usuários.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const resp = await api.get('/usuarios/filter-options', { params: { include_inativos: showInativos } });
      const options = (resp.data || {}).options || {};
      setFilterOptions(mergeFilterOptions(buildUserFilterOptions(users), options));
    } catch (err) {
      setFilterOptions(buildUserFilterOptions(users));
    }
  };

  const openCurrentUser = async () => {
    try {
      const currentResponse = await api.get('/usuarios/me');
      const currentId = currentResponse.data?.id;
      if (!currentId) return;
      const userResponse = await api.get(`/usuarios/${currentId}`);
      startEdit(userResponse.data);
    } catch (err) {
      console.error(err);
      notify('Erro ao abrir o usuário logado', { duration: 3500 });
    } finally {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('editMe');
      setSearchParams(nextParams, { replace: true });
    }
  };

  useEffect(() => {
    fetchFilterOptions();
    fetchUsers(1, DEFAULT_PAGE_SIZE, query, sortBy, sortDir, activeFilters);
  }, []);

  useEffect(() => {
    if (searchParams.get('editMe') === '1') {
      openCurrentUser();
    }
  }, [searchParams]);

  useEffect(() => {
    fetchFilterOptions();
  }, [showInativos]);

  useEffect(() => {
    if (!users.length) return;
    setFilterOptions((previous) => mergeFilterOptions(previous, buildUserFilterOptions(users)));
  }, [users]);

  // refetch when query or page changes
  useEffect(() => {
    if (page) fetchUsers(page, pageSize, query, sortBy, sortDir, activeFilters);
  }, [page, pageSize, query, sortBy, sortDir, activeFilters, showInativos]);

  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const rangeStart = total ? ((page - 1) * pageSize) + 1 : 0;
  const rangeEnd = total ? Math.min(page * pageSize, total) : 0;

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

  const activeFilterChips = Object.entries(activeFilters).flatMap(([fieldKey, values]) => (
    (values || []).map((value) => ({
      fieldKey,
      value,
      label: FILTER_DEF_MAP[fieldKey]?.label || fieldKey,
    }))
  ));

  const selectableValues = filterOptions[selectedFilterField] || [];
  const isReadOnlyDetails = panelMode === 'edit' && !detailsEditable;
  const bulkCountLabel = `${selectedIds.length} selecionado(s)`;

  const resetForm = () => setNewUser({ login: '', senha: '', perfil: 'aluno', id_aluno: '' });
  const resetSelection = () => setSelectedIds([]);

  const fetchAlunosList = async () => {
    setLoadingAlunos(true);
    try {
      const response = await api.get('/alunos/', {
        params: {
          page: 1,
          per_page: 5000,
          include_inativos: true,
          sort_by: 'nome',
          sort_dir: 'asc',
        },
      });
      const normalized = normalizePagedResponse(response.data, 1);
      setAlunosList(normalized.items || []);
    } catch (err) {
      console.error('Erro ao buscar lista de alunos:', err);
      setAlunosList([]);
    } finally {
      setLoadingAlunos(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!validateFormInDomOrder({ form: e.currentTarget, notify })) return;
    try {
      const payload = { ...newUser };
      // Convert empty string to null for id_aluno
      if (!payload.id_aluno || payload.id_aluno.trim() === '') {
        payload.id_aluno = null;
      }
      if (payload.perfil !== 'aluno') payload.id_aluno = null;
      await api.post('/usuarios/cadastrar', payload);
      resetForm();
      setDetailsEditable(false);
      setPanelMode(null);
      fetchUsers(1, pageSize, query, sortBy, sortDir, activeFilters);
      fetchFilterOptions();
      notify('Usuário criado', { duration: 2500 });
    } catch (err) {
      console.error(err);
      alert('Erro ao criar usuário');
    }
  };

  const startEdit = (u) => {
    const normalizedUser = { id: u.id, login: u.login, perfil: u.perfil, ativo: u.ativo !== false && u.Ativo !== false, senha: '', id_aluno: u.id_aluno || '' };
    setEditingUser(normalizedUser);
    setEditingBaseline(normalizedUser);
    setDetailsEditable(true);
    setPanelMode('edit');
    if (normalizedUser.perfil === 'aluno') {
      fetchAlunosList();
    }
  };
  const cancelEdit = () => {
    setEditingUser(null);
    setEditingBaseline(null);
    setDetailsEditable(false);
    setPanelMode(null);
  };

  const startCreate = () => {
    resetForm();
    setEditingUser(null);
    setDetailsEditable(true);
    setPanelMode('create');
    fetchAlunosList();
  };

  const toggleSelection = (id) => {
    setSelectedIds((previous) => (previous.includes(id)
      ? previous.filter((value) => value !== id)
      : [...previous, id]));
  };

  const handleSelectionChange = (event, id) => {
    event.stopPropagation();
    toggleSelection(id);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!validateFormInDomOrder({ form: e.currentTarget, notify })) return;
    if (!editingUser) return;
    try {
      const payload = { login: editingUser.login, perfil: editingUser.perfil, ativo: editingUser.ativo };
      if (editingUser.senha) payload.senha = editingUser.senha;
      if (editingUser.perfil === 'aluno') payload.id_aluno = editingUser.id_aluno || null;
      await api.put(`/usuarios/${editingUser.id}`, payload);
      setEditingUser(null);
      setEditingBaseline(null);
      setDetailsEditable(false);
      setPanelMode(null);
      fetchUsers(page, pageSize, query, sortBy, sortDir, activeFilters);
      fetchFilterOptions();
      notify('Usuário atualizado', { duration: 2500 });
    } catch (err) {
      const isCurrentUser = String(getSessionUserId() || '') === String(editingUser.id || '');
      const changedRestrictedFields = !!editingBaseline && (
        editingUser.perfil !== editingBaseline.perfil
        || !!editingUser.ativo !== !!editingBaseline.ativo
        || String(editingUser.id_aluno || '') !== String(editingBaseline.id_aluno || '')
      );
      if (err?.code === 'OFFLINE_WRITE_BLOCKED' && isCurrentUser && !changedRestrictedFields) {
        const queued = queueOfflineWrite({
          url: '/usuarios/me',
          method: 'put',
          data: {
            login: editingUser.login,
            ...(editingUser.senha ? { senha: editingUser.senha } : {}),
          },
          label: 'Meu usuário',
        });
        writeOfflineSnapshot('/usuarios/me', { ...editingUser, senha: '' });
        setEditingUser({ ...editingUser, senha: '' });
        notify(`Alteração salva localmente às ${new Date(queued.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`, { duration: 3500 });
        return;
      }
      console.error(err);
      const message = err?.response?.data?.detail || 'Erro ao atualizar usuário';
      notify(message, { duration: 3500 });
    }
  };

  const inactivateUser = async (id) => api.delete(`/usuarios/${id}`);

  const handleDeleteUser = async (id, capability = null) => {
    const confirmationMessage = capability?.confirmation_message || 'Remover usuário?';
    if (!window.confirm(confirmationMessage)) return;
    try {
      const response = await inactivateUser(id);
      cancelEdit();
      fetchUsers(page, pageSize, query, sortBy, sortDir, activeFilters);
      fetchFilterOptions();
      notify(response?.data?.message || 'Usuário removido', { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || 'Erro ao remover usuário', { duration: 3500 });
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length || !window.confirm('Inativar usuários selecionados?')) return;
    try {
      // Inativar cada usuário sequencialmente para evitar conflitos
      let successCount = 0;
      let failCount = 0;
      
      for (const id of selectedIds) {
        try {
          await inactivateUser(id);
          successCount++;
        } catch (err) {
          console.error(`Erro ao inativar usuário ${id}:`, err);
          failCount++;
        }
      }
      
      if (failCount > 0) {
        notify(`Erro ao inativar ${failCount} de ${selectedIds.length} usuários`, { duration: 3500 });
      } else {
        notify(`${successCount} usuário(s) inativado(s)`, { duration: 2500 });
      }
      
      resetSelection();
      // Forçar recarregamento completo
      setPage(1);
      await fetchUsers(1, pageSize, query, sortBy, sortDir, activeFilters);
      await fetchFilterOptions();
    } catch (err) {
      console.error('Erro geral na exclusão em massa:', err);
      notify('Erro ao remover usuários', { duration: 3500 });
    }
  };

  return (
    <div className={`app-shell app-shell-tight entity-page ${showSelection ? 'selection-mode' : ''}`}>
      <EntityHeader
        breadcrumbs={[
          { label: 'Usuários' },
        ]}
        title="Cadastro de Usuários"
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
                  const checked = e.target.checked;
                  console.log('Checkbox inativos changed:', checked);
                  setShowInativos(checked);
                  setPage(1);
                  // Limpar filtros ativos para evitar conflitos
                  setActiveFilters({});
                }}
              />
              Inativos
            </label>

            <button type="button" className="icon-action-btn filter-toggle-btn" aria-label="Abrir filtros" onClick={() => setShowFilters((prev) => !prev)}>
              {showFilters ? <X size={17} /> : <ListFilter size={17} />}
            </button>
            <button type="button" className={`icon-action-btn selection-toggle-btn ${showSelection ? 'active' : ''}`} aria-label="Alternar seleção" onClick={() => { setShowSelection((previous) => { if (previous) resetSelection(); return !previous; }); }}>
              {showSelection ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
            </button>
            <button type="button" className="icon-action-btn entity-add-btn" aria-label="Adicionar usuário" onClick={startCreate}>
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
        dataTestId="users-filter-drawer"
        subtitle="Refine por perfil e status sem ocupar o topo da listagem."
        closeButton={<button type="button" className="icon-action-btn" aria-label="Fechar filtros" onClick={() => setShowFilters(false)}><span aria-hidden="true">←</span></button>}
        searchId="users-drawer-search"
        query={query}
        onQueryChange={(e) => { setQuery(e.target.value); setPage(1); }}
        filterDefs={FILTER_DEFS}
        filterOptions={filterOptions}
        activeFilters={activeFilters}
        onToggleFilterValue={(fieldKey, value) => {
          setActiveFilters((prev) => {
            const current = prev[fieldKey] || [];
            const next = { ...prev };
            if (current.includes(value)) {
              const updated = current.filter((item) => item !== value);
              if (updated.length) next[fieldKey] = updated;
              else delete next[fieldKey];
              return next;
            }
            return { ...next, [fieldKey]: [...current, value] };
          });
          setPage(1);
        }}
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
      />

      <section>
        {loading ? <div>Carregando...</div> : error ? (
          <div className="error-message card">
            <strong>Erro:</strong> {error}
          </div>
        ) : (
          <div className={`split-layout ${panelMode ? 'has-panel' : ''}`}>
            <div className="split-main">
              <div className="card table-card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="compact-table-select"></th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('nome_aluno')}>
                            Nome do Aluno <span className="sort-indicator">{sortIndicator('nome_aluno')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('login')}>
                            Login <span className="sort-indicator">{sortIndicator('login')}</span>
                          </button>
                        </th>
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('perfil')}>
                            Perfil <span className="sort-indicator">{sortIndicator('perfil')}</span>
                          </button>
                        </th>
                        
                        <th>
                          <button type="button" className="sort-btn" onClick={() => toggleSort('ativo')}>
                            Status <span className="sort-indicator">{sortIndicator('ativo')}</span>
                          </button>
                        </th>
                        <th className="sticky-actions">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id} className="data-row" onClick={() => startEdit(u)}>
                          <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                            <input type="checkbox" checked={selectedIds.includes(u.id)} onClick={(event) => event.stopPropagation()} onChange={(event) => handleSelectionChange(event, u.id)} />
                          </td>
                          <td>{u.nome_aluno || '-'}</td>
                          <td>{u.login}</td>
                          <td>{u.perfil}</td>
                          <td>{u.ativo !== false ? 'Ativo' : 'Inativo'}</td>
                         <td className="sticky-actions" onClick={(event) => event.stopPropagation()}>
                      <button 
                        type="button" 
                        className="icon-btn entity-edit-btn" 
                        aria-label="Detalhes" 
                        title="Detalhes" 
                        onClick={() => startEdit(u)} 
                      />
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
                    <h3>{panelMode === 'edit' ? (detailsEditable ? 'Editar Usuário' : 'Detalhes do Usuário') : 'Novo Usuário'}</h3>
                    <div className="panel-header-actions">
                      {panelMode === 'edit' && (
                        <button className="btn ghost" type="button" onClick={() => setDetailsEditable((prev) => !prev)}>
                          {detailsEditable ? 'Somente leitura' : 'Editar'}
                        </button>
                      )}
                      <button className="btn ghost" type="button" onClick={cancelEdit}>Fechar</button>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="field">
                      <label>E-mail</label>
                      <input
                        className="input"
                        required
                        value={panelMode === 'edit' ? editingUser.login : newUser.login}
                        disabled={isReadOnlyDetails}
                        onChange={e => panelMode === 'edit'
                          ? setEditingUser({ ...editingUser, login: e.target.value })
                          : setNewUser({ ...newUser, login: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Senha</label>
                      <input
                        className="input"
                        placeholder={panelMode === 'edit' ? 'Senha (deixe em branco para manter)' : 'Senha'}
                        required={panelMode !== 'edit'}
                        value={panelMode === 'edit' ? editingUser.senha : newUser.senha}
                        disabled={isReadOnlyDetails}
                        onChange={e => panelMode === 'edit'
                          ? setEditingUser({ ...editingUser, senha: e.target.value })
                          : setNewUser({ ...newUser, senha: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Perfil</label>
                      <select
                        className="select"
                        value={panelMode === 'edit' ? editingUser.perfil : newUser.perfil}
                        disabled={isReadOnlyDetails}
                        onChange={e => panelMode === 'edit'
                          ? setEditingUser({ ...editingUser, perfil: e.target.value })
                          : setNewUser({ ...newUser, perfil: e.target.value })}
                      >
                        <option value="aluno">aluno</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>
                    {(panelMode === 'edit' ? editingUser.perfil : newUser.perfil) === 'aluno' && (
                      <div className="field">
                        <label>Aluno</label>
                        <select
                          className="select"
                          required={panelMode !== 'edit'}
                          value={panelMode === 'edit' ? editingUser.id_aluno : newUser.id_aluno}
                          disabled={isReadOnlyDetails || loadingAlunos}
                          onChange={e => panelMode === 'edit'
                            ? setEditingUser({ ...editingUser, id_aluno: e.target.value })
                            : setNewUser({ ...newUser, id_aluno: e.target.value })}
                        >
                          <option value="">{loadingAlunos ? 'Carregando alunos...' : 'Selecione um aluno'}</option>
                          {alunosList.map(aluno => (
                            <option key={aluno.id_aluno || aluno.IdAluno} value={aluno.id_aluno || aluno.IdAluno}>
                              {aluno.nome || aluno.NomeAluno} 
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {panelMode === 'edit' && (
                      <DeleteBehaviorField
                        resourcePath="/usuarios"
                        entityId={editingUser?.id}
                        active={!!editingUser?.ativo}
                        disabled={isReadOnlyDetails}
                        onActiveChange={(value) => setEditingUser({ ...editingUser, ativo: value })}
                        onDelete={(capability) => handleDeleteUser(editingUser.id, capability)}
                      />
                    )}
                  </div>
                  <div className="toolbar" style={{ marginTop: 8 }}>
                    {!isReadOnlyDetails && <button className="btn" type="submit">Salvar</button>}
                    {panelMode === 'edit' && <DeleteBehaviorField placement="toolbar" resourcePath="/usuarios" entityId={editingUser?.id} active={!!editingUser?.ativo} disabled={isReadOnlyDetails} onActiveChange={(value) => setEditingUser({ ...editingUser, ativo: value })} onDelete={(capability) => handleDeleteUser(editingUser.id, capability)} />}
                    <button className="btn ghost" type="button" onClick={cancelEdit}>{isReadOnlyDetails ? 'Fechar' : 'Cancelar'}</button>
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