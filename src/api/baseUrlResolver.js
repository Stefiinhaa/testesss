const DEFAULT_API_BASE = '/api';

function normalizePath(pathname) {
  const raw = String(pathname || '').trim();
  if (!raw || raw === '/') return DEFAULT_API_BASE;
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

export function resolveApiBaseUrl({ envValue, locationOrigin, locationProtocol } = {}) {
  const candidate = String(envValue || '').trim();
  if (!candidate) return DEFAULT_API_BASE;

  // Relative values are preferred because they automatically follow HTTPS/current host.
  if (candidate.startsWith('/')) {
    return normalizePath(candidate);
  }

  try {
    const parsed = new URL(candidate);
    const pageIsHttps = String(locationProtocol || '').toLowerCase() === 'https:';

    if (pageIsHttps && parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }

    const normalizedPath = normalizePath(parsed.pathname);
    const normalizedOrigin = String(locationOrigin || '').trim();
    if (normalizedOrigin && parsed.origin === normalizedOrigin) {
      return normalizedPath;
    }

    return `${parsed.origin}${normalizedPath}`;
  } catch (_error) {
    return DEFAULT_API_BASE;
  }
}

export default resolveApiBaseUrl;
