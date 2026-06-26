import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import AlunosPage from '../pages/Alunos';
import ProfessoresPage from '../pages/Professores';
import TurmasPage from '../pages/Turmas';
import AvaliacoesPage from '../pages/Avaliacoes';
import ChamadasPage from '../pages/Chamadas';
import CursosPage from '../pages/Cursos';
import InteressesPage from '../pages/Interesses';
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

const buildPagedResponse = (items, params = {}) => ({
  data: {
    items,
    total: 180,
    page: Number(params.page || 1),
    per_page: Number(params.per_page || 10),
  },
});

const sidebarListCases = [
  {
    label: 'alunos',
    Component: AlunosPage,
    listUrl: '/alunos',
    rowText: 'Aluno Paginação',
    handlers: {
      '/alunos/filter-options': () => ({ data: { options: {} } }),
      '/alunos': (_url, config = {}) => buildPagedResponse([
        { IdAluno: 'ALN-PAG-1', NomeAluno: 'Aluno Paginação', Situacao: 'Em Aberto', ativo: true },
      ], config.params),
    },
  },
  {
    label: 'professores',
    Component: ProfessoresPage,
    listUrl: '/professores/',
    rowText: 'Professor Paginação',
    handlers: {
      '/professores/filter-options': () => ({ data: { options: {} } }),
      '/professores/': (_url, config = {}) => buildPagedResponse([
        { IdProfessor: 'PROF-PAG-1', NomeProfessor: 'Professor Paginação', EmailProfessor: 'prof@teste.com', ativo: true },
      ], config.params),
    },
  },
  {
    label: 'turmas',
    Component: TurmasPage,
    listUrl: '/turmas/',
    rowText: 'Turma Paginação',
    handlers: {
      '/turmas/filter-options': () => ({ data: { options: {} } }),
      '/turmas/professores': () => ({ data: { items: [{ id_professor: 'PROF-1', nome: 'Professor 1' }] } }),
      '/turmas/': (_url, config = {}) => buildPagedResponse([
        { id_turma: 'TURMA-PAG-1', nome: 'Turma Paginação', ano: '2026', id_professor: 'PROF-1', nome_professor: 'Professor 1', ativo: true },
      ], config.params),
    },
  },
  {
    label: 'avaliações',
    Component: AvaliacoesPage,
    listUrl: '/avaliacoes/',
    rowText: 'Aluno Avaliação',
    handlers: {
      '/avaliacoes/filter-options': () => ({ data: { options: {} } }),
      '/avaliacoes/form-options': () => ({ data: { alunos: [], cursos: [], status: [] } }),
      '/avaliacoes/': (_url, config = {}) => buildPagedResponse([
        { IdAvaliacao: 'AVL-PAG-1', Nota: 8.5, Status: 'CONCLUÍDO', OBS: 'Ok', IdAluno: 'ALN-1', IdCurso: 'CUR-1', NomeAluno: 'Aluno Avaliação', NomeCurso: 'Curso Avaliação', ativo: true },
      ], config.params),
    },
  },
  {
    label: 'chamadas',
    Component: ChamadasPage,
    listUrl: '/chamadas/frequencia-resumo',
    rowText: 'Ana',
    handlers: {
      '/chamadas/filter-options': () => ({ data: { options: {} } }),
      '/chamadas/form-options': () => ({ data: { alunos: [], aulas: [], matriculas: [], presencas: ['Presente', 'Ausente'] } }),
      '/chamadas/frequencia-resumo': (_url, config = {}) => buildPagedResponse([
        { IdAluno: 'ALN-1', NomeAluno: 'Ana', TurmaIngresso: 'Turma A', TotalAulas: 3, Presencas: 2, Ausencias: 1, ativo: true },
      ], config.params),
    },
  },
  {
    label: 'cursos',
    Component: CursosPage,
    listUrl: '/cursos/',
    rowText: 'Curso Paginação',
    handlers: {
      '/cursos/filter-options': () => ({ data: { options: {} } }),
      '/cursos/': (_url, config = {}) => buildPagedResponse([
        { IdCurso: 'CUR-PAG-1', NomeCurso: 'Curso Paginação', DescricaoCurso: 'Descrição', ativo: true },
      ], config.params),
      '/cursos/matriculas': () => ({ data: { items: [] } }),
      '/cursos/matriculas/options': () => ({ data: { alunos: [], cursos: [], turmas: [], status: [] } }),
      '/chamadas/form-options': () => ({ data: { aulas: [], presencas: ['Presente', 'Ausente'] } }),
    },
  },
  {
    label: 'interesses',
    Component: InteressesPage,
    listUrl: '/interesses/',
    rowText: 'Interesse Paginação',
    handlers: {
      '/interesses/filter-options': () => ({ data: { options: {} } }),
      '/interesses/': (_url, config = {}) => buildPagedResponse([
        { IdInteresse: 'INT-PAG-1', Descricao: 'Interesse Paginação', ativo: true },
      ], config.params),
    },
  },
  {
    label: 'alunos interesses',
    Component: AlunosInteressesPage,
    listUrl: '/alunos-interesses/',
    rowText: 'Aluno Vinculado Paginação',
    handlers: {
      '/alunos-interesses/filter-options': () => ({ data: { options: {} } }),
      '/alunos-interesses/form-options': () => ({ data: { alunos: [], interesses: [] } }),
      '/alunos-interesses/': (_url, config = {}) => buildPagedResponse([
        { IdAlunoInteresse: 'ALN-INT-PAG-1', IdAluno: 'ALN-1', IdInteresse: 'INT-1', NomeAluno: 'Aluno Vinculado Paginação', DescricaoInteresse: 'Interesse Vinculado Paginação', ativo: true },
      ], config.params),
    },
  },
];

describe('Paginação compartilhada das listagens laterais', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.put.mockReset();
    api.delete.mockReset();
    window.confirm = jest.fn(() => true);
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  test.each(sidebarListCases)('mantém 10, 50 e 100 em $label', async ({ Component, handlers, listUrl, rowText }) => {
    api.get.mockImplementation(async (url, config = {}) => {
      if (handlers[url]) {
        return handlers[url](url, config);
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Component />
      </MemoryRouter>
    );

    const matchingRows = await screen.findAllByText(rowText);
    expect(matchingRows.length).toBeGreaterThan(0);

    const listCalls = () => api.get.mock.calls.filter(([url]) => url === listUrl);
    expect(listCalls()[0][1]?.params).toMatchObject({ page: 1, per_page: 10 });

    const pageSizeSelect = screen.getByLabelText('Itens por página');
    expect(Array.from(pageSizeSelect.querySelectorAll('option')).map((option) => option.value)).toEqual(['10', '50', '100']);

    fireEvent.change(pageSizeSelect, { target: { value: '50' } });

    await waitFor(() => {
      expect(listCalls().some(([, config]) => config?.params?.page === 1 && config?.params?.per_page === 50)).toBe(true);
    });

    const pageSizeSelectAfterFirstChange = screen.getByLabelText('Itens por página');
    expect(pageSizeSelectAfterFirstChange).toHaveValue('50');

    fireEvent.change(pageSizeSelectAfterFirstChange, { target: { value: '100' } });

    await waitFor(() => {
      expect(listCalls().some(([, config]) => config?.params?.page === 1 && config?.params?.per_page === 100)).toBe(true);
    });
  });
});
