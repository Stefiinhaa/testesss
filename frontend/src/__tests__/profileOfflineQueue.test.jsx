import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Profile from '../pages/Profile';
import UserAccount from '../pages/UserAccount';

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
    clear: jest.fn(() => store.clear()),
  };
}

function getFieldInput(labelText) {
  const label = screen.getByText(labelText);
  return label.parentElement.querySelector('input, select, textarea');
}

describe('Fila offline de perfil', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    notify.mockReset();
    Object.defineProperty(window, 'localStorage', {
      value: createStorage(),
      writable: true,
    });
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
  });

  test('UserAccount salva alteração local quando a escrita está bloqueada offline', async () => {
    api.get.mockResolvedValue({ data: { login: 'user@example.com' } });
    api.put.mockRejectedValue({ code: 'OFFLINE_WRITE_BLOCKED' });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UserAccount />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('user@example.com');
    fireEvent.change(getFieldInput('E-mail'), { target: { value: 'novo@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Usuário' }));

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('Alteração salva localmente'), expect.any(Object));
    });

    const queued = JSON.parse(window.localStorage.getItem('@FullEduca:offline:mutations'));
    expect(queued).toHaveLength(1);
    expect(queued[0].url).toBe('/usuarios/me');
    expect(queued[0].data.login).toBe('novo@example.com');
  });

  test('Profile salva alteração local quando a escrita está bloqueada offline', async () => {
    api.get.mockResolvedValue({ data: { NomeAluno: 'Ana', Email: 'ana@example.com', Estado: 'SP' } });
    api.put.mockRejectedValue({ code: 'OFFLINE_WRITE_BLOCKED' });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Profile />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Ana');
    fireEvent.change(getFieldInput('Cidade Naturalidade'), { target: { value: 'Campinas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Meu Perfil' }));

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('Perfil salvo localmente'), expect.any(Object));
    });

    const queued = JSON.parse(window.localStorage.getItem('@FullEduca:offline:mutations'));
    expect(queued).toHaveLength(1);
    expect(queued[0].url).toBe('/alunos/me');
    expect(queued[0].data.CidadeNaturalidade).toBe('Campinas');
  });
});
