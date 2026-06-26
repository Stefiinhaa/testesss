let toastifyLoaderPromise;

export function preloadToastify() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.Toastify) return Promise.resolve(window.Toastify);
  if (toastifyLoaderPromise) return toastifyLoaderPromise;

  toastifyLoaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-toastify-loader="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.Toastify || null), { once: true });
      existingScript.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = '/toastify-lib.js';
    script.async = true;
    script.dataset.toastifyLoader = 'true';
    script.addEventListener('load', () => resolve(window.Toastify || null), { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  }).catch(() => null);

  return toastifyLoaderPromise;
}

export function showToastWithToastify(message, options = {}) {
  if (typeof window === 'undefined' || !window.Toastify) return false;

  window.Toastify({
    text: message,
    duration: options.duration || 3500,
    gravity: options.gravity || 'top',
    position: options.position || 'right',
    close: true,
    stopOnFocus: true,
    className: `fulleduca-toast${options.isError ? ' is-error' : ''}`,
  }).showToast();
  return true;
}

if (typeof document !== 'undefined') {
  preloadToastify();
}
