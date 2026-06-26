const API_PREFIX = '/api';

function stripLeadingSlashes(value) {
  return String(value || '').replace(/^\/+/, '');
}

function extractFilename(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

export function resolveMediaUrl(mediaPath, entity) {
  if (!mediaPath) return null;

  const rawPath = String(mediaPath).trim();
  if (!rawPath) return null;
  if (/^https?:\/\//i.test(rawPath) || rawPath.startsWith('data:') || rawPath.startsWith('blob:')) {
    return rawPath;
  }
  if (rawPath.startsWith(`${API_PREFIX}/static/`)) {
    return rawPath;
  }
  if (rawPath.startsWith('/static/')) {
    return `${API_PREFIX}${rawPath}`;
  }

  const normalized = rawPath.replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  const entityPath = `static/${entity}/`;

  if (lower.includes(entityPath)) {
    const suffixIndex = lower.indexOf(entityPath);
    const suffix = normalized.slice(suffixIndex + entityPath.length);
    return `${API_PREFIX}/static/${entity}/${stripLeadingSlashes(suffix)}`;
  }
  if (lower.startsWith(`uploads/${entity}/`)) {
    return `${API_PREFIX}/static/${entity}/${stripLeadingSlashes(normalized.slice(`uploads/${entity}/`.length))}`;
  }
  if (lower.startsWith(`${entity}_images/`) || lower.startsWith(`${entity}s_images/`)) {
    return `${API_PREFIX}/static/${entity}/${extractFilename(normalized)}`;
  }
  return `${API_PREFIX}/static/${entity}/${extractFilename(normalized)}`;
}

export function resolveAlunoImageUrl(mediaPath) {
  return resolveMediaUrl(mediaPath, 'alunos');
}

export function resolveProfessorImageUrl(mediaPath) {
  return resolveMediaUrl(mediaPath, 'professores');
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}
