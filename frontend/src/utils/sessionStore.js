const SESSION_KEYS = {
  id: '@FullEduca:id',
  perfil: '@FullEduca:perfil',
  user: '@FullEduca:user',
  login: '@FullEduca:login',
};

const ADMIN_PROFILE_ALIASES = new Set(['admin', 'administrador']);

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getItem(key) {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(key);
}

function setItem(key, value) {
  if (!canUseStorage() || value === undefined || value === null || value === '') return;
  window.localStorage.setItem(key, String(value));
}

function removeItem(key) {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(key);
}

function resolveSessionLogin(sessionLike) {
  return String(sessionLike?.login || sessionLike?.user || '').trim();
}

function getStoredLogin() {
  return getItem(SESSION_KEYS.login) || getItem(SESSION_KEYS.user) || '';
}

export function normalizeSessionProfile(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (ADMIN_PROFILE_ALIASES.has(normalized)) return 'admin';
  return normalized;
}

export function isAdminSessionProfile(value) {
  return normalizeSessionProfile(value) === 'admin';
}

export function persistSessionHints(session) {
  if (!session) return;
  setItem(SESSION_KEYS.id, session.id);
  setItem(SESSION_KEYS.perfil, normalizeSessionProfile(session.perfil));
  const login = resolveSessionLogin(session);
  if (login) {
    setItem(SESSION_KEYS.user, login);
    setItem(SESSION_KEYS.login, login);
  }
}

export function clearSessionHints() {
  Object.values(SESSION_KEYS).forEach(removeItem);
}

export function getSessionHint() {
  const perfil = normalizeSessionProfile(getItem(SESSION_KEYS.perfil));
  const login = getStoredLogin();
  const id = getItem(SESSION_KEYS.id);
  if (!perfil && !login && !id) return null;
  return { id, perfil, user: login, login, isOfflineHint: true };
}

export function getSessionUserDisplay() {
  return getStoredLogin() || 'Usuário';
}

export function getSessionProfile() {
  return normalizeSessionProfile(getItem(SESSION_KEYS.perfil));
}

export function getSessionUserId() {
  return getItem(SESSION_KEYS.id);
}
