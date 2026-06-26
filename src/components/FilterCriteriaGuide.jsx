import React from 'react';

export default function FilterCriteriaGuide({ defs = [], options = {}, activeFilters = {}, onSelect }) {
  if (!defs.length) return null;

  return (
    <div className="filter-criteria-guide" data-testid="filter-criteria-guide">
      {defs.map((definition) => {
        const values = Array.isArray(options?.[definition.key]) ? options[definition.key] : [];
        return (
          <section key={definition.key} className="filter-criteria-card">
            <strong>{definition.label}</strong>
            {values.length ? (
              <div className="filter-criteria-values">
                {values.map((value) => {
                  const isActive = Array.isArray(activeFilters?.[definition.key]) && activeFilters[definition.key].includes(value);
                  const className = `filter-criteria-pill${onSelect ? ' is-clickable' : ''}${isActive ? ' is-active' : ''}`;

                  if (!onSelect) {
                    return <span key={`${definition.key}:${value}`} className={className}>{value}</span>;
                  }

                  return (
                    <button
                      key={`${definition.key}:${value}`}
                      type="button"
                      className={className}
                      aria-pressed={isActive}
                      onClick={() => onSelect(definition.key, value)}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="filter-criteria-empty">Sem valores disponíveis</span>
            )}
          </section>
        );
      })}
    </div>
  );
}
