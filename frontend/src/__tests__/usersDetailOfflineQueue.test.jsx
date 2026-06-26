import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import UsersDetail from '../pages/UsersDetail';

jest.mock('../api/apiConfig', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

jest.mock('../utils/notify', () => jest.fn());

const api = jest.requireMock('../api/apiConfig').default;
const notify = jest.requireMock('../utils/notify');

function createStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: jest.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: jest.fn((key, value) => store.set(key, value)),
    removeItem: jest.fn((key) => store.delete(key)),
  };
}

function getFieldInput(labelText) {
  const label = screen.getByText(labelText);
  return label.parentElement.querySelector('input, select, textarea');
}

describe('UsersDetail offline queue', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    notify.mockReset();
    Object.defineProperty(window, 'localStorage', {
      value: createStorage({
        '@FullEduca:id': '7',
        '@FullEduca:perfil': 'admin',
        '@FullEduca:user': 'admin@exemplo.local',
      }),
      writable: true,
    });
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
  });

  test('enfileira a edição do próprio usuário quando offline e sem alterar campos restritos', async () => {
    api.get.mockResolvedValue({ data: { id: '7', login: 'admin@exemplo.local', perfil: 'admin', ativo: true } });
    api.put.mockRejectedValue({ code: 'OFFLINE_WRITE_BLOCKED' });

    render(
      <MemoryRouter initialEntries={['/users/7']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/users/:id" element={<UsersDetail />} />
          <Route path="/users" element={<div>Users Mock</div>} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByDisplayValue('admin@exemplo.local');
    fireEvent.change(getFieldInput('E-mail'), { target: { value: 'admin.offline@exemplo.local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('Alteração salva localmente'), expect.any(Object));
    });

    const queued = JSON.parse(window.localStorage.getItem('@FullEduca:offline:mutations'));
    expect(queued).toHaveLength(1);
    expect(queued[0].url).toBe('/usuarios/me');
    expect(queued[0].data.login).toBe('admin.offline@exemplo.local');
  });
});
