import React from 'react';
import { Link } from 'react-router-dom';

function BreadcrumbItem({ item, isCurrent }) {
  // ... (mantenha o código existente do BreadcrumbItem igual)
  if (!item?.label) return null;

  const canClick = Boolean(item.onClick || item.to);
  const linkClassName = `entity-breadcrumb-link${isCurrent ? ' is-current-link' : ''}`;

  if (item.onClick && canClick) {
    return (
      <button type="button" className={linkClassName} onClick={item.onClick}>
        {item.label}
      </button>
    );
  }

  if (item.to && canClick) {
    return (
      <Link className={linkClassName} to={item.to}>
        {item.label}
      </Link>
    );
  }

  return <span className="entity-breadcrumb-current">{item.label}</span>;
}

export default function EntityHeader({ 
  breadcrumbs = [], 
  meta, 
  actions, 
  filterChips = [], 
  onRemoveFilterChip,
  // Novas props adicionadas aqui:
  showInativos,
  onShowInativosChange
}) {
  const visibleBreadcrumbs = breadcrumbs.filter((item) => item?.label);

  return (
    <section className="entity-header">
      <div className="entity-header-copy">
        <div className="entity-header-topline">
          <div className="entity-breadcrumb-row">
            <nav className="entity-breadcrumb-nav" aria-label="Breadcrumb">
              {visibleBreadcrumbs.map((item, index) => (
                <React.Fragment key={`${item.label}:${index}`}>
                  {index > 0 && <span className="entity-breadcrumb-separator">/</span>}
                  <BreadcrumbItem item={item} isCurrent={index === visibleBreadcrumbs.length - 1} />
                </React.Fragment>
              ))}
            </nav>
            {filterChips.length > 0 ? (
              <div className="entity-breadcrumb-chips" aria-label="Filtros selecionados">
                {filterChips.map((chip) => (
                  <button
                    key={`${chip.fieldKey}:${chip.value}`}
                    type="button"
                    className="filter-chip is-active"
                    onClick={() => onRemoveFilterChip?.(chip.fieldKey, chip.value)}
                    title="Remover critério"
                  >
                    {chip.label}: {chip.value} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {meta ? <p className="entity-header-meta">{meta}</p> : null}
        </div>
      </div>
      
      <div className="entity-actions">
        {/* Nova Checkbox de Inativos renderizada aqui, antes dos botões de ação */}
        {onShowInativosChange !== undefined && (
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
              Apenas Inativos {/* Alterado aqui */}
            </label>
        )}
        {actions}
      </div>
    </section>
  );
}