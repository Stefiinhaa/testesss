import React, { act } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import App from '../App';
import AppLayout from '../components/AppLayout';

jest.mock('../utils/notify', () => jest.fn());

jest.mock('../api/apiConfig', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    request: jest.fn(),
  },
}));

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
jest.mock('../pages/Login', () => () => <div>Login Mock</div>);

const { authApi } = jest.requireMock('../api/authApi');

function createStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: jest.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: jest.fn((key, value) => store.set(key, value)),
    removeItem: jest.fn((key) => store.delete(key)),
  };
}

function setMatchMedia(matches = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(() => ({
      matches,
      media: '(max-width: 900px), (max-height: 640px)',
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

describe('Normalização do perfil de sessão', () => {
  beforeEach(() => {
    authApi.getSession.mockReset();
    authApi.logout.mockReset();
    setMatchMedia(false);
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
  });

  test('trata "administrador" como admin no layout', () => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage({
        '@FullEduca:perfil': ' Administrador ',
        '@FullEduca:user': 'admin@exemplo.local',
      }),
      writable: true,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<div>Dashboard Child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('sidebar-menu')).toHaveTextContent('Usuários');
    expect(screen.queryByText('Meu Perfil')).not.toBeInTheDocument();
    expect(screen.getByText('Operação administrativa')).toBeInTheDocument();
  });

  test('permite rota administrativa quando o perfil persistido veio como "administrador"', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage({
        '@FullEduca:perfil': 'administrador',
        '@FullEduca:user': 'admin@exemplo.local',
        '@FullEduca:login': 'admin@exemplo.local',
      }),
      writable: true,
    });
    authApi.getSession.mockRejectedValue(new Error('offline'));
    window.history.pushState({}, '', '/users');

    render(<App />);

    expect(await screen.findByText('Users Mock')).toBeInTheDocument();
    expect(screen.queryByText('Login Mock')).not.toBeInTheDocument();
  });

  test('redireciona perfil aluno persistido ao tentar abrir rota administrativa', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage({
        '@FullEduca:perfil': ' aluno ',
        '@FullEduca:user': 'aluno@exemplo.local',
        '@FullEduca:login': 'aluno@exemplo.local',
      }),
      writable: true,
    });
    authApi.getSession.mockRejectedValue(new Error('offline'));
    window.history.pushState({}, '', '/users');

    render(<App />);

    expect(await screen.findByText('Dashboard Mock')).toBeInTheDocument();
    expect(screen.queryByText('Login Mock')).not.toBeInTheDocument();
    expect(screen.getByText('Meu Perfil')).toBeInTheDocument();
  });

  test('remove a tela protegida restaurada do histórico após logout', async () => {
    const storage = createStorage({
      '@FullEduca:perfil': 'admin',
      '@FullEduca:user': 'admin@exemplo.local',
      '@FullEduca:login': 'admin@exemplo.local',
    });
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
    });
    authApi.getSession.mockResolvedValue({ id: '7', user: 'admin@exemplo.local', perfil: 'admin' });
    window.history.pushState({}, '', '/users');

    render(<App />);

    expect(await screen.findByText('Users Mock')).toBeInTheDocument();

    storage.removeItem('@FullEduca:perfil');
    storage.removeItem('@FullEduca:user');
    storage.removeItem('@FullEduca:login');
    await act(async () => {
      window.dispatchEvent(new Event('pageshow'));
    });

    await waitFor(() => {
      expect(screen.getByText('Login Mock')).toBeInTheDocument();
    });
  });

  test('abre a tela de login ao acessar a raiz sem sessão ativa', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage(),
      writable: true,
    });
    authApi.getSession.mockRejectedValue(new Error('unauthorized'));
    window.history.pushState({}, '', '/');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Login Mock')).toBeInTheDocument();
    });
  });

  test('mantem /login na tela de login sem sessão ativa', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage(),
      writable: true,
    });
    authApi.getSession.mockRejectedValue(new Error('unauthorized'));
    window.history.pushState({}, '', '/login');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Login Mock')).toBeInTheDocument();
    });
  });

  test('redireciona rota interna para login quando não há sessão válida', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage(),
      writable: true,
    });
    authApi.getSession.mockRejectedValue(new Error('unauthorized'));
    window.history.pushState({}, '', '/dashboard');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Login Mock')).toBeInTheDocument();
    });
    expect(screen.queryByText('Dashboard Mock')).not.toBeInTheDocument();
  });

  test('ignora hint local stale em rota interna quando o navegador está online', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(window, 'localStorage', {
      value: createStorage({
        '@FullEduca:perfil': 'admin',
        '@FullEduca:user': 'admin@exemplo.local',
        '@FullEduca:login': 'admin@exemplo.local',
      }),
      writable: true,
    });
    authApi.getSession.mockRejectedValue(new Error('unauthorized'));
    window.history.pushState({}, '', '/users');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Login Mock')).toBeInTheDocument();
    });
    expect(screen.queryByText('Users Mock')).not.toBeInTheDocument();
  });

  test('redireciona /login para dashboard quando a sessão já está ativa', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage({
        '@FullEduca:perfil': 'admin',
        '@FullEduca:user': 'admin@exemplo.local',
        '@FullEduca:login': 'admin@exemplo.local',
      }),
      writable: true,
    });
    authApi.getSession.mockResolvedValue({ id: '7', user: 'admin@exemplo.local', perfil: 'admin' });
    window.history.pushState({}, '', '/login');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard Mock')).toBeInTheDocument();
    });
    expect(screen.queryByText('Login Mock')).not.toBeInTheDocument();
  });
});
