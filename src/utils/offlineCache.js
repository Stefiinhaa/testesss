const CACHE_PREFIX = '@FullEduca:offline:';
const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function buildOfflineCacheKey(config = {}) {
  const method = String(config.method || 'get').toLowerCase();
  const base = String(config.baseURL || '').replace(/\/+$/, '');
  const url = String(config.url || '').replace(/^\/+/, '/');
  const params = config.params || {};
  const searchParams = new URLSearchParams();

  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => searchParams.append(key, String(item)));
        return;
      }
      searchParams.set(key, String(value));
    });

  const query = searchParams.toString();
  return `${CACHE_PREFIX}${method}:${base}${url}${query ? `?${query}` : ''}`;
}

export function saveOfflineCache(key, data) {
  if (!canUseStorage() || !key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
  } catch (error) {
    console.warn('Falha ao salvar cache offline', error);
  }
}

export function loadOfflineCache(key) {
  if (!canUseStorage() || !key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.timestamp || (Date.now() - parsed.timestamp) > MAX_CACHE_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.data ?? null;
  } catch (error) {
    console.warn('Falha ao ler cache offline', error);
    return null;
  }
}

export function removeOfflineCache(key) {
  if (!canUseStorage() || !key) return;
  window.localStorage.removeItem(key);
}
