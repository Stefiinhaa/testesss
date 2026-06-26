import React from 'react';

export const PAGE_SIZE_OPTIONS = [10, 50, 100];
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

export default function ListPagination({
  page,
  pages,
  total,
  pageSize,
  rangeStart,
  rangeEnd,
  setPage,
  setPageSize,
}) {
  const handlePageSizeChange = (event) => {
    const nextSize = Number(event.target.value) || DEFAULT_PAGE_SIZE;
    setPage(1);
    setPageSize(nextSize);
  };

  return (
    <div className="toolbar pagination-toolbar" style={{ marginTop: 12 }}>
      <div className="pagination-info">Mostrando {rangeStart}–{rangeEnd} de {total}</div>
      <div className="pagination-controls">
        <label className="pagination-page-size">
          <span>Itens por página</span>
          <select className="select pagination-page-size-select" value={pageSize} onChange={handlePageSizeChange}>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <button className="btn ghost pagination-btn" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>&lt;</button>
        <span style={{ margin: '0 8px' }}>{page}/{pages}</span>
        <button className="btn pagination-btn" disabled={page >= pages} onClick={() => setPage((prev) => Math.min(pages, prev + 1))}>&gt;</button>
      </div>
    </div>
  );
}
