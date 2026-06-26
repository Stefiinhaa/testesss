import { buildOfflineCacheKey, loadOfflineCache, removeOfflineCache, saveOfflineCache } from './offlineCache';
import {
  clearOfflineMutations,
  enqueueOfflineMutation,
  flushOfflineMutations,
  getLatestOfflineMutation,
  readOfflineMutations,
} from './offlineMutations';

const API_BASE_URL = '/api';
const SESSION_RESOURCE_URL = '/usuarios/me';

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

export function getPendingOfflineCount() {
  return readOfflineMutations().length;
}

export function getOfflineResourceCacheKey(url, params) {
  return buildOfflineCacheKey({ method: 'get', url, baseURL: API_BASE_URL, params });
}

export function getSessionOfflineCacheKey() {
  return getOfflineResourceCacheKey(SESSION_RESOURCE_URL);
}

export function readOfflineSnapshot(url, params) {
  return loadOfflineCache(getOfflineResourceCacheKey(url, params));
}

export function writeOfflineSnapshot(url, data, params) {
  saveOfflineCache(getOfflineResourceCacheKey(url, params), data);
}

export function getPendingOfflineMutation(url, method = 'put') {
  return getLatestOfflineMutation(url, method);
}

export function readOfflineResourceState(url, method = 'put', params) {
  return {
    snapshot: readOfflineSnapshot(url, params),
    pendingMutation: getPendingOfflineMutation(url, method),
  };
}

export function queueOfflineWrite(entry) {
  return enqueueOfflineMutation(entry);
}

export function clearPendingOfflineWrites() {
  clearOfflineMutations();
}

export function clearSessionOfflineSnapshot() {
  removeOfflineCache(getSessionOfflineCacheKey());
}

export function clearOfflineAuthState() {
  clearPendingOfflineWrites();
  clearSessionOfflineSnapshot();
}

export function flushPendingOfflineWrites(executor) {
  return flushOfflineMutations(executor);
}
