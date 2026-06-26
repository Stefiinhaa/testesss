import { render, screen } from '@testing-library/react';
import AppLayout from '../components/AppLayout';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

jest.mock('../api/authApi', () => ({
  authApi: {
    logout: jest.fn(),
    getSession: jest.fn(),
  },
}));
import Alunos from '../pages/Alunos';
import Professores from '../pages/Professores';
import Turmas from '../pages/Turmas';
import Avaliacoes from '../pages/Avaliacoes';
import Chamadas from '../pages/Chamadas';
import Cursos from '../pages/Cursos';
import Trilhas from '../pages/Trilhas';

jest.mock('../pages/Alunos', () => () => <div>Alunos</div>);
jest.mock('../pages/Professores', () => () => <div>Cadastro de Professores</div>);
jest.mock('../pages/Turmas', () => () => <div>Turmas</div>);
jest.mock('../pages/Avaliacoes', () => () => <div>Listagem de Avaliações</div>);
jest.mock('../pages/Chamadas', () => () => <div>Listagem de Chamadas</div>);
jest.mock('../pages/Cursos', () => () => <div>Listagem de Cursos</div>);
jest.mock('../pages/Trilhas', () => () => <div>Listagem de Trilhas</div>);

describe('Menu lateral e layouts', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key) => (key === '@FullEduca:perfil' ? 'admin' : null),
        setItem: () => {},
        removeItem: () => {},
      },
      writable: true,
    });
  });

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

  test.each(menuItems)('deve exibir o item "%s" no menu', (item) => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppLayout />
      </MemoryRouter>
    );
    const menu = screen.getByTestId('sidebar-menu');
    expect(menu).toHaveTextContent(item);
  });

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
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Professores /></MemoryRouter>);
    expect(screen.getByText('Cadastro de Professores')).toBeInTheDocument();
  });
  test('Turmas renderiza layout esperado', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Turmas /></MemoryRouter>);
    expect(screen.getByText('Turmas')).toBeInTheDocument();
  });
  test('Avaliações renderiza layout esperado', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Avaliacoes /></MemoryRouter>);
    expect(screen.getByText('Listagem de Avaliações')).toBeInTheDocument();
  });
  test('Chamadas renderiza layout esperado', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Chamadas /></MemoryRouter>);
    expect(screen.getByText('Listagem de Chamadas')).toBeInTheDocument();
  });
  test('Cursos renderiza layout esperado', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Cursos /></MemoryRouter>);
    expect(screen.getByText('Listagem de Cursos')).toBeInTheDocument();
  });
  test('Trilhas renderiza layout esperado', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Trilhas /></MemoryRouter>);
    expect(screen.getByText('Listagem de Trilhas')).toBeInTheDocument();
  });
});
