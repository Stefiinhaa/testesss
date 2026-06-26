import React, { useEffect, useMemo, useState } from 'react';

const humanizeFilterLabel = (key) => String(key || '')
  .replace(/[_-]+/g, ' ')
  .trim()
  .replace(/\b\w/g, (match) => match.toUpperCase());

export default function ListFilterDrawer({
  open,
  dataTestId,
  title = 'Filtro',
  subtitle,
  closeButton,
  filterDefs,
  filterOptions,
  activeFilters,
  onToggleFilterValue,
}) {
  const [browsingFieldKey, setBrowsingFieldKey] = useState('');
  const [valueQuery, setValueQuery] = useState('');
  const [manualValue, setManualValue] = useState('');

  const mergedFilterDefs = useMemo(() => {
    const baseDefs = Array.isArray(filterDefs) ? filterDefs : [];
    const knownKeys = new Set(baseDefs.map((item) => item.key));
    const optionKeys = Object.keys(filterOptions || {}).filter((key) => !knownKeys.has(key));
    const extraDefs = optionKeys
      .map((key) => ({ key, label: humanizeFilterLabel(key), param: `${key}_in` }))
      .sort((left, right) => String(left.label).localeCompare(String(right.label), 'pt-BR', { numeric: true, sensitivity: 'base' }));
    return [...baseDefs, ...extraDefs];
  }, [filterDefs, filterOptions]);

  const sections = mergedFilterDefs.map((filterDef) => ({
    ...filterDef,
    values: (filterOptions?.[filterDef.key] || []).filter(Boolean),
    activeCount: (activeFilters?.[filterDef.key] || []).length,
  }));

  const browsingSection = useMemo(
    () => sections.find((section) => section.key === browsingFieldKey) || null,
    [sections, browsingFieldKey]
  );

  const filteredBrowsingValues = useMemo(() => {
    if (!browsingSection) return [];
    const normalizedQuery = String(valueQuery || '').trim().toLowerCase();
    if (!normalizedQuery) return browsingSection.values;
    return browsingSection.values.filter((value) => String(value).toLowerCase().includes(normalizedQuery));
  }, [browsingSection, valueQuery]);

  useEffect(() => {
    if (!open) {
      setBrowsingFieldKey('');
      setValueQuery('');
      setManualValue('');
    }
  }, [open]);

  useEffect(() => {
    if (!browsingFieldKey) return;
    if (sections.some((section) => section.key === browsingFieldKey)) return;
    setBrowsingFieldKey('');
    setValueQuery('');
    setManualValue('');
  }, [sections, browsingFieldKey]);

  const applyManualValue = () => {
    if (!browsingSection) return;
    const normalized = String(manualValue || '').trim();
    if (!normalized) return;
    const alreadyActive = (activeFilters?.[browsingSection.key] || []).includes(normalized);
    if (!alreadyActive) {
      onToggleFilterValue(browsingSection.key, normalized);
    }
    setManualValue('');
  };

  return (
    <aside className={`list-filter-drawer ${open ? 'open' : ''}`} data-testid={dataTestId}>
      <div className="list-filter-drawer-header">
        <div
          className="list-filter-drawer-header-main"
          style={{ display: 'flex', alignItems: 'center', gap: 10 }}
        >
          {closeButton}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <strong className="list-filter-drawer-title">{title}</strong>
            {subtitle ? <div className="list-filter-drawer-subtitle">{subtitle}</div> : null}
          </div>
        </div>
      </div>

      <div className={`list-filter-sheet-browser ${browsingSection ? 'is-browsing' : 'is-listing'}`}>
        <div className="list-filter-sheet-track">
          <section className="list-filter-sheet-pane list-filter-sheet-pane-criteria">
            <div className="list-filter-sheet-sections">
              {sections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  className="list-filter-sheet-section list-filter-sheet-section-button"
                  onClick={() => setBrowsingFieldKey(section.key)}
                >
                  <div className="list-filter-sheet-section-header">
                    <span className="list-filter-sheet-section-label">{section.label}</span>
                    <span className="list-filter-sheet-section-chevron" aria-hidden="true">›</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="list-filter-sheet-pane list-filter-sheet-pane-values" aria-hidden={!browsingSection}>
            {browsingSection ? (
              <>
                <div className="list-filter-sheet-breadcrumbs">
                  <button type="button" className="btn ghost" onClick={() => { setBrowsingFieldKey(''); setValueQuery(''); setManualValue(''); }}>
                    Voltar
                  </button>
                  <div className="list-filter-sheet-breadcrumb-copy">
                    <strong>{browsingSection.label}</strong>
                    <span>{browsingSection.values.length} valor(es)</span>
                  </div>
                </div>

                <div className="field list-filter-value-search-field">
                  <label htmlFor={`${dataTestId || 'filter'}-value-search`}>Buscar valores</label>
                  <input
                    id={`${dataTestId || 'filter'}-value-search`}
                    className="input"
                    type="search"
                    value={valueQuery}
                    onChange={(event) => setValueQuery(event.target.value)}
                    placeholder={`Buscar em ${browsingSection.label.toLowerCase()}`}
                  />
                </div>

                <div className="field list-filter-value-search-field">
                  <label htmlFor={`${dataTestId || 'filter'}-manual-value`}>
                    {browsingSection.values.length ? 'Adicionar valor manualmente' : 'Digite um valor para filtrar'}
                  </label>
                  <div className="inline-actions" style={{ display: 'flex', gap: 8 }}>
                    <input
                      id={`${dataTestId || 'filter'}-manual-value`}
                      className="input"
                      type="text"
                      value={manualValue}
                      onChange={(event) => setManualValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          applyManualValue();
                        }
                      }}
                      placeholder={`Ex.: ${browsingSection.label}`}
                    />
                    <button type="button" className="btn" onClick={applyManualValue}>
                      Aplicar
                    </button>
                  </div>
                </div>

                <div className="list-filter-sheet-options list-filter-sheet-options-column">
                  {filteredBrowsingValues.length ? filteredBrowsingValues.map((value) => {
                    const active = (activeFilters?.[browsingSection.key] || []).includes(value);
                    return (
                      <label
                        key={`${browsingSection.key}:${value}`}
                        className={`list-filter-sheet-option-check ${active ? 'is-active' : ''}`}
                        title={active ? 'Remover filtro' : 'Aplicar filtro'}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => onToggleFilterValue(browsingSection.key, value)}
                        />
                        <span>{value}</span>
                      </label>
                    );
                  }) : (
                    <span className="helper-text">Sem valores compatíveis.</span>
                  )}
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </aside>
  );
}
