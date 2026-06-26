import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import AlunosPage from '../pages/Alunos';
import AvaliacoesPage from '../pages/Avaliacoes';
import ChamadasPage from '../pages/Chamadas';
import CursosPage from '../pages/Cursos';
import InteressesPage from '../pages/Interesses';
import ProfessoresPage from '../pages/Professores';
import TrilhasPage from '../pages/Trilhas';
import TurmasPage from '../pages/Turmas';
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
const notify = jest.requireMock('../utils/notify');

const renderWithRouter = (element, initialEntries = ['/']) => render(
  <MemoryRouter initialEntries={initialEntries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {element}
  </MemoryRouter>
);

describe('Regressões visuais de entidades', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.put.mockReset();
    api.delete.mockReset();
    notify.mockReset();
    window.confirm = jest.fn(() => true);
    URL.createObjectURL = jest.fn(() => 'blob:preview');
    URL.revokeObjectURL = jest.fn();
  });

  test('alunos mostra erro explícito quando a listagem falha por resposta inválida da API', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos') {
        const err = new Error('Resposta inesperada da API');
        err.code = 'UNEXPECTED_HTML_RESPONSE';
        throw err;
      }
      if (url === '/alunos/filter-options') return { data: { options: {} } };
      if (url === '/alunos/form-options') return { data: { turnos: ['Manhã'], turmas: [], situacoes: ['Ativo'] } };
      if (url === '/chamadas/form-options') return { data: { aulas: [], matriculas: [], presencas: ['Presente'] } };
      if (url === '/trilhas/' || url === '/interesses/' || url === '/alunos/cep-lookup') return { data: { items: [], total: 0, page: 1 } };
      return { data: {} };
    });

    renderWithRouter(<AlunosPage />);

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith('Erro ao buscar alunos', { duration: 3000 });
    });
  });

  test('matricular cursos mostra erro explícito quando rotas principal e fallback falham', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/cursos/' || url === '/academico/cursos') {
        throw new Error('backend indisponível');
      }
      if (url === '/cursos/filter-options') return { data: { options: {} } };
      if (url === '/cursos/matriculas') return { data: { items: [], total: 0, page: 1 } };
      if (url === '/cursos/matriculas/options') return { data: { alunos: [], cursos: [], turmas: [], status: [] } };
      return { data: {} };
    });

    renderWithRouter(<CursosPage />);

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith('Erro ao carregar cursos.', { duration: 3000 });
    });
  });

  test('avaliações exibe mensagem de erro quando a listagem falha', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/avaliacoes/') {
        throw new Error('resposta inválida');
      }
      if (url === '/avaliacoes/filter-options') return { data: { options: {} } };
      if (url === '/avaliacoes/form-options') return { data: { alunos: [], cursos: [], status: [] } };
      return { data: {} };
    });

    renderWithRouter(<AvaliacoesPage />);

    expect(await screen.findByText('Erro ao carregar avaliações.')).toBeInTheDocument();
  });

  test('interesses exibe mensagem de erro quando a listagem falha', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/interesses/') {
        throw new Error('resposta inválida');
      }
      if (url === '/interesses/filter-options') return { data: { options: {} } };
      return { data: {} };
    });

    renderWithRouter(<InteressesPage />);

    expect(await screen.findByText('Erro ao carregar interesses.')).toBeInTheDocument();
  });

  test('trilhas exibe mensagem de erro quando a listagem falha', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/trilhas/') {
        throw new Error('resposta inválida');
      }
      if (url === '/trilhas/filter-options') return { data: { options: {} } };
      return { data: {} };
    });

    renderWithRouter(<TrilhasPage />);

    expect(await screen.findByText('Erro ao carregar trilhas.')).toBeInTheDocument();
  });

  test('usuários exibe mensagem de erro quando a listagem falha', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/usuarios/') {
        throw new Error('resposta inválida');
      }
      if (url === '/usuarios/filter-options') return { data: { options: {} } };
      return { data: {} };
    });

    renderWithRouter(<UsersPage />);

    expect(await screen.findByText('Erro ao buscar usuários.')).toBeInTheDocument();
  });

  test('professores mostra notificação de erro quando principal e fallback falham', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/professores/' || url === '/academico/professores') {
        throw new Error('backend indisponível');
      }
      if (url === '/professores/filter-options') return { data: { options: {} } };
      return { data: {} };
    });

    renderWithRouter(<ProfessoresPage />);

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith('Erro ao buscar professores', { duration: 3000 });
    });
  });

  test('turmas mostra notificação de erro quando principal e fallback falham', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/turmas/' || url === '/academico/turmas' || url === '/academico/professores') {
        throw new Error('backend indisponível');
      }
      if (url === '/turmas/filter-options') return { data: { options: {} } };
      if (url === '/turmas/professores') return { data: { items: [] } };
      return { data: {} };
    });

    renderWithRouter(<TurmasPage />);

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith('Erro ao buscar turmas', { duration: 3000 });
    });
  });

  test('drawer de alunos aplica filtros no fluxo atributo e valor', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/filter-options') {
        return { data: { options: { sexo: ['Feminino'] } } };
      }
      if (url === '/alunos') {
        return {
          data: {
            items: [{ id_aluno: 'ALN-1', nome: 'Ana', sexo: 'Masculino', situacao: 'Ativo' }],
            total: 1,
            page: 1,
          },
        };
      }
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [], situacoes: ['Ativo'] } };
      }
      return { data: {} };
    });

    renderWithRouter(<AlunosPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir filtros' }));
    const drawer = screen.getByTestId('alunos-filter-drawer');
    fireEvent.click(within(drawer).getByRole('button', { name: /Sexo/i }));
    expect(within(drawer).queryByRole('button', { name: /Masculino/i })).not.toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('checkbox', { name: /Feminino/i }));

    expect(await screen.findByText(/Sexo: Feminino/i)).toBeInTheDocument();
  });

  test('frequência exibe totais por aluno e related chamadas com expandir/adicionar', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/chamadas/filter-options') {
        return { data: { options: { presenca: ['Presente'] } } };
      }
      if (url === '/chamadas/form-options') {
        return { data: { alunos: [], aulas: [], matriculas: [], presencas: ['Presente', 'Ausente'] } };
      }
      if (url === '/chamadas/frequencia-resumo') {
        return {
          data: {
            items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', TurmaIngresso: 'Turma A', TotalAulas: 12, Presencas: 10, Ausencias: 2 }],
            total: 1,
            page: 1,
          },
        };
      }
      if (url === '/chamadas/') {
        return {
          data: {
            items: [{ IdChamada: '1', IdAluno: 'ALN-1', NomeAluno: 'Ana', Data: '2026-01-01', Presenca: 'Presente', NomeAula: 'Matemática', ativo: true }],
            total: 1,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    renderWithRouter(<ChamadasPage />);

    expect(await screen.findByText('Nome Completo do Aluno(a)')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Turma de Ingresso/i })).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.classList?.contains('status-info') && element?.textContent?.includes('12'))).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.classList?.contains('status-positive') && element?.textContent?.includes('10'))).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.classList?.contains('status-negative') && element?.textContent?.includes('2'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }));
    const relatedLabels = await screen.findAllByText('Chamadas Relacionadas');
    expect(relatedLabels.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir' }));
    expect(await screen.findByRole('button', { name: 'Nova chamada' })).toBeInTheDocument();
    expect(screen.queryByText('Nome Completo do Aluno(a)')).not.toBeInTheDocument();
  });

  test('formulário de professores não expõe identificador interno', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/professores/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/professores/' || url === '/academico/professores') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      return { data: {} };
    });

    renderWithRouter(<ProfessoresPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar professor' }));

    expect(screen.queryByText('Identificador interno')).not.toBeInTheDocument();
  });

  test('formulário de turmas não expõe identificador interno', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/turmas/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/turmas/professores') {
        return { data: { items: [] } };
      }
      if (url === '/turmas/') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      if (url === '/academico/turmas' || url === '/academico/professores') {
        return { data: [] };
      }
      return { data: {} };
    });

    renderWithRouter(<TurmasPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar turma' }));

    await waitFor(() => {
      expect(screen.queryByText('Identificador interno da turma')).not.toBeInTheDocument();
    });
  });
});
