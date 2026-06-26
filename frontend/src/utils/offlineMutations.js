const OFFLINE_MUTATIONS_KEY = '@FullEduca:offline:mutations';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function generateMutationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readOfflineMutations() {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(OFFLINE_MUTATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Falha ao ler fila offline', error);
    return [];
  }
}

export function writeOfflineMutations(entries) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(OFFLINE_MUTATIONS_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn('Falha ao salvar fila offline', error);
  }
}

export function clearOfflineMutations() {
  writeOfflineMutations([]);
}

export function enqueueOfflineMutation(entry) {
  const nextEntry = {
    id: generateMutationId(),
    createdAt: new Date().toISOString(),
    method: 'put',
    ...entry,
  };
  const current = readOfflineMutations().filter((item) => !(item.url === nextEntry.url && item.method === nextEntry.method));
  current.push(nextEntry);
  writeOfflineMutations(current);
  return nextEntry;
}

export function getLatestOfflineMutation(url, method = 'put') {
  const normalizedMethod = String(method || 'put').toLowerCase();
  const matches = readOfflineMutations().filter((item) => item.url === url && String(item.method || 'put').toLowerCase() === normalizedMethod);
  return matches.length ? matches[matches.length - 1] : null;
}

export async function flushOfflineMutations(executor) {
  const entries = readOfflineMutations();
  const synced = [];
  const failed = [];

  for (const entry of entries) {
    try {
      await executor(entry);
      synced.push(entry);
    } catch (error) {
      failed.push({ entry, error });
    }
  }

  if (synced.length) {
    const syncedIds = new Set(synced.map((item) => item.id));
    writeOfflineMutations(entries.filter((item) => !syncedIds.has(item.id)));
  }

  return { synced, failed, pending: readOfflineMutations() };
}
