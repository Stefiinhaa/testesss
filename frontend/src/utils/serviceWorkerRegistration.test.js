import {
  isLocalServiceWorkerHost,
  resetServiceWorkerSetupFlag,
  setupServiceWorker,
} from './serviceWorkerRegistration';

describe('serviceWorkerRegistration', () => {
  afterEach(() => {
    resetServiceWorkerSetupFlag(window);
  });

  function createWindowMock(hostname) {
    const listeners = new Map();
    return {
      location: { hostname },
      addEventListener: jest.fn((eventName, handler) => {
        listeners.set(eventName, handler);
      }),
      dispatchEvent(event) {
        const handler = listeners.get(event.type);
        if (handler) {
          return handler(event);
        }
        return undefined;
      },
    };
  }

  test('identifica localhost como ambiente local', () => {
    expect(isLocalServiceWorkerHost('localhost')).toBe(true);
    expect(isLocalServiceWorkerHost('127.0.0.1')).toBe(true);
    expect(isLocalServiceWorkerHost('fulleduca.fulltime.com.br')).toBe(false);
  });

  test('remove service workers e caches em runtime local', async () => {
    const windowObj = createWindowMock('localhost');
    const unregister = jest.fn().mockResolvedValue(true);
    const navigatorObj = {
      serviceWorker: {
        getRegistrations: jest.fn().mockResolvedValue([{ unregister }]),
        register: jest.fn(),
      },
    };
    const cachesObj = {
      keys: jest.fn().mockResolvedValue(['a', 'b']),
      delete: jest.fn().mockResolvedValue(true),
    };

    setupServiceWorker({ windowObj, navigatorObj, cachesObj, consoleObj: console });
    await windowObj.dispatchEvent(new Event('load'));

    await Promise.resolve();

    expect(navigatorObj.serviceWorker.getRegistrations).toHaveBeenCalled();
    expect(unregister).toHaveBeenCalled();
    expect(cachesObj.keys).toHaveBeenCalled();
    expect(cachesObj.delete).toHaveBeenCalledTimes(2);
    expect(navigatorObj.serviceWorker.register).not.toHaveBeenCalled();
  });

  test('registra o service worker uma única vez em produção', async () => {
    const windowObj = createWindowMock('fulleduca.fulltime.com.br');
    const navigatorObj = {
      serviceWorker: {
        getRegistrations: jest.fn(),
        register: jest.fn().mockResolvedValue({}),
      },
    };

    setupServiceWorker({ windowObj, navigatorObj, cachesObj: undefined, consoleObj: console });
    setupServiceWorker({ windowObj, navigatorObj, cachesObj: undefined, consoleObj: console });
    await windowObj.dispatchEvent(new Event('load'));

    await Promise.resolve();

    expect(navigatorObj.serviceWorker.register).toHaveBeenCalledTimes(1);
    expect(navigatorObj.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
  });
});
