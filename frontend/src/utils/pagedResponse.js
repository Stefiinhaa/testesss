export function unwrapApiPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;

  const nested = payload.data;
  if (Array.isArray(nested)) return nested;
  if (nested && typeof nested === 'object') {
    if (Array.isArray(nested.items) || Array.isArray(nested.results) || Array.isArray(nested.rows)) return nested;
    if (typeof payload.items === 'undefined' && typeof payload.total === 'undefined' && typeof payload.page === 'undefined') {
      return nested;
    }
  }

  return payload;
}

export function normalizePagedResponse(payload, fallbackPage = 1) {
  const unwrapped = unwrapApiPayload(payload);

  if (Array.isArray(unwrapped)) {
    return {
      items: unwrapped,
      total: unwrapped.length,
      page: fallbackPage,
    };
  }

  const source = unwrapped && typeof unwrapped === 'object' ? unwrapped : {};

  const items =
    (Array.isArray(source.items) && source.items) ||
    (Array.isArray(source.results) && source.results) ||
    (Array.isArray(source.rows) && source.rows) ||
    (Array.isArray(source.data) && source.data) ||
    (Array.isArray(source.data?.items) && source.data.items) ||
    [];

  const totalCandidate =
    source.total ??
    source.count ??
    source.pagination?.total ??
    source.data?.total ??
    source.data?.count;

  const pageCandidate =
    source.page ??
    source.current_page ??
    source.pagination?.page ??
    source.data?.page ??
    source.data?.current_page;

  const total = Number.isFinite(Number(totalCandidate)) ? Number(totalCandidate) : items.length;
  const page = Number.isFinite(Number(pageCandidate)) ? Number(pageCandidate) : fallbackPage;

  return {
    items,
    total,
    page,
  };
}
