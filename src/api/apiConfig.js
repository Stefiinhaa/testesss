import axios from 'axios';
import { buildOfflineCacheKey, loadOfflineCache, saveOfflineCache } from '../utils/offlineCache';
import { clearOfflineAuthState } from '../utils/offlineManager';
import { clearSessionHints } from '../utils/sessionStore';
import { resolveApiBaseUrl } from './baseUrlResolver';
import { isUnexpectedHtmlPayload } from './responseGuards';

/**
 * CONFIGURAÇÃO BASE DO AXIOS
 * baseURL: Prioriza a variável do Vite, caso contrário usa '/api' (proxy do Nginx).
 */
const baseURL = resolveApiBaseUrl({
  envValue: import.meta.env?.VITE_API_URL,
  locationOrigin: typeof window !== 'undefined' ? window.location.origin : '',
  locationProtocol: typeof window !== 'undefined' ? window.location.protocol : '',
});
const api = axios.create({
  baseURL: baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const ACCESS_TOKEN_KEY = '@FullEduca:access_token';

function getStoredAccessToken() {
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY) || '';
  } catch (_error) {
    return '';
  }
}

function clearStoredAccessToken() {
  try {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch (_error) {
    // ignore local storage errors
  }
}

function normalizeRequestPath(config = {}) {
  const rawUrl = String(config.url || '');
  const withoutQuery = rawUrl.split('?')[0] || '';
  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}

function shouldCacheOfflineSnapshot(config = {}) {
  const method = String(config.method || 'get').toLowerCase();
  if (method !== 'get') return false;
  return normalizeRequestPath(config) !== '/usuarios/me';
}

api.interceptors.request.use((config) => {
  const method = String(config.method || 'get').toLowerCase();
  if (typeof navigator !== 'undefined' && navigator.onLine === false && !['get', 'head', 'options'].includes(method)) {
    const offlineWriteError = new Error('Modo offline: operações de escrita ficam bloqueadas para manter a navegação em leitura.');
    offlineWriteError.code = 'OFFLINE_WRITE_BLOCKED';
    return Promise.reject(offlineWriteError);
  }

  if (shouldCacheOfflineSnapshot(config)) {
    config.metadata = {
      ...(config.metadata || {}),
      offlineCacheKey: buildOfflineCacheKey(config),
    };
  }

  const token = getStoredAccessToken();

  // Prevent fetching user info if already on the login page and no token is present.
  // This avoids unnecessary 401 errors in the console during initial load on login.
  if (normalizeRequestPath(config) === '/usuarios/me' && window.location.pathname.includes('/login') && !token) {
    // Proactively reject the request to prevent it from being sent
    return Promise.reject(new axios.Cancel('Request to /usuarios/me cancelled: on login page.'));
  }

  if (token) {
    config.headers = config.headers || {};
    if (!config.headers.Authorization && !config.headers.authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

// Interceptor: Tratamento global de erros
api.interceptors.response.use(
  (response) => {
    if (isUnexpectedHtmlPayload(response)) {
      const unexpectedHtmlError = new Error('Resposta inesperada da API: recebido HTML em vez de JSON.');
      unexpectedHtmlError.code = 'UNEXPECTED_HTML_RESPONSE';
      unexpectedHtmlError.response = response;
      return Promise.reject(unexpectedHtmlError);
    }

    const method = String(response.config?.method || 'get').toLowerCase();
    const cacheKey = response.config?.metadata?.offlineCacheKey;
    if (method === 'get' && cacheKey) {
      saveOfflineCache(cacheKey, response.data);
    }
    return response;
  },
  (error) => {
    // 1. Se a requisição foi cancelada propositalmente (ex: interceptor bloqueando /me na tela de login)
    if (axios.isCancel(error)) {
      console.info(error.message);
      return Promise.reject(error);
    }

    // Se o backend retornar 401, o token é inválido ou expirou
    if (error.response && error.response.status === 401) {
      const requestPath = normalizeRequestPath(error.config);
      // Only clear session and redirect for primary auth-check endpoints.
      // Secondary data endpoints (trilhas, interesses, academico) should
      // just propagate the error without forcing a full logout.
      const criticalAuthPaths = ['/usuarios/me', '/auth/'];
      const isCriticalAuthFailure = criticalAuthPaths.some((p) => requestPath.startsWith(p));

      if (isCriticalAuthFailure) {
        console.warn("Sessão inválida ou expirada. Limpando credenciais...");
        clearSessionHints();
        clearOfflineAuthState();
        clearStoredAccessToken();

        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }
    }

    // Tratamento para erro de conexão: tenta usar o último snapshot local antes de falhar.
    if (!error.response) {
      const method = String(error.config?.method || 'get').toLowerCase();
      const cacheKey = error.config?.metadata?.offlineCacheKey || buildOfflineCacheKey(error.config || {});
      if (shouldCacheOfflineSnapshot(error.config || {}) && cacheKey) {
        const cachedData = loadOfflineCache(cacheKey);
        if (cachedData !== null) {
          return Promise.resolve({
            data: cachedData,
            status: 200,
            statusText: 'offline-cache',
            headers: { 'x-fulleduca-offline-cache': 'hit' },
            config: error.config,
            request: error.request,
          });
        }
      }
      console.error("Erro de conexão: O servidor parece estar offline.");
    } else if (error.code === 'UNEXPECTED_HTML_RESPONSE') {
      console.error('Resposta inválida de API: verifique roteamento/proxy da camada /api.');
    }

    return Promise.reject(error);
  }
);

export default api;
