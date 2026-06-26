function containsHtmlMarker(text) {
  const normalized = String(text || '').trim().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html') || normalized.includes('<head') || normalized.includes('<body');
}

export function isUnexpectedHtmlPayload(response = {}) {
  const headers = response.headers || {};
  const contentType = String(headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
  const payload = response.data;

  if (contentType.includes('application/json')) {
    return false;
  }

  if (typeof payload === 'string') {
    return containsHtmlMarker(payload);
  }

  return false;
}

export default isUnexpectedHtmlPayload;
