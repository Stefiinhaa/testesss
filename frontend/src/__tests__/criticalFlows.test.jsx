import React from 'react';
import { render, screen } from '@testing-library/react';

import App from '../App';

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
jest.mock('../pages/ImportarDados', () => () => <div>Importar Dados Mock</div>);
jest.mock('../pages/Alunos', () => () => <div>Alunos Mock</div>);
jest.mock('../pages/Professores', () => () => <div>Professores Mock</div>);
jest.mock('../pages/Turmas', () => () => <div>Turmas Mock</div>);
jest.mock('../pages/Avaliacoes', () => () => <div>Avaliacoes Mock</div>);
jest.mock('../pages/Chamadas', () => () => <div>Chamadas Mock</div>);
jest.mock('../pages/Cursos', () => () => <div>Cursos Mock</div>);
jest.mock('../pages/Interesses', () => () => <div>Interesses Mock</div>);
jest.mock('../pages/Trilhas', () => () => <div>Trilhas Mock</div>);
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

describe('Fluxos críticos da aplicação', () => {
  beforeEach(() => {
    authApi.getSession.mockReset();
    authApi.logout.mockReset();
    setMatchMedia(false);
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
  });

  test('mantém rota de importação protegida para aluno offline com sessão persistida', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage({
        '@FullEduca:perfil': 'aluno',
        '@FullEduca:user': 'aluno@exemplo.local',
        '@FullEduca:login': 'aluno@exemplo.local',
      }),
      writable: true,
    });
    authApi.getSession.mockRejectedValue(new Error('offline'));
    window.history.pushState({}, '', '/importar-dados');

    render(<App />);

    expect(await screen.findByText('Dashboard Mock')).toBeInTheDocument();
    expect(screen.queryByText('Importar Dados Mock')).not.toBeInTheDocument();
    expect(screen.getByText('Meu Perfil')).toBeInTheDocument();
  });

  test('abre a rota de importação para admin com sessão persistida normalizada', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage({
        '@FullEduca:perfil': 'Administrador',
        '@FullEduca:user': 'admin@exemplo.local',
        '@FullEduca:login': 'admin@exemplo.local',
      }),
      writable: true,
    });
    authApi.getSession.mockRejectedValue(new Error('offline'));
    window.history.pushState({}, '', '/importar-dados');

    render(<App />);

    expect(await screen.findByText('Importar Dados Mock')).toBeInTheDocument();
  });
});
