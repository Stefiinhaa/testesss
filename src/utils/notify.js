import { preloadToastify, showToastWithToastify } from './toastifyLoader';

function isJavaScriptRuntimeAvailable() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function ensureFallbackTarget(targetId) {
  if (typeof document === 'undefined') return null;
  if (targetId) return document.getElementById(targetId);

  let el = document.getElementById('global-feedback');
  if (!el) {
    el = document.createElement('div');
    el.id = 'global-feedback';
    el.className = 'form-feedback is-visible';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

export default function notify(message, opts = {}) {
  const isError = opts.type === 'error';
  if (!isJavaScriptRuntimeAvailable()) return;

  try {
    if (showToastWithToastify(message, {
      duration: opts.duration || 3500,
      gravity: opts.gravity || 'top',
      position: opts.position || 'right',
      isError,
    })) {
      return;
    }
  } catch (e) {
    // ignore and continue with async preload
  }

  preloadToastify()
    .then(() => {
      showToastWithToastify(message, {
        duration: opts.duration || 3500,
        gravity: opts.gravity || 'top',
        position: opts.position || 'right',
        isError,
      });
    })
    .catch(() => {
      if (!opts.allowHtmlFallback) return;
      const fallbackTarget = ensureFallbackTarget(opts.fallbackTargetId);
      if (!fallbackTarget) return;
      fallbackTarget.textContent = message;
      fallbackTarget.className = `form-feedback is-visible${isError ? ' is-error' : ''}`;
    });

  if (!opts.allowHtmlFallback) return;
  const target = ensureFallbackTarget(opts.fallbackTargetId);
  if (target) {
    target.textContent = message;
    target.className = `form-feedback is-visible${isError ? ' is-error' : ''}`;
  }
}
