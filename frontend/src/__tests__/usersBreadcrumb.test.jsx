import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UsersPage from '../pages/Users';

jest.mock('../api/apiConfig', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../utils/notify', () => jest.fn());

const api = jest.requireMock('../api/apiConfig').default;
const getDrawerControl = (labelText) => {
  const labelNode = screen.getAllByText(labelText).find((node) => node.closest('.list-filter-drawer'));
  const field = labelNode.closest('.field');
  return field.querySelector('input, select, textarea');
};

describe('Users breadcrumb', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.put.mockReset();
    api.delete.mockReset();
  });

  test('Usuários mantém apenas o breadcrumb da entidade', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/usuarios/filter-options') {
        return { data: { options: { perfil: ['aluno'], ativo: ['true'] } } };
      }
      if (url === '/usuarios/') {
        return {
          data: {
            items: [{ id: 1, login: 'maria', perfil: 'aluno', ativo: true }],
            total: 1,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UsersPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/usuarios/', expect.any(Object));
    });
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Usuários');
    expect(screen.queryByText('Cadastro de Usuários')).not.toBeInTheDocument();
  });

  test('Usuários reaproveita valores carregados quando faltam opções de filtro', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/usuarios/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/usuarios/') {
        return {
          data: {
            items: [{ id: 1, login: 'maria', perfil: 'aluno', ativo: true }],
            total: 1,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UsersPage />
      </MemoryRouter>
    );

    await screen.findByText('maria');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    const drawer = screen.getByTestId('users-filter-drawer');
    fireEvent.click(within(drawer).getByRole('button', { name: /Perfil/i }));

    await waitFor(() => {
      expect(within(drawer).getByRole('checkbox', { name: /aluno/i })).toBeInTheDocument();
    });
  });

  test('Usuários expõe no drawer todos os critérios do formulário editável', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/usuarios/filter-options') {
        return { data: { options: { login: ['maria@escola.com'], perfil: ['aluno'], id_aluno: ['ALN-1'], ativo: ['Ativo', 'Inativo'] } } };
      }
      if (url === '/usuarios/') {
        return {
          data: {
            items: [{ id: 1, login: 'maria@escola.com', perfil: 'aluno', id_aluno: 'ALN-1', ativo: true }],
            total: 1,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UsersPage />
      </MemoryRouter>
    );

    await screen.findByText('maria@escola.com');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    const drawer = screen.getByTestId('users-filter-drawer');

    expect(within(drawer).getByRole('button', { name: /E-mail/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Perfil/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /IdAluno/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Status/i })).toBeInTheDocument();
  });
});
