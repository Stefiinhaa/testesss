import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import App from '../App';
import AppLayout from '../components/AppLayout';

jest.mock('../utils/notify', () => jest.fn());

jest.mock('../api/authApi', () => ({
  authApi: {
    getSession: jest.fn(),
    logout: jest.fn(),
  },
}));

jest.mock('../pages/Dashboard', () => () => <div>Dashboard Mock</div>);
jest.mock('../pages/Users', () => () => <div>Users Mock</div>);
jest.mock('../pages/UsersDetail', () => () => <div>Users Detail Mock</div>);
jest.mock('../pages/Profile', () => () => <div>Profile Mock</div>);
jest.mock('../pages/UserAccount', () => () => <div>User Account Mock</div>);
jest.mock('../pages/AdminMenu', () => () => <div>Admin Menu Mock</div>);
jest.mock('../pages/ImportarDados', () => () => <div>Importar Dados Mock</div>);
jest.mock('../pages/Alunos', () => () => <div>Alunos Mock</div>);
jest.mock('../pages/Professores', () => () => <div>Professores Mock</div>);
jest.mock('../pages/Turmas', () => () => <div>Turmas Mock</div>);
jest.mock('../pages/Avaliacoes', () => () => <div>Avaliacoes Mock</div>);
jest.mock('../pages/Chamadas', () => () => <div>Chamadas Mock</div>);
jest.mock('../pages/Cursos', () => () => <div>Cursos Mock</div>);
jest.mock('../pages/Interesses', () => () => <div>Interesses Mock</div>);
jest.mock('../pages/AlunosInteresses', () => () => <div>Alunos Interesses Mock</div>);

const { authApi } = jest.requireMock('../api/authApi');

const setNavigatorOnline = (online) => {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  });
};

const setLocalStorage = (values = {}) => {
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: jest.fn((key) => values[key] ?? null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
    writable: true,
  });
};

const setMatchMedia = () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(() => ({
      matches: false,
      media: '(max-width: 900px), (max-height: 640px)',
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
};

describe('Sessão offline autenticada', () => {
  beforeEach(() => {
    authApi.getSession.mockReset();
    authApi.logout.mockReset();
    setMatchMedia();
  });

  test('reaproveita a sessão persistida e abre o dashboard quando o bootstrap falha offline', async () => {
    setNavigatorOnline(false);
    setLocalStorage({
      '@FullEduca:perfil': 'admin',
      '@FullEduca:user': 'admin@exemplo.local',
      '@FullEduca:login': 'admin@exemplo.local',
    });
    authApi.getSession.mockRejectedValue(new Error('offline'));
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(await screen.findByText('Dashboard Mock')).toBeInTheDocument();
    expect(screen.getByText('Modo offline em leitura')).toBeInTheDocument();
  });

  test('layout desabilita submit e informa política de leitura quando offline', async () => {
    setNavigatorOnline(false);
    setLocalStorage({
      '@FullEduca:perfil': 'admin',
      '@FullEduca:user': 'admin@exemplo.local',
      '@FullEduca:login': 'admin@exemplo.local',
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              path="/dashboard"
              element={(
                <form>
                  <button type="submit">Salvar</button>
                </form>
              )}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    });

    expect(screen.getByText(/alterações, uploads e novos cadastros ficam bloqueados/i)).toBeInTheDocument();
  });
});
