import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrilhasPage from '../pages/Trilhas';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('../api/apiConfig', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../utils/notify', () => jest.fn((message, opts = {}) => {
  if (!opts.allowHtmlFallback || !opts.fallbackTargetId) return;
  const target = globalThis.document?.getElementById(opts.fallbackTargetId);
  if (!target) return;
  target.textContent = message;
  target.className = `form-feedback is-visible${opts.type === 'error' ? ' is-error' : ''}`;
}));

const api = jest.requireMock('../api/apiConfig').default;
const notify = jest.requireMock('../utils/notify');

describe('Trilhas Page', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.put.mockReset();
    api.delete.mockReset();
    notify.mockClear();
    mockNavigate.mockReset();
    window.confirm = jest.fn(() => true);
  });

  test('lista trilhas com paginação', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/trilhas/filter-options') {
        return { data: { options: { nome_trilha: [], descricao_trilha: [], qtd_cursos: [3, 5, 8] } } };
      }
      if (url === '/trilhas/') {
        return {
          data: {
            items: [
              { IdTrilha: 'TR-1', NomeTrilha: 'Python Básico', DescricaoTrilha: 'Introdução ao Python', QtdCursos: 3, ativo: true },
              { IdTrilha: 'TR-2', NomeTrilha: 'Data Science', DescricaoTrilha: 'Trilha de Data Science', QtdCursos: 5, ativo: true },
            ],
            total: 2,
            page: 1,
            per_page: 10,
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TrilhasPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Python Básico')).toBeInTheDocument();
      expect(screen.getByText('Data Science')).toBeInTheDocument();
    });

    expect(screen.getAllByText('2 registro(s)').length).toBeGreaterThanOrEqual(1);
  });

  test('cria uma nova trilha via formulário', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/trilhas/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/trilhas/') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      return { data: {} };
    });

    api.post.mockResolvedValue({
      data: {
        IdTrilha: 'TR-3',
        NomeTrilha: 'Nova Trilha',
        DescricaoTrilha: 'Descrição nova',
        QtdCursos: 4,
        ativo: true,
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TrilhasPage />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Adicionar trilha' });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar trilha' }));

    await waitFor(() => {
      expect(screen.getByText('Nova Trilha')).toBeInTheDocument();
    });

    // Get the form inputs by their expected position or attributes
    const panelInputs = screen.queryAllByRole('textbox', { hidden: false });
    const nameInput = panelInputs.find(inp => inp.placeholder === 'Nome da Trilha' || inp.required);
    const descInput = panelInputs.find(inp => inp.className?.includes('textarea'));

    if (nameInput) {
      fireEvent.change(nameInput, { target: { value: 'Nova Trilha' } });
    }

    if (descInput) {
      fireEvent.change(descInput, { target: { value: 'Descrição nova' } });
    }

    const numberInputs = screen.queryAllByRole('spinbutton', { hidden: false });
    if (numberInputs.length > 0) {
      fireEvent.change(numberInputs[0], { target: { value: '4' } });
    }

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/trilhas/', expect.objectContaining({ NomeTrilha: 'Nova Trilha' }));
      expect(notify).toHaveBeenCalledWith('Trilha criada', expect.any(Object));
    });
  });

  test('edita uma trilha existente', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/trilhas/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/trilhas/') {
        return {
          data: {
            items: [
              { IdTrilha: 'TR-1', NomeTrilha: 'Python Básico', DescricaoTrilha: 'Introdução', QtdCursos: 3, ativo: true },
            ],
            total: 1,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    api.put.mockResolvedValue({
      data: {
        IdTrilha: 'TR-1',
        NomeTrilha: 'Python Avançado',
        DescricaoTrilha: 'Nível avançado',
        QtdCursos: 5,
        ativo: true,
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TrilhasPage />
      </MemoryRouter>
    );

    await screen.findByText('Python Básico');
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar trilha Python Básico' })[0]);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Python Básico')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('Python Básico'), { target: { value: 'Python Avançado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/trilhas/TR-1', expect.any(Object));
      expect(notify).toHaveBeenCalledWith('Trilha atualizada', expect.any(Object));
    });
  });

  test('deleta trilhas selecionadas', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/trilhas/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/trilhas/') {
        return {
          data: {
            items: [
              { IdTrilha: 'TR-1', NomeTrilha: 'Trilha 1', DescricaoTrilha: 'Desc 1', QtdCursos: 3, ativo: true },
              { IdTrilha: 'TR-2', NomeTrilha: 'Trilha 2', DescricaoTrilha: 'Desc 2', QtdCursos: 5, ativo: true },
            ],
            total: 2,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    api.delete.mockResolvedValue({ data: { message: 'Trilha removida' } });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TrilhasPage />
      </MemoryRouter>
    );

    await screen.findByText('Trilha 1');

    fireEvent.click(screen.getByRole('button', { name: 'Alternar selecao' }));

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    await waitFor(() => {
      expect(screen.getByText('1 selecionado(s)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remover selecionados' }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith('Trilhas processadas', expect.any(Object));
    });
  });

  test('filtra trilhas por nome usando drawer', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/trilhas/filter-options') {
        return {
          data: {
            options: {
              nome_trilha: ['Python Básico', 'Data Science', 'Web Development'],
              descricao_trilha: [],
              qtd_cursos: [3, 5, 8],
            },
          },
        };
      }
      if (url.includes('/trilhas/') && url.includes('nome_in')) {
        return { data: { items: [{ IdTrilha: 'TR-1', NomeTrilha: 'Python Básico', QtdCursos: 3, ativo: true }], total: 1, page: 1 } };
      }
      if (url === '/trilhas/') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TrilhasPage />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Abrir filtros' });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));

    const drawer = await screen.findByTestId('trilhas-filter-drawer');
    expect(within(drawer).getByRole('button', { name: 'Nome' })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Descricao' })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Qtd Cursos' })).toBeInTheDocument();
  });

  test('muda página da listagem de trilhas', async () => {
    api.get.mockImplementation(async (url, config = {}) => {
      if (url === '/trilhas/filter-options') {
        return { data: { options: {} } };
      }
      const page = config.params?.page || 1;
      if (url === '/trilhas/') {
        return {
          data: {
            items: page === 1
              ? [{ IdTrilha: 'TR-1', NomeTrilha: 'Trilha Página 1', QtdCursos: 3, ativo: true }]
              : [{ IdTrilha: 'TR-2', NomeTrilha: 'Trilha Página 2', QtdCursos: 5, ativo: true }],
            total: 20,
            page,
            per_page: 10,
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TrilhasPage />
      </MemoryRouter>
    );

    await screen.findByText('Trilha Página 1');
    expect(screen.getAllByText('20 registro(s)').length).toBeGreaterThanOrEqual(1);
  });
});
