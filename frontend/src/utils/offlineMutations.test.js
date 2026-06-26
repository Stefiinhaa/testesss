import {
  clearOfflineMutations,
  enqueueOfflineMutation,
  flushOfflineMutations,
  getLatestOfflineMutation,
  readOfflineMutations,
  writeOfflineMutations,
} from './offlineMutations';

function createStorage() {
  const store = new Map();
  return {
    getItem: jest.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: jest.fn((key, value) => store.set(key, value)),
    removeItem: jest.fn((key) => store.delete(key)),
    clear: jest.fn(() => store.clear()),
  };
}

describe('offlineMutations', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage(),
      writable: true,
    });
    writeOfflineMutations([]);
  });

  test('substitui a mutação pendente anterior do mesmo endpoint', () => {
    enqueueOfflineMutation({ url: '/usuarios/me', method: 'put', data: { login: 'old@example.com' } });
    enqueueOfflineMutation({ url: '/usuarios/me', method: 'put', data: { login: 'new@example.com' } });

    const entries = readOfflineMutations();
    expect(entries).toHaveLength(1);
    expect(entries[0].data.login).toBe('new@example.com');
    expect(getLatestOfflineMutation('/usuarios/me')?.data.login).toBe('new@example.com');
  });

  test('remove da fila as mutações sincronizadas com sucesso', async () => {
    enqueueOfflineMutation({ url: '/usuarios/me', method: 'put', data: { login: 'user@example.com' } });

    const result = await flushOfflineMutations(async () => ({ ok: true }));

    expect(result.synced).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(readOfflineMutations()).toHaveLength(0);
  });

  test('permite limpar toda a fila pendente no logout', () => {
    enqueueOfflineMutation({ url: '/usuarios/me', method: 'put', data: { login: 'user@example.com' } });
    enqueueOfflineMutation({ url: '/usuarios/7', method: 'delete', data: null });

    clearOfflineMutations();

    expect(readOfflineMutations()).toHaveLength(0);
  });
});
