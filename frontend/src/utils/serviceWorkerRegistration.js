const LOCAL_SW_HOSTS = new Set(['localhost', '127.0.0.1']);
const SW_SETUP_FLAG = '__fulleducaServiceWorkerSetup';

export function isLocalServiceWorkerHost(hostname) {
  return LOCAL_SW_HOSTS.has(String(hostname || '').trim().toLowerCase());
}

async function clearLocalRegistrations({ navigatorObj, cachesObj, consoleObj }) {
  try {
    const registrations = await navigatorObj.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if (cachesObj && typeof cachesObj.keys === 'function' && typeof cachesObj.delete === 'function') {
      const cacheKeys = await cachesObj.keys();
      await Promise.all(cacheKeys.map((key) => cachesObj.delete(key)));
    }
  } catch (error) {
    consoleObj.error('Falha ao limpar service workers locais', error);
  }
}

async function registerProductionServiceWorker({ navigatorObj, consoleObj }) {
  try {
    await navigatorObj.serviceWorker.register('/sw.js');
  } catch (error) {
    consoleObj.error('Falha ao registrar service worker', error);
  }
}

export function setupServiceWorker(options = {}) {
  const windowObj = options.windowObj || (typeof window !== 'undefined' ? window : undefined);
  const navigatorObj = options.navigatorObj || (typeof navigator !== 'undefined' ? navigator : undefined);
  const cachesObj = options.cachesObj || (typeof window !== 'undefined' ? window.caches : undefined);
  const consoleObj = options.consoleObj || console;

  if (!windowObj || !navigatorObj?.serviceWorker || typeof windowObj.addEventListener !== 'function') {
    return;
  }

  if (windowObj[SW_SETUP_FLAG]) {
    return;
  }
  windowObj[SW_SETUP_FLAG] = true;

  windowObj.addEventListener('load', async () => {
    if (isLocalServiceWorkerHost(windowObj.location?.hostname)) {
      await clearLocalRegistrations({ navigatorObj, cachesObj, consoleObj });
      return;
    }

    await registerProductionServiceWorker({ navigatorObj, consoleObj });
  });
}

export function resetServiceWorkerSetupFlag(windowObj = typeof window !== 'undefined' ? window : undefined) {
  if (!windowObj) return;
  delete windowObj[SW_SETUP_FLAG];
}
