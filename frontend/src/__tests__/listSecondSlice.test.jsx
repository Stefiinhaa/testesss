import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CursosPage from '../pages/Cursos';
import TurmasPage from '../pages/Turmas';
import AlunosInteressesPage from '../pages/AlunosInteresses';

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
const getTurmasFieldControl = (labelText) => {
  const labelNode = screen.getAllByText(labelText).find((node) => node.closest('form.card'));
  const field = labelNode.closest('.field');
  return field.querySelector('input, select, textarea');
};
const getTurmasDrawerFieldControl = (labelText) => {
  const labelNode = screen.getAllByText(labelText).find((node) => node.closest('.list-filter-drawer'));
  const field = labelNode.closest('.field');
  return field.querySelector('input, select, textarea');
};

describe('Segunda fatia das listagens', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.put.mockReset();
    api.delete.mockReset();
    notify.mockReset();
    window.confirm = jest.fn(() => true);
  });

  test('Cursos abre drawer de filtros, carrega fallback legado e simplifica a área de matrículas', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/cursos/filter-options') {
        throw new Error('sem opções');
      }
      if (url === '/cursos/') {
        throw new Error('rota principal indisponível');
      }
      if (url === '/academico/cursos') {
        return { data: [{ IdCurso: 'CURSO-12345', NomeCurso: 'Matemática', DescricaoCurso: 'Base comum', ativo: true }] };
      }
      if (url === '/cursos/matriculas') {
        return { data: { items: [{ IdMatricula: 'MAT-1', DataMatricula: '2026-03-25', IdCurso: 'CURSO-12345', NomeCurso: 'Matemática', IdTurma: 'T-1', NomeTurma: 'Turma A', StatusMatricula: 'Ativo' }] } };
      }
      if (url === '/cursos/matriculas/options') {
        return { data: { alunos: [], cursos: [], turmas: [], status: [] } };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CursosPage />
      </MemoryRouter>
    );

    const matematicaCells = await screen.findAllByText((content, element) => element.tagName === 'TD' && content === 'Matemática');
    expect(matematicaCells.length).toBeGreaterThan(0);
    expect(screen.queryByRole('columnheader', { name: /^ID$/i })).not.toBeInTheDocument();
    expect(container.querySelector('.entity-header .search-input')).toBeNull();
    expect(screen.queryByLabelText('Pesquisar matrículas')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar matrículas' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros de cursos' }));

    await waitFor(() => {
      expect(screen.getByTestId('cursos-filter-drawer')).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText('Buscar')).not.toBeInTheDocument();
    const drawer = screen.getByTestId('cursos-filter-drawer');
    expect(within(drawer).getByRole('button', { name: /Nome do curso/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Descrição/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros de matrículas' }));
    await waitFor(() => {
      expect(screen.getByTestId('matriculas-filter-drawer')).toBeInTheDocument();
    });
    const matriculasDrawer = screen.getByTestId('matriculas-filter-drawer');
    fireEvent.click(within(matriculasDrawer).getByRole('button', { name: /^Status$/i }));
    const statusAtivoCheckbox = within(matriculasDrawer).getByRole('checkbox', { name: /^Ativo$/i });
    fireEvent.click(statusAtivoCheckbox);
    expect(statusAtivoCheckbox).toBeChecked();
    fireEvent.click(statusAtivoCheckbox);
    await waitFor(() => {
      expect(statusAtivoCheckbox).not.toBeChecked();
    });
  });

  test('Cursos e matrículas mantêm seleção por checkbox sem abrir detalhes', async () => {
    api.get.mockImplementation(async (url, config) => {
      if (url === '/cursos/filter-options') {
        throw new Error('sem opções');
      }
      if (url === '/cursos/') {
        return { data: { items: [{ IdCurso: 'CURSO-12345', NomeCurso: 'Matemática', DescricaoCurso: 'Base comum', ativo: true }], total: 1, page: 1 } };
      }
      if (url === '/cursos/matriculas') {
        if (config?.params?.curso_id) {
          return { data: { items: [] } };
        }
        return { data: { items: [{ IdMatricula: 'MAT-1', DataMatricula: '2026-03-25', IdCurso: 'CURSO-12345', NomeCurso: 'Matemática', IdTurma: 'T-1', NomeTurma: 'Turma A', StatusMatricula: 'Ativo' }] } };
      }
      if (url === '/cursos/matriculas/options') {
        return { data: { alunos: [], cursos: [], turmas: [], status: [] } };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CursosPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(container.querySelector('.table-wrap tbody input[type="checkbox"]')).not.toBeNull();
    });
    await waitFor(() => {
      expect(screen.getAllByText('Matrículas').length).toBeGreaterThan(0);
    });
    api.get.mockClear();

    fireEvent.click(container.querySelector('.table-wrap tbody input[type="checkbox"]'));

    expect(screen.queryByText('Detalhes do Curso')).not.toBeInTheDocument();
    expect(screen.getAllByText('Matrículas').length).toBeGreaterThan(0);
    expect(api.get).not.toHaveBeenCalledWith('/cursos/matriculas', expect.objectContaining({
      params: expect.objectContaining({ curso_id: 'CURSO-12345' }),
    }));

    const matriculaCheckboxes = container.querySelectorAll('.workspace-column:last-child .table-wrap tbody input[type="checkbox"]');
    expect(matriculaCheckboxes.length).toBeGreaterThan(0);

    fireEvent.click(matriculaCheckboxes[0]);

    expect(screen.queryByText('Detalhes da Matrícula')).not.toBeInTheDocument();
    expect(screen.getByText(/1 matrícula\(s\) selecionada\(s\)/i)).toBeInTheDocument();
  });

  test('Turmas abre pelo ícone já em modo editável', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/turmas/filter-options') {
        return { data: { options: { nome: ['Turma A'], ano: ['2026'], professor: ['Maria'] } } };
      }
      if (url === '/turmas/') {
        return { data: { items: [{ id_turma: 'TURMA-9001', nome: 'Turma A', ano: '2026-01-01', id_professor: 'PROF-88', nome_professor: 'Maria', ativo: true }], total: 1, page: 1 } };
      }
      if (url === '/turmas/professores') {
        return { data: { items: [{ id_professor: 'PROF-88', nome: 'Maria' }] } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TurmasPage />
      </MemoryRouter>
    );

    const rowLabel = await screen.findByText((content, element) => element.classList.contains('table-primary-text') && content === 'Turma A');
    fireEvent.click(within(rowLabel.closest('tr')).getByRole('button', { name: 'Detalhes' }));

    await waitFor(() => {
      expect(screen.getByText('Detalhes da Turma')).toBeInTheDocument();
    });

    expect(getTurmasFieldControl('Nome da turma')).not.toBeDisabled();
  });

  test('Turmas reordena por data de conclusão e status da turma ao clicar nos cabeçalhos', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/turmas/filter-options') {
        return { data: { options: { nome: ['Turma A', 'Turma B'], ano: ['2025', '2026'], professor: ['Maria', 'João'] } } };
      }
      if (url === '/turmas/') {
        return {
          data: {
            items: [
              { id_turma: 'T-1', nome: 'Turma A', ano: '2026-01-01', id_professor: 'PROF-1', nome_professor: 'Maria', data_conclusao: '2026-12-20', ativo: true },
              { id_turma: 'T-2', nome: 'Turma B', ano: '2025-01-01', id_professor: 'PROF-2', nome_professor: 'João', data_conclusao: '2025-06-30', ativo: false },
            ],
            total: 2,
            page: 1,
          },
        };
      }
      if (url === '/turmas/professores') {
        return { data: { items: [{ id_professor: 'PROF-1', nome: 'Maria' }, { id_professor: 'PROF-2', nome: 'João' }] } };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TurmasPage />
      </MemoryRouter>
    );

    await screen.findByText((content, element) => element.classList.contains('table-primary-text') && content === 'Turma A');
    const getFirstTurmaName = () => container.querySelector('tbody tr td:nth-child(2) .table-primary-text')?.textContent;
    const getFirstTurmaStatus = () => container.querySelector('tbody tr td:nth-child(6)')?.textContent;
    const getSortButton = (label) => Array.from(container.querySelectorAll('button.sort-btn')).find((button) => button.textContent?.includes(label));

    fireEvent.click(getSortButton('Data de Conclusão'));
    await waitFor(() => {
      expect(getFirstTurmaName()).toBe('Turma B');
    });

    fireEvent.click(getSortButton('Status da Turma'));
    await waitFor(() => {
      expect(getFirstTurmaStatus()).toBe('Ativa');
    });
  });

  test('Turmas reaproveita valores carregados quando o backend não devolve opções de filtro', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/turmas/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/turmas/') {
        return {
          data: {
            items: [{ id_turma: 'T-1', nome: 'Turma A', ano: '2026-01-01', id_professor: 'PROF-1', nome_professor: 'Maria', ativo: true }],
            total: 1,
            page: 1,
          },
        };
      }
      if (url === '/turmas/professores') {
        return { data: { items: [{ id_professor: 'PROF-1', nome: 'Maria' }] } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TurmasPage />
      </MemoryRouter>
    );

    await screen.findByText((content, element) => element.classList.contains('table-primary-text') && content === 'Turma A');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    const drawer = screen.getByTestId('turmas-filter-drawer');
    fireEvent.click(within(drawer).getByRole('button', { name: /Professor/i }));

    await waitFor(() => {
      expect(within(drawer).getByRole('checkbox', { name: /Maria/i })).toBeInTheDocument();
    });
  });

  test('Alunos Interesses oculta headers de ID e usa drawer de filtros', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos-interesses/form-options') {
        return { data: { alunos: [{ id: 'ALUNO-12345', nome: 'Aluno 2345' }], interesses: [{ id: 'INT-45678', nome: 'Interesse 5678' }] } };
      }
      if (url === '/alunos-interesses/filter-options') {
        return { data: { options: { id_aluno: ['123'], id_interesse: ['456'] } } };
      }
      if (url === '/alunos-interesses/') {
        return { data: { items: [{ IdAlunoInteresse: 'AI-999', IdAluno: 'ALUNO-12345', IdInteresse: 'INT-45678', NomeAluno: 'Aluno 2345', DescricaoInteresse: 'Interesse 5678', ativo: true }], total: 1, page: 1 } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosInteressesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Aluno 2345')).toBeInTheDocument();
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Alunos Interesses');
    expect(screen.queryByRole('columnheader', { name: /ID Aluno/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /ID Interesse/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));

    await waitFor(() => {
      expect(screen.getByTestId('alunos-interesses-filter-drawer')).toHaveClass('open');
    });
    expect(screen.queryByPlaceholderText('Buscar')).not.toBeInTheDocument();
  });

  test('Alunos Interesses esconde adicionar quando o aluno já consumiu todos os interesses restantes', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos-interesses/form-options') {
        return { data: { alunos: [{ id: 'ALN-1', nome: 'Ana' }], interesses: [] } };
      }
      if (url === '/alunos-interesses/filter-options') {
        return { data: { options: { id_aluno: ['Ana'], id_interesse: ['Robótica'] } } };
      }
      if (url === '/alunos-interesses/') {
        return { data: { items: [{ IdAlunoInteresse: 'AI-1', IdAluno: 'ALN-1', IdInteresse: 'INT-1', NomeAluno: 'Ana', DescricaoInteresse: 'Robótica', ativo: true }], total: 1, page: 1 } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter initialEntries={['/alunos-interesses?origin=alunos&aluno=ALN-1&alunoNome=Ana&create=1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosInteressesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Alunos');
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/alunos?edit=ALN-1');
    expect(screen.queryByRole('button', { name: 'Adicionar vínculo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Todos os interesses disponíveis já estão vinculados a este aluno.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Aluno *')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhum interesse restante disponível para vínculo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  test('Alunos Interesses abre pelo ícone já em modo editável', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos-interesses/form-options') {
        return { data: { alunos: [{ id: 'ALN-1', nome: 'Ana' }], interesses: [{ id: 'INT-1', nome: 'Robótica' }, { id: 'INT-2', nome: 'Música' }] } };
      }
      if (url === '/alunos-interesses/filter-options') {
        return { data: { options: { id_aluno: ['Ana'], id_interesse: ['Robótica'] } } };
      }
      if (url === '/alunos-interesses/') {
        return { data: { items: [{ IdAlunoInteresse: 'AI-1', IdAluno: 'ALN-1', IdInteresse: 'INT-1', NomeAluno: 'Ana', DescricaoInteresse: 'Robótica', ativo: true }], total: 1, page: 1 } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosInteressesPage />
      </MemoryRouter>
    );

    const rowLabel = await screen.findByText((content, element) => element.classList.contains('table-primary-text') && content === 'Ana');
    fireEvent.click(within(rowLabel.closest('tr')).getByRole('button', { name: 'Detalhes' }));

    await waitFor(() => {
      expect(screen.getByText('Detalhes do Vínculo')).toBeInTheDocument();
    });

    const form = screen.getByText('Detalhes do Vínculo').closest('form');
    expect(within(form).getAllByRole('combobox')[0]).not.toBeDisabled();
  });

  test('Cursos abre matrícula lateral por query string sem expandir a tela inteira', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/cursos/filter-options') {
        return { data: { options: { nome: ['Matemática'] } } };
      }
      if (url === '/cursos/') {
        return { data: { items: [{ IdCurso: 'CURSO-12345', NomeCurso: 'Matemática', DescricaoCurso: 'Base comum', ativo: true }], total: 1, page: 1 } };
      }
      if (url === '/cursos/matriculas') {
        return { data: { items: [{ IdMatricula: 'MAT-1', IdAluno: 'ALN-1', DataMatricula: '2026-03-25', IdCurso: 'CURSO-12345', NomeCurso: 'Matemática', IdTurma: 'T-1', NomeTurma: 'Turma A', StatusMatricula: 'Ativo' }] } };
      }
      if (url === '/cursos/matriculas/options') {
        return { data: { alunos: [{ id: 'ALN-1', nome: 'Ana' }], cursos: [{ id: 'CURSO-12345', nome: 'Matemática' }], turmas: [{ id: 'T-1', nome: 'Turma A' }], status: ['Ativo'] } };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/cursos?aluno=ALN-1&createMatricula=1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CursosPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Matricular Cursos');
      expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Nova Matrícula');
    });
    await waitFor(() => {
      expect(screen.getAllByText('Nova Matrícula').length).toBeGreaterThan(0);
      expect(container.querySelector('.split-workspace')).not.toHaveClass('workspace-expanded-matriculas');
      expect(container.querySelector('.workspace-column:last-child .workspace-overlay-panel')).not.toBeNull();
    });
  });

  test('Cursos abre formulários de curso e matrícula pelos botões adicionar sem tomar a largura inteira', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/cursos/filter-options') {
        return { data: { options: { nome: ['Matemática'] } } };
      }
      if (url === '/cursos/') {
        return { data: { items: [{ IdCurso: 'CURSO-12345', NomeCurso: 'Matemática', DescricaoCurso: 'Base comum', ativo: true }], total: 1, page: 1 } };
      }
      if (url === '/cursos/matriculas') {
        return { data: { items: [{ IdMatricula: 'MAT-1', IdAluno: 'ALN-1', DataMatricula: '2026-03-25', IdCurso: 'CURSO-12345', NomeCurso: 'Matemática', IdTurma: 'T-1', NomeTurma: 'Turma A', StatusMatricula: 'Ativo' }] } };
      }
      if (url === '/cursos/matriculas/options') {
        return { data: { alunos: [{ id: 'ALN-1', nome: 'Ana' }], cursos: [{ id: 'CURSO-12345', nome: 'Matemática' }], turmas: [{ id: 'T-1', nome: 'Turma A' }], status: ['Ativo'] } };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CursosPage />
      </MemoryRouter>
    );

    await screen.findAllByText((content, element) => element.tagName === 'TD' && content === 'Matemática');

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar curso' }));
    expect(screen.getAllByText('Novo Curso').length).toBeGreaterThan(0);
    expect(container.querySelector('.split-workspace')).not.toHaveClass('workspace-expanded-cursos');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar curso' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar matrícula' }));

    await waitFor(() => {
      expect(screen.getAllByText('Nova Matrícula').length).toBeGreaterThan(0);
      expect(container.querySelector('.split-workspace')).not.toHaveClass('workspace-expanded-matriculas');
      expect(container.querySelector('.workspace-column:last-child .workspace-overlay-panel')).not.toBeNull();
    });
  });

  test('Cursos reordena a listagem ao clicar no cabeçalho da coluna', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/cursos/filter-options') {
        return { data: { options: { nome: ['Zoologia', 'Álgebra'] } } };
      }
      if (url === '/cursos/') {
        return {
          data: {
            items: [
              { IdCurso: 'CUR-2', NomeCurso: 'Zoologia', DescricaoCurso: 'Zeta', ativo: true },
              { IdCurso: 'CUR-1', NomeCurso: 'Álgebra', DescricaoCurso: 'Alfa', ativo: true },
            ],
            total: 2,
            page: 1,
          },
        };
      }
      if (url === '/cursos/matriculas') {
        return { data: { items: [] } };
      }
      if (url === '/cursos/matriculas/options') {
        return { data: { alunos: [], cursos: [], turmas: [], status: [] } };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CursosPage />
      </MemoryRouter>
    );

    await screen.findByText('Zoologia');
    const getFirstCourseName = () => container.querySelector('.workspace-column:first-child tbody tr td:nth-child(2)')?.textContent;

    expect(getFirstCourseName()).toBe('Álgebra');
    fireEvent.click(screen.getByRole('button', { name: /Nome do Curso/i }));
    expect(getFirstCourseName()).toBe('Zoologia');
  });

  test('Cursos mostra a contagem correta de avaliações relacionadas e mantém o breadcrumb da entidade', async () => {
    api.get.mockImplementation(async (url, config) => {
      if (url === '/cursos/filter-options') {
        return { data: { options: { nome: ['Matemática'] } } };
      }
      if (url === '/cursos/') {
        return { data: { items: [{ IdCurso: 'CURSO-12345', NomeCurso: 'Matemática', DescricaoCurso: 'Base comum', ativo: true }], total: 1, page: 1 } };
      }
      if (url === '/cursos/matriculas') {
        return { data: { items: [{ IdMatricula: 'MAT-1', DataMatricula: '2026-03-25', IdCurso: 'CURSO-12345', NomeCurso: 'Matemática', IdTurma: 'T-1', NomeTurma: 'Turma A', StatusMatricula: 'Concluído' }] } };
      }
      if (url === '/cursos/matriculas/options') {
        return { data: { alunos: [], cursos: [], turmas: [], status: ['Ativo', 'Concluído'] } };
      }
      if (url === '/avaliacoes/') {
        return { data: { items: [{ IdAvaliacao: 'AV-1' }, { IdAvaliacao: 'AV-2' }, { IdAvaliacao: 'AV-3' }] } };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CursosPage />
      </MemoryRouter>
    );

    await screen.findAllByText((content, element) => element.tagName === 'TD' && content === 'Matemática');
    await waitFor(() => {
      expect(container.querySelector('.workspace-column:first-child tbody tr td:nth-child(5)')?.textContent).toBe('3');
    });
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Matricular Cursos');
  });

  test('Turmas salva nova turma com ano formatado e mantém o breadcrumb da entidade', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/turmas/filter-options') {
        return { data: { options: { nome: ['Turma Existente'], ano: ['2027'], professor: ['Maria'] } } };
      }
      if (url === '/turmas/') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      if (url === '/turmas/professores') {
        return { data: { items: [{ id_professor: 'PROF-88', nome: 'Maria' }] } };
      }
      if (url === '/academico/turmas') {
        return { data: [] };
      }
      if (url === '/academico/professores') {
        return { data: [{ IdProfessor: 'PROF-88', NomeProfessor: 'Maria' }] };
      }
      return { data: {} };
    });
    api.post.mockResolvedValue({ data: { id_turma: 'T-99' } });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TurmasPage />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Adicionar turma' });
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Turmas');

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar turma' }));
    expect(screen.getAllByText('Nome da turma').some((node) => node.classList.contains('field-label-required'))).toBe(true);
    expect(screen.getAllByText('Ano').some((node) => node.classList.contains('field-label-required'))).toBe(true);
    fireEvent.change(getTurmasFieldControl('Nome da turma'), { target: { value: 'Turma Nova' } });
    fireEvent.change(getTurmasFieldControl('Ano'), { target: { value: '2027' } });
    fireEvent.change(getTurmasFieldControl('Professor'), { target: { value: 'PROF-88' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/turmas/', expect.objectContaining({
        NomeTurma: 'Turma Nova',
        AnoTurma: '2027-01-01',
        IdProfessor: 'PROF-88',
      }));
    });
  });

  test('Turmas bloqueia criação duplicada no formulário antes de chamar a API', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/turmas/filter-options') {
        return { data: { options: { nome: ['Turma A'], ano: ['2026'], professor: ['Maria'] } } };
      }
      if (url === '/turmas/') {
        return { data: { items: [{ id_turma: 'T-1', nome: 'Turma A', ano: '2026-01-01', id_professor: 'PROF-88', nome_professor: 'Maria', ativo: true }], total: 1, page: 1 } };
      }
      if (url === '/turmas/professores') {
        return { data: { items: [{ id_professor: 'PROF-88', nome: 'Maria' }] } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TurmasPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar turma' }));
    fireEvent.change(getTurmasFieldControl('Nome da turma'), { target: { value: ' turma a ' } });
    fireEvent.change(getTurmasFieldControl('Ano'), { target: { value: '2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(api.post).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Já existe uma turma cadastrada com esse nome.', expect.objectContaining({ type: 'error' }));
  });
});
