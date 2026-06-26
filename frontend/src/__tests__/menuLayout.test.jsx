import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AppLayout from '../components/AppLayout';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

jest.mock('../utils/notify', () => jest.fn());

jest.mock('../api/apiConfig', () => ({
  __esModule: true,
  default: {
    request: jest.fn(),
  },
}));

jest.mock('../api/authApi', () => ({
  authApi: {
    logout: jest.fn(),
    getSession: jest.fn(),
  },
}));

const mockNavigate = jest.fn();
const api = jest.requireMock('../api/apiConfig').default;
const notify = jest.requireMock('../utils/notify');

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('../pages/Alunos', () => () => <div>Alunos</div>);
jest.mock('../pages/Professores', () => () => <div>Cadastro de Professores</div>);
jest.mock('../pages/Turmas', () => () => <div>Turmas</div>);
jest.mock('../pages/Avaliacoes', () => () => <div>Listagem de Avaliações</div>);
jest.mock('../pages/Chamadas', () => () => <div>Listagem de Chamadas</div>);
jest.mock('../pages/Cursos', () => () => <div>Listagem de Cursos</div>);
jest.mock('../pages/Trilhas', () => () => <div>Listagem de Trilhas</div>);

const menuItems = [
  'Dashboard',
  'Alunos',
  'Matricular Cursos',
  'Frequência',
  'Professores',
  'Avaliações',
  'Turmas',
  'Usuários',
];

const setMatchMedia = (matches) => {
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
};

function createStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: jest.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: jest.fn((key, value) => store.set(key, value)),
    removeItem: jest.fn((key) => store.delete(key)),
  };
}

describe('Menu lateral', () => {
  beforeEach(() => {
    setMatchMedia(false);
    mockNavigate.mockReset();
    api.request.mockReset();
    notify.mockReset();
    Object.defineProperty(window, 'localStorage', {
      value: createStorage({
        '@FullEduca:perfil': 'admin',
        '@FullEduca:user': 'admin@exemplo.local',
      }),
      writable: true,
    });
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  test.each(menuItems)('deve exibir o item "%s" no menu', (item) => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppLayout />
      </MemoryRouter>
    );
    const menu = screen.getByTestId('sidebar-menu');
    expect(menu).toHaveTextContent(item);
  });

  test('deve exibir Interesses e Trilhas no menu', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppLayout />
      </MemoryRouter>
    );
    const menu = screen.getByTestId('sidebar-menu');
    const labels = Array.from(menu.querySelectorAll('.sidebar-link .sidebar-text')).map((node) => node.textContent?.trim());
    expect(labels).toContain('Interesses');
    expect(labels).toContain('Trilhas');
  });

  test('deve manter o botão Sair visível e permitir recolher o menu', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppLayout />
      </MemoryRouter>
    );
    expect(screen.getAllByText('Sair').length).toBeGreaterThan(0);
    const toggles = screen.getAllByRole('button', { name: 'Recolher menu lateral' });
    expect(toggles).toHaveLength(1);
    expect(document.querySelector('.app-topbar [aria-label="Recolher menu lateral"]')).toBeNull();
    const toggle = document.querySelector('.sidebar .sidebar-toggle');
    fireEvent.click(toggle);
    const sidebar = document.querySelector('.sidebar');
    await waitFor(() => {
      expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    });

    expect(screen.getByRole('button', { name: 'Sair' })).toHaveClass('logout-btn');
  });

  test('atalho do topo abre o formulário do usuário logado', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppLayout />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir meu usuário' }));

    expect(mockNavigate).toHaveBeenCalledWith('/users?editMe=1');
  });

  test('sincroniza alterações pendentes pelo topo quando volta a ficar online', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage({
        '@FullEduca:perfil': 'admin',
        '@FullEduca:user': 'admin@exemplo.local',
        '@FullEduca:offline:mutations': JSON.stringify([
          {
            id: 'pending-1',
            url: '/usuarios/me',
            method: 'put',
            data: { login: 'admin@exemplo.local' },
            createdAt: '2026-04-08T10:00:00.000Z',
          },
        ]),
      }),
      writable: true,
    });
    api.request.mockResolvedValue({ data: { ok: true } });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppLayout />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar dados' }));

    await waitFor(() => {
      expect(api.request).toHaveBeenCalledWith({
        url: '/usuarios/me',
        method: 'put',
        data: { login: 'admin@exemplo.local' },
      });
    });
    expect(notify).toHaveBeenCalledWith('Alterações locais sincronizadas com sucesso.', expect.any(Object));
    consoleErrorSpy.mockRestore();
  });

  test('mantém navegação expandida em viewport compacta', async () => {
    setMatchMedia(true);
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppLayout />
      </MemoryRouter>
    );

    const sidebar = document.querySelector('.sidebar');
    expect(sidebar).toHaveAttribute('data-collapsed', 'false');

    expect(document.querySelector('.sidebar .sidebar-toggle')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recolher menu lateral' })).toBeNull();

    await waitFor(() => {
      expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    });
  });

  test('expõe controles para rolar o menu em viewport compacta', async () => {
    setMatchMedia(true);
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppLayout />
      </MemoryRouter>
    );

    const menu = screen.getByTestId('sidebar-menu');
    menu.scrollBy = jest.fn();

    fireEvent.click(screen.getByRole('button', { name: 'Rolar menu para a esquerda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rolar menu para a direita' }));

    await waitFor(() => {
      expect(menu.scrollBy).toHaveBeenCalledTimes(2);
    });
  });
});

// Para cada página, pode-se criar testes de renderização básica:
import Alunos from '../pages/Alunos';
import Professores from '../pages/Professores';
import Turmas from '../pages/Turmas';
import Avaliacoes from '../pages/Avaliacoes';
import Chamadas from '../pages/Chamadas';
import Cursos from '../pages/Cursos';

describe('Layout das páginas do menu', () => {
  test('Alunos renderiza layout esperado', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <React.StrictMode>
          <Alunos />
        </React.StrictMode>
      </MemoryRouter>
    );
    expect(screen.getByText('Alunos')).toBeInTheDocument();
  });
  test('Professores renderiza layout esperado', () => {
    render(<Professores />);
    expect(screen.getByText('Cadastro de Professores')).toBeInTheDocument();
  });
  test('Turmas renderiza layout esperado', () => {
    render(<Turmas />);
    expect(screen.getByText('Turmas')).toBeInTheDocument();
  });
  test('Avaliações renderiza layout esperado', () => {
    render(<Avaliacoes />);
    expect(screen.getByText('Listagem de Avaliações')).toBeInTheDocument();
  });
  test('Chamadas renderiza layout esperado', () => {
    render(<Chamadas />);
    expect(screen.getByText('Listagem de Chamadas')).toBeInTheDocument();
  });
  test('Cursos renderiza layout esperado', () => {
    render(<Cursos />);
    expect(screen.getByText('Listagem de Cursos')).toBeInTheDocument();
  });
});
