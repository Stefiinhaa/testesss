function isJsDomRuntime() {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
}

export function redirectWindow(targetPath) {
  if (typeof window === 'undefined' || !targetPath) return;

  if (isJsDomRuntime() && typeof window.history?.replaceState === 'function') {
    window.history.replaceState({}, '', targetPath);
    return;
  }

  if (typeof window.location?.replace === 'function') {
    window.location.replace(targetPath);
    return;
  }

  window.location.href = targetPath;
}
