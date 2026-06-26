import React, { useEffect, useMemo, useState } from "react";
import {
  ListFilter,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import api from "../api/apiConfig";
import DeleteBehaviorField from "../components/DeleteBehaviorField";
import EntityHeader from "../components/EntityHeader";
import ListFilterDrawer from "../components/ListFilterDrawer";
import ListPagination, {
  DEFAULT_PAGE_SIZE,
} from "../components/ListPagination";
import notify from "../utils/notify";
import { buildFilterParams } from "../utils/filterParams";
import { validateFormInDomOrder } from "../utils/formValidation";
import { formatDateBR } from "../utils/formatters";
import { normalizePagedResponse } from "../utils/pagedResponse";

const AVALIACAO_STATUS_OPTIONS = ["CONCLUÍDO", "NÃO CONCLUÍDO"];
const FILTER_DEFS = [
  { key: "nota", label: "Nota", param: "nota_in" },
  { key: "status", label: "Status", param: "status_in" },
  { key: "ativo", label: "Situação do Registro", param: "ativo_in" },
  { key: "obs", label: "Observação", param: "obs_in" },
  { key: "aluno", label: "Aluno", param: "id_aluno" },
  { key: "curso", label: "Curso", param: "id_curso" },
  { key: "turma", label: "Turma", param: "turma_in" },
  {
    key: "data_ingresso",
    label: "Data de Ingresso",
    param: "data_ingresso_in",
  },
  {
    key: "data_conclusao",
    label: "Data de Conclusão",
    param: "data_conclusao_in",
  },
];

const FILTER_DEF_MAP = FILTER_DEFS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

const toNullableNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const mergeSelectOptions = (...groups) =>
  Array.from(
    new Set(
      groups
        .flatMap((group) => (Array.isArray(group) ? group : [group]))
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );

const mergeFilterOptions = (...optionGroups) => {
  const merged = {};
  optionGroups.forEach((group) => {
    Object.entries(group || {}).forEach(([key, values]) => {
      merged[key] = Array.from(
        new Set([...(merged[key] || []), ...(values || []).filter(Boolean)]),
      ).sort((left, right) =>
        String(left).localeCompare(String(right), "pt-BR", {
          numeric: true,
          sensitivity: "base",
        }),
      );
    });
  });
  return merged;
};

// Normalizador para lidar com valores de Ativo/Inativo com precisão
const normalizeAtivoValue = (value) => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return !['false', '0', 'nao', 'não', 'inativo'].includes(normalized);
  }
  return value !== false && value !== 0;
};

const getAvaliacaoSortValue = (item, field) => {
  switch (field) {
    case "id":
      return item.IdAvaliacao || "";
    case "nota":
      return Number(item.Nota ?? Number.NEGATIVE_INFINITY);
    case "status":
      return item.Status || "";
    case "obs":
      return item.OBS || "";
    case "id_aluno":
      return item.NomeAluno || item.IdAluno || "";
    case "id_curso":
      return item.NomeCurso || item.IdCurso || "";
    case "ativo":
      return item.ativo ? "Ativo" : "Inativo";
    default:
      return item.IdAvaliacao || "";
  }
};

const sortAvaliacoesLocally = (rows, field, direction) =>
  [...rows].sort((left, right) => {
    const leftValue = getAvaliacaoSortValue(left, field);
    const rightValue = getAvaliacaoSortValue(right, field);

    const comparison =
      typeof leftValue === "number" || typeof rightValue === "number"
        ? Number(leftValue || 0) - Number(rightValue || 0)
        : String(leftValue || "").localeCompare(
          String(rightValue || ""),
          "pt-BR",
          { numeric: true, sensitivity: "base" },
        );

    return direction === "desc" ? comparison * -1 : comparison;
  });

const isLocalOnlySortField = (field) => field === "status" || field === "ativo";

const truncateObservation = (value, maxLength = 45) => {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text.length > maxLength
    ? `${text.slice(0, maxLength).trimEnd()}...`
    : text;
};

export default function AvaliacoesPage() {
  const [searchParams] = useSearchParams();
  const origin = searchParams.get("origin");
  const alunoId = searchParams.get("aluno") || "";
  const alunoNome = searchParams.get("alunoNome") || "Aluno";
  const [items, setItems] = useState([]);
  const [formOptions, setFormOptions] = useState({
    alunos: [],
    cursos: [],
    status: [],
  });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("nota");
  const [sortDir, setSortDir] = useState("asc");
  const [remoteSortRequest, setRemoteSortRequest] = useState({
    sortBy: "nota",
    sortDir: "asc",
  });
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterField, setSelectedFilterField] = useState(
    FILTER_DEFS[0].key,
  );
  const [selectedFilterValue, setSelectedFilterValue] = useState("");
  const [activeFilters, setActiveFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [showInativos, setShowInativos] = useState(false);
  const [showSelection, setShowSelection] = useState(false);
  const [panelMode, setPanelMode] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [newItem, setNewItem] = useState({
    IdAvaliacao: "",
    Nota: "",
    Status: "",
    OBS: "",
    IdAluno: "",
    IdCurso: "",
  });

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

      // A lógica exclusiva SÓ de inativos foi removida,
      // agora deixa a API gerenciar com "include_inativos" de forma mista

      const resp = await api.get("/avaliacoes/", {
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
      setError("Erro ao carregar avaliações.");
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const resp = await api.get("/avaliacoes/filter-options", {
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

  const fetchFormOptions = async () => {
    try {
      const response = await api.get("/avaliacoes/form-options");
      setFormOptions({
        alunos: response.data?.alunos || [],
        cursos: response.data?.cursos || [],
        status: response.data?.status || [],
      });
    } catch (err) {
      console.error(err);
      setFormOptions({ alunos: [], cursos: [], status: [] });
    }
  };

  useEffect(() => {
    fetchFormOptions();
    fetchFilterOptions();
    fetchItems(
      1,
      DEFAULT_PAGE_SIZE,
      query,
      activeFilters,
      remoteSortRequest.sortBy,
      remoteSortRequest.sortDir,
      showInativos,
    );
  }, []);

  useEffect(() => {
    fetchFilterOptions();
  }, [showInativos]);

  useEffect(() => {
    if (page) {
      fetchItems(
        page,
        pageSize,
        query,
        activeFilters,
        remoteSortRequest.sortBy,
        remoteSortRequest.sortDir,
        showInativos,
      );
    }
  }, [page, pageSize, query, activeFilters, remoteSortRequest, showInativos]);

  useEffect(() => {
    if (searchParams.get("create") !== "1") return;
    setEditingItem(null);
    setNewItem((previous) => ({
      ...previous,
      IdAvaliacao: "",
      Nota: "",
      Status: "",
      OBS: "",
      IdAluno: searchParams.get("aluno") || previous.IdAluno || "",
      IdCurso: searchParams.get("curso") || previous.IdCurso || "",
    }));
    setPanelMode("create");
  }, [searchParams]);

  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const rangeStart = total ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = total ? Math.min(page * pageSize, total) : 0;
  const isReadOnlyDetails = false;

  const resetForm = () =>
    setNewItem({
      IdAvaliacao: "",
      Nota: "",
      Status: "",
      OBS: "",
      IdAluno: "",
      IdCurso: "",
    });

  const startCreate = () => {
    setEditingItem(null);
    resetForm();
    setPanelMode("create");
  };

  const startEdit = (item) => {
    setEditingItem({
      ...item,
      ativo: item.ativo,
      Nota: item.Nota ?? "",
      Status: item.Status || "",
      OBS: item.OBS || "",
    });
    setPanelMode("edit");
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
      await api.post("/avaliacoes/", {
        IdAvaliacao: newItem.IdAvaliacao || undefined,
        Nota: toNullableNumber(newItem.Nota),
        Status: newItem.Status || undefined,
        OBS: newItem.OBS || undefined,
        IdAluno: newItem.IdAluno,
        IdCurso: newItem.IdCurso,
      });
      resetForm();
      closePanel();
      fetchItems(
        1,
        pageSize,
        query,
        activeFilters,
        remoteSortRequest.sortBy,
        remoteSortRequest.sortDir,
      );
      fetchFilterOptions();
      notify("Avaliação criada", { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || "Erro ao criar avaliação", {
        duration: 3500,
      });
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!validateFormInDomOrder({ form: e.currentTarget, notify })) return;
    if (!editingItem) return;
    try {
      await api.put(`/avaliacoes/${editingItem.IdAvaliacao}`, {
        Nota: toNullableNumber(editingItem.Nota),
        Status: editingItem.Status || null,
        OBS: editingItem.OBS || null,
        IdAluno: editingItem.IdAluno,
        IdCurso: editingItem.IdCurso,
        Ativo: editingItem.ativo !== false,
      });
      closePanel();
      fetchItems(
        page,
        pageSize,
        query,
        activeFilters,
        remoteSortRequest.sortBy,
        remoteSortRequest.sortDir,
      );
      fetchFilterOptions();
      notify("Avaliação atualizada", { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || "Erro ao atualizar avaliação", {
        duration: 3500,
      });
    }
  };

  const handleDelete = async (id, capability = null) => {
    const confirmationMessage =
      capability?.confirmation_message || "Remover avaliação?";
    if (!confirm(confirmationMessage)) return;
    try {
      const response = await api.delete(`/avaliacoes/${id}`);
      fetchItems(
        page,
        pageSize,
        query,
        activeFilters,
        remoteSortRequest.sortBy,
        remoteSortRequest.sortDir,
      );
      fetchFilterOptions();
      notify(response?.data?.message || "Avaliação removida", {
        duration: 2500,
      });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || "Erro ao remover avaliação", {
        duration: 3500,
      });
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
    setSelectedFilterValue("");
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
    setSelectedFilterValue("");
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
      setSortDir((prev) => {
        const nextDir = prev === "asc" ? "desc" : "asc";
        if (!isLocalOnlySortField(field)) {
          setRemoteSortRequest({ sortBy: field, sortDir: nextDir });
        }
        return nextDir;
      });
      setPage(1);
      return;
    }
    setSortBy(field);
    setSortDir("asc");
    if (!isLocalOnlySortField(field)) {
      setRemoteSortRequest({ sortBy: field, sortDir: "asc" });
    }
    setPage(1);
  };

  const sortIndicator = (field) => {
    if (sortBy !== field) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  };

  const activeFilterChips = Object.entries(activeFilters).flatMap(
    ([fieldKey, values]) =>
      (values || []).map((value) => ({
        fieldKey,
        value,
        label: FILTER_DEF_MAP[fieldKey]?.label || fieldKey,
      })),
  );

  const drawerFilterOptions = useMemo(
    () =>
      mergeFilterOptions(filterOptions, {
        ativo: ["Ativo", "Inativo"],
        status: formOptions.status,
        aluno: formOptions.alunos.map((item) => item.nome),
        curso: formOptions.cursos.map((item) => item.nome),
        turma: filterOptions.turma || [],
        data_ingresso: filterOptions.data_ingresso || [],
        data_conclusao: filterOptions.data_conclusao || [],
      }),
    [filterOptions, formOptions],
  );
  const selectableValues = drawerFilterOptions[selectedFilterField] || [];
  const statusOptions = mergeSelectOptions(
    AVALIACAO_STATUS_OPTIONS,
    formOptions.status,
    filterOptions.status,
    panelMode === "edit" ? editingItem?.Status : newItem.Status,
  );
  const activeFilterCount = activeFilterChips.length;
  const bulkCountLabel = `${selectedIds.length} selecionado(s)`;
  const resetSelection = () => setSelectedIds([]);
  const sortedItems = useMemo(
    () => sortAvaliacoesLocally(items, sortBy, sortDir),
    [items, sortBy, sortDir],
  );

  const toggleSelection = (id) => {
    setSelectedIds((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id],
    );
  };

  const handleSelectionChange = (event, id) => {
    event.stopPropagation();
    toggleSelection(id);
  };

  const handleBulkDelete = async () => {
    if (
      !selectedIds.length ||
      !window.confirm("Remover avaliações selecionadas?")
    )
      return;
    try {
      await Promise.all(
        selectedIds.map((id) => api.delete(`/avaliacoes/${id}`)),
      );
      resetSelection();
      fetchItems(
        page,
        pageSize,
        query,
        activeFilters,
        remoteSortRequest.sortBy,
        remoteSortRequest.sortDir,
      );
      fetchFilterOptions();
      notify("Avaliações removidas", { duration: 2500 });
    } catch (err) {
      console.error(err);
      notify(err?.response?.data?.detail || "Erro ao remover avaliações", {
        duration: 3500,
      });
    }
  };

  return (
    <div
      className={`app-shell app-shell-tight entity-page ${showSelection ? "selection-mode" : ""}`}
    >
      <EntityHeader
        breadcrumbs={
          origin === "alunos"
            ? [
              { label: "Alunos", to: "/alunos" },
              {
                label: alunoNome,
                to: alunoId
                  ? `/alunos?edit=${encodeURIComponent(alunoId)}`
                  : "/alunos",
              },
              { label: "Avaliações" },
            ]
            : [{ label: "Avaliações" }]
        }
        title="Listagem de Avaliações"
        meta={`${total} registro(s)`}
        filterChips={activeFilterChips}
        onRemoveFilterChip={removeFilterCriterion}
        actions={
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

            <button
              type="button"
              className="icon-action-btn filter-toggle-btn"
              aria-label="Abrir filtros"
              onClick={() => setShowFilters((prev) => !prev)}
            >
              {showFilters ? <X size={17} /> : <ListFilter size={17} />}
            </button>
            <button
              type="button"
              className={`icon-action-btn selection-toggle-btn ${showSelection ? "active" : ""}`}
              aria-label="Alternar seleção"
              onClick={() => {
                setShowSelection((previous) => {
                  if (previous) resetSelection();
                  return !previous;
                });
              }}
            >
              {showSelection ? (
                <ThumbsUp size={14} />
              ) : (
                <ThumbsDown size={14} />
              )}
            </button>
            <button
              type="button"
              className="icon-action-btn entity-add-btn"
              aria-label="Adicionar avaliação"
              onClick={startCreate}
            >
              <Plus size={17} />
              <span>Adicionar</span>
            </button>
          </>
        }
      />

      {selectedIds.length > 0 && (
        <section className="bulk-action-bar card">
          <strong>{bulkCountLabel}</strong>
          <div className="entity-actions">
            <button
              type="button"
              className="icon-action-btn danger"
              aria-label="Remover selecionados"
              onClick={handleBulkDelete}
            >
              <Trash2 size={17} />
            </button>
            <button
              type="button"
              className="icon-action-btn"
              aria-label="Limpar seleção"
              onClick={resetSelection}
            >
              <X size={17} />
            </button>
          </div>
        </section>
      )}

      <ListFilterDrawer
        open={showFilters}
        dataTestId="avaliacoes-filter-drawer"
        subtitle="Combine observação e nota sem poluir a grade principal."
        closeButton={
          <button
            type="button"
            className="icon-action-btn"
            aria-label="Fechar filtros"
            onClick={() => setShowFilters(false)}
          >
            <span aria-hidden="true">←</span>
          </button>
        }
        searchId="avaliacoes-drawer-search"
        query={query}
        onQueryChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        filterDefs={FILTER_DEFS}
        filterOptions={drawerFilterOptions}
        activeFilters={activeFilters}
        onToggleFilterValue={toggleFilterValue}
        selectedFilterField={selectedFilterField}
        onSelectedFilterFieldChange={(e) => {
          setSelectedFilterField(e.target.value);
          setSelectedFilterValue("");
        }}
        selectedFilterValue={selectedFilterValue}
        onSelectedFilterValueChange={(e) =>
          setSelectedFilterValue(e.target.value)
        }
        selectableValues={selectableValues}
        onAddFilterCriterion={addFilterCriterion}
        showInativos={showInativos}
        onShowInativosChange={(e) => {
          setShowInativos(e.target.checked);
          setPage(1);
        }}
        activeFilterChips={activeFilterChips}
        onRemoveFilterCriterion={removeFilterCriterion}
        onClearAllFilterCriteria={clearAllFilterCriteria}
        showInlineActiveChips={false}
      />

      <section>
        {loading ? (
          <div>Carregando...</div>
        ) : (
          <div className={`split-layout ${panelMode ? "has-panel" : ""}`}>
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
                          <button
                            type="button"
                            className="sort-btn"
                            onClick={() => toggleSort("id")}
                          >
                            Aluno{" "}
                            <span className="sort-indicator">
                              {sortIndicator("id")}
                            </span>
                          </button>
                        </th>
                        <th>
                          <button
                            type="button"
                            className="sort-btn"
                            onClick={() => toggleSort("nota")}
                          >
                            Nota{" "}
                            <span className="sort-indicator">
                              {sortIndicator("nota")}
                            </span>
                          </button>
                        </th>

                        <th>
                          <button
                            type="button"
                            className="sort-btn"
                            onClick={() => toggleSort("status")}
                          >
                            Status{" "}
                            <span className="sort-indicator">
                              {sortIndicator("status")}
                            </span>
                          </button>
                        </th>

                        <th>Ingresso</th>
                        <th>Conclusão</th>
                        <th>
                          <button
                            type="button"
                            className="sort-btn"
                            onClick={() => toggleSort("obs")}
                          >
                            Observação{" "}
                            <span className="sort-indicator">
                              {sortIndicator("obs")}
                            </span>
                          </button>
                        </th>

                        <th>
                          <button
                            type="button"
                            className="sort-btn"
                            onClick={() => toggleSort("id_curso")}
                          >
                            Curso{" "}
                            <span className="sort-indicator">
                              {sortIndicator("id_curso")}
                            </span>
                          </button>
                        </th>

                        <th>
                          <button
                            type="button"
                            className="sort-btn"
                            onClick={() => toggleSort("ativo")}
                          >
                            Registro{" "}
                            <span className="sort-indicator">
                              {sortIndicator("ativo")}
                            </span>
                          </button>
                        </th>
                        <th className="sticky-actions">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedItems.length > 0 ? (
                        sortedItems.map((item) => (
                          <tr
                            key={item.IdAvaliacao}
                            className="data-row"
                            onClick={() => startEdit(item)}
                          >
                            <td
                              className="selection-cell"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(item.IdAvaliacao)}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  handleSelectionChange(event, item.IdAvaliacao)
                                }
                              />
                            </td>
                            <td>
                              <div className="table-primary-text">
                                {item.NomeAluno ||
                                  item.IdAvaliacao ||
                                  "Avaliação registrada"}
                              </div>
                            </td>
                            <td>
                              {item.Nota === null ||
                                item.Nota === undefined ||
                                item.Nota === "" ? (
                                "-"
                              ) : (
                                <span
                                  className={`status-indicator ${Number(item.Nota) >= 7 ? "status-positive" : "status-negative"}`}
                                >
                                  {Number(item.Nota) >= 7 ? (
                                    <ThumbsUp size={14} />
                                  ) : (
                                    <ThumbsDown size={14} />
                                  )}{" "}
                                  {item.Nota}
                                </span>
                              )}
                            </td>

                            <td>{item.Status || "-"}</td>
                            <td>{formatDateBR(item.DataIngresso)}</td>
                            <td>{formatDateBR(item.DataConclusao)}</td>
                            <td title={item.OBS || ""}>
                              {truncateObservation(item.OBS)}
                            </td>

                            <td>{item.NomeCurso || "Curso não encontrado"}</td>
                            <td>
                              {item.ativo ? "Ativo" : "Inativo"}
                            </td>
                            <td className="sticky-actions">
                              <button
                                className="icon-btn entity-edit-btn"
                                aria-label="Detalhes"
                                title="Detalhes"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startEdit(item);
                                }}
                              >
                                <span aria-hidden="true">&gt;</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={11} style={{ textAlign: "center" }}>
                            Nenhuma avaliação encontrada.
                          </td>
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

            <aside className={`split-panel ${panelMode ? "open" : ""}`}>
              {(panelMode === "edit" || panelMode === "create") && (
                <form
                  onSubmit={panelMode === "edit" ? handleUpdate : handleCreate}
                  noValidate
                  className="card"
                >
                  <div className="panel-header">
                    <h3>
                      {panelMode === "edit"
                        ? "Detalhes da Avaliação"
                        : "Nova Avaliação"}
                    </h3>
                    <div className="panel-header-actions">
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={closePanel}
                      >
                        Fechar
                      </button>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="field">
                      <label>Nota</label>
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        value={
                          panelMode === "edit" ? editingItem.Nota : newItem.Nota
                        }
                        disabled={isReadOnlyDetails}
                        onChange={(e) =>
                          panelMode === "edit"
                            ? updateEditingItem("Nota", e.target.value)
                            : setNewItem({ ...newItem, Nota: e.target.value })
                        }
                      />
                    </div>

                    <div className="field">
                      <label>Status</label>
                      <select
                        className="select"
                        value={
                          panelMode === "edit"
                            ? editingItem.Status
                            : newItem.Status
                        }
                        disabled={isReadOnlyDetails}
                        onChange={(e) =>
                          panelMode === "edit"
                            ? updateEditingItem("Status", e.target.value)
                            : setNewItem({ ...newItem, Status: e.target.value })
                        }
                      >
                        <option value="">Selecione...</option>
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label>Observação</label>
                      <textarea
                        className="input textarea"
                        rows={10}
                        style={{ resize: 'vertical', minHeight: '200px' }}
                        value={
                          panelMode === "edit" ? editingItem.OBS : newItem.OBS
                        }
                        disabled={isReadOnlyDetails}
                        onChange={(e) =>
                          panelMode === "edit"
                            ? updateEditingItem("OBS", e.target.value)
                            : setNewItem({ ...newItem, OBS: e.target.value })
                        }
                      />
                    </div>



                    <div className="field">
                      <label className="field-label-required">Curso</label>
                      <select
                        className="select"
                        required
                        value={
                          panelMode === "edit"
                            ? editingItem.IdCurso
                            : newItem.IdCurso
                        }
                        disabled={isReadOnlyDetails}
                        onChange={(e) =>
                          panelMode === "edit"
                            ? updateEditingItem("IdCurso", e.target.value)
                            : setNewItem({
                              ...newItem,
                              IdCurso: e.target.value,
                            })
                        }
                      >
                        <option value="">Selecione...</option>
                        {formOptions.cursos.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {panelMode === "edit" && (
                    <DeleteBehaviorField
                      resourcePath="/avaliacoes"
                      entityId={editingItem?.IdAvaliacao}
                      active={editingItem?.ativo ?? true}
                      disabled={isReadOnlyDetails}
                      onActiveChange={(value) =>
                        updateEditingItem("ativo", value)
                      }
                      onDelete={(capability) =>
                        handleDelete(editingItem.IdAvaliacao, capability)
                      }
                    />
                  )}

                  <div className="toolbar" style={{ marginTop: 8 }}>
                    {!isReadOnlyDetails && (
                      <button className="btn" type="submit">
                        Salvar
                      </button>
                    )}
                    {panelMode === "edit" && (
                      <DeleteBehaviorField
                        placement="toolbar"
                        resourcePath="/avaliacoes"
                        entityId={editingItem?.IdAvaliacao}
                        active={editingItem?.ativo ?? true}
                        disabled={isReadOnlyDetails}
                        onActiveChange={(value) =>
                          updateEditingItem("ativo", value)
                        }
                        onDelete={(capability) =>
                          handleDelete(editingItem.IdAvaliacao, capability)
                        }
                      />
                    )}
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={closePanel}
                    >
                      {isReadOnlyDetails ? "Fechar" : "Cancelar"}
                    </button>
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
