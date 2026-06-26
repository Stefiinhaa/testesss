import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import AlunosInteressesPage from '../pages/AlunosInteresses';
import AlunosPage from '../pages/Alunos';
import AvaliacoesPage from '../pages/Avaliacoes';
import ChamadasPage from '../pages/Chamadas';
import CursosPage from '../pages/Cursos';
import InteressesPage from '../pages/Interesses';
import TrilhasPage from '../pages/Trilhas';
import ProfessoresPage from '../pages/Professores';
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

const renderWithRouter = (element) => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {element}
  </MemoryRouter>
);

const baseResponse = { data: { items: [], total: 0, page: 1 } };

const setupCommonMocks = (overrides = {}) => {
  api.get.mockImplementation(async (url) => {
    if (Object.prototype.hasOwnProperty.call(overrides, url)) {
      return overrides[url];
    }
    return baseResponse;
  });
};

const openDrawerAndCollectSections = async ({ buttonName, drawerTestId, expectedSections }) => {
  fireEvent.click(await screen.findByRole('button', { name: buttonName }));
  const drawer = await screen.findByTestId(drawerTestId);
  expectedSections.forEach((sectionName) => {
    expect(within(drawer).getByRole('button', { name: sectionName })).toBeInTheDocument();
  });
  return drawer;
};

const humanizeFilterKey = (key) => String(key || '')
  .replace(/[_-]+/g, ' ')
  .trim()
  .replace(/\b\w/g, (match) => match.toUpperCase());

const expectDrawerToExposeAllOptionKeys = (drawer, options = {}, expectedSections = []) => {
  const baseLabels = new Set(expectedSections);
  const baseKeys = new Set(['nome', 'sexo']);
  const extraLabels = Object.keys(options || {})
    .filter((key) => !baseKeys.has(key))
    .map((key) => humanizeFilterKey(key))
    .filter((label) => !baseLabels.has(label));

  extraLabels.forEach((label) => {
    expect(within(drawer).getByRole('button', { name: label })).toBeInTheDocument();
  });
};

const expectDrawerToExposeExtraCriterion = async ({
  buttonName,
  drawerTestId,
  expectedSections,
  extraSection,
}) => {
  const drawer = await openDrawerAndCollectSections({ buttonName, drawerTestId, expectedSections });
  expect(within(drawer).getByRole('button', { name: extraSection })).toBeInTheDocument();
};

const expectFilterSelectionToDispatchParam = async ({
  page,
  setupMocks,
  buttonName,
  drawerTestId,
  criterionLabel,
  optionValue,
  listUrl,
  paramKey,
}) => {
  setupCommonMocks(setupMocks);
  renderWithRouter(page);

  fireEvent.click(await screen.findByRole('button', { name: buttonName }));
  const drawer = await screen.findByTestId(drawerTestId);
  fireEvent.click(within(drawer).getByRole('button', { name: criterionLabel }));
  fireEvent.click(await within(drawer).findByRole('checkbox', { name: optionValue }));

  await waitFor(() => {
    const listCalls = api.get.mock.calls.filter(([calledUrl]) => calledUrl === listUrl);
    const hasParam = listCalls.some(([, config]) => config?.params?.[paramKey] === JSON.stringify([optionValue]));
    expect(hasParam).toBe(true);
  });
};

const expectManualFilterEntryToDispatchParam = async ({
  page,
  setupMocks,
  buttonName,
  drawerTestId,
  criterionLabel,
  typedValue,
  listUrl,
  paramKey,
}) => {
  setupCommonMocks(setupMocks);
  renderWithRouter(page);

  fireEvent.click(await screen.findByRole('button', { name: buttonName }));
  const drawer = await screen.findByTestId(drawerTestId);
  fireEvent.click(within(drawer).getByRole('button', { name: criterionLabel }));

  fireEvent.change(within(drawer).getByLabelText(/Adicionar valor manualmente|Digite um valor para filtrar/i), {
    target: { value: typedValue },
  });
  fireEvent.click(within(drawer).getByRole('button', { name: 'Aplicar' }));

  await waitFor(() => {
    const listCalls = api.get.mock.calls.filter(([calledUrl]) => calledUrl === listUrl);
    const hasParam = listCalls.some(([, config]) => config?.params?.[paramKey] === JSON.stringify([typedValue]));
    expect(hasParam).toBe(true);
  });
};

const paged = (items) => ({ data: { items, total: items.length, page: 1 } });

const expectFilterSelectionToNarrowRenderedResults = async ({
  page,
  mockGet,
  buttonName,
  drawerTestId,
  criterionLabel,
  optionValue,
  listUrl,
  paramKey,
  initialCountText = '2 registro(s)',
  finalCountText = '1 registro(s)',
}) => {
  api.get.mockImplementation(mockGet);
  renderWithRouter(page);

  await waitFor(() => {
    expect(screen.getAllByText(initialCountText).length).toBeGreaterThanOrEqual(1);
  });

  fireEvent.click(await screen.findByRole('button', { name: buttonName }));
  const drawer = await screen.findByTestId(drawerTestId);
  fireEvent.click(within(drawer).getByRole('button', { name: criterionLabel }));
  fireEvent.click(await within(drawer).findByRole('checkbox', { name: optionValue }));

  await waitFor(() => {
    const listCalls = api.get.mock.calls.filter(([calledUrl]) => calledUrl === listUrl);
    const hasParam = listCalls.some(([, config]) => config?.params?.[paramKey] === JSON.stringify([optionValue]));
    expect(hasParam).toBe(true);
  });

  await waitFor(() => {
    expect(screen.getAllByText(finalCountText).length).toBeGreaterThanOrEqual(1);
  });
};

describe('Contrato de filtros da UI', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.put.mockReset();
    api.delete.mockReset();
    window.confirm = jest.fn(() => true);
    URL.createObjectURL = jest.fn(() => 'blob:preview');
    URL.revokeObjectURL = jest.fn();
  });

  test('alunos expõem os criterios de filtro esperados', async () => {
    const alunosFilterOptions = {
      nome: ['Ana'],
      sexo: ['Feminino'],
      criterio_externo: ['Valor X'],
      faixa_etaria: ['18-24'],
    };

    const expectedSections = [
      'Nome Completo do Aluno(a)',
      'Sexo',
      'Cor',
      'Estado',
      'Estado de naturalidade',
      'Foto',
      'Situação',
      'Turno',
      'Trabalho',
      'Estágio',
      'Setor',
      'Cidade',
      'Bairro',
      'País',
      'Nacionalidade',
      'Naturalidade',
      'Turma',
    ];

    setupCommonMocks({
      '/alunos/filter-options': { data: { options: alunosFilterOptions } },
      '/alunos': baseResponse,
      '/alunos/form-options': { data: { turnos: [], turmas: [], situacoes: [] } },
    });

    renderWithRouter(<AlunosPage />);

    const drawer = await openDrawerAndCollectSections({
      buttonName: 'Abrir filtros',
      drawerTestId: 'alunos-filter-drawer',
      expectedSections,
    });

    expectDrawerToExposeAllOptionKeys(drawer, alunosFilterOptions, expectedSections);
  });

  test('cursos expõem filtros de cursos e de matrículas', async () => {
    setupCommonMocks({
      '/cursos/': baseResponse,
      '/cursos/filter-options': { data: { options: { nome: ['Curso A'], descricao: ['Desc A'], carga_horaria: ['80h'] } } },
      '/cursos/matriculas': { data: { items: [], total: 0, page: 1 } },
      '/cursos/matriculas/options': { data: { alunos: [], cursos: [], turmas: [], status: [], data_matricula: [] } },
    });

    renderWithRouter(<CursosPage />);

    await expectDrawerToExposeExtraCriterion({
      buttonName: 'Abrir filtros de cursos',
      drawerTestId: 'cursos-filter-drawer',
      expectedSections: ['Nome do curso', 'Descrição'],
      extraSection: 'Carga Horaria',
    });

    await expectDrawerToExposeExtraCriterion({
      buttonName: 'Abrir filtros de matrículas',
      drawerTestId: 'matriculas-filter-drawer',
      expectedSections: ['Aluno', 'Curso', 'Turma', 'Status'],
      extraSection: 'Data Matricula',
    });
  });

  test('cursos permite aplicar filtro textual digitado manualmente em descrição', async () => {
    await expectManualFilterEntryToDispatchParam({
      page: <CursosPage />,
      setupMocks: {
        '/cursos/': baseResponse,
        '/cursos/filter-options': { data: { options: { nome: ['Curso A'], ativo: ['Ativo'] } } },
        '/cursos/matriculas': { data: { items: [], total: 0, page: 1 } },
        '/cursos/matriculas/options': { data: { alunos: [], cursos: [], turmas: [], status: [] } },
      },
      buttonName: 'Abrir filtros de cursos',
      drawerTestId: 'cursos-filter-drawer',
      criterionLabel: 'Descrição',
      typedValue: 'Introdução à física',
      listUrl: '/cursos/',
      paramKey: 'descricao',
    });
  });

  test('professores expõem os criterios de filtro esperados', async () => {
    setupCommonMocks({
      '/professores/filter-options': { data: { options: { especialidade: ['Matemática'] } } },
      '/professores/': baseResponse,
    });

    renderWithRouter(<ProfessoresPage />);

    await expectDrawerToExposeExtraCriterion({
      buttonName: 'Abrir filtros',
      drawerTestId: 'professores-filter-drawer',
      expectedSections: ['Nome', 'E-mail', 'Telefone', 'WhatsApp', 'Endereço', 'Foto'],
      extraSection: 'Especialidade',
    });
  });

  test('turmas expõem os criterios de filtro esperados', async () => {
    setupCommonMocks({
      '/turmas/filter-options': { data: { options: { nome: ['Turma A'], ano: ['2026'], professor: ['Maria'], turno: ['Noite'] } } },
      '/turmas/': baseResponse,
      '/turmas/professores': { data: [] },
      '/academico/turmas': { data: [] },
      '/academico/professores': { data: [] },
    });

    renderWithRouter(<TurmasPage />);

    await expectDrawerToExposeExtraCriterion({
      buttonName: 'Abrir filtros',
      drawerTestId: 'turmas-filter-drawer',
      expectedSections: ['Nome da turma', 'Ano', 'Professor Responsável', 'Status da Turma'],
      extraSection: 'Turno',
    });
  });

  test('chamadas expõem os criterios de filtro esperados', async () => {
    setupCommonMocks({
      '/chamadas/filter-options': { data: { options: { sala: ['101-A'] } } },
      '/chamadas/form-options': { data: { alunos: [], aulas: [], matriculas: [], presencas: [] } },
      '/chamadas/': baseResponse,
    });

    renderWithRouter(<ChamadasPage />);

    await expectDrawerToExposeExtraCriterion({
      buttonName: 'Abrir filtros',
      drawerTestId: 'chamadas-filter-drawer',
      expectedSections: [
        'Data',
        'Presença',
        'Foto',
        'Turma de Ingresso',
        'Total de Aulas',
        'Presenças',
        'Ausências',
        'Aula',
        'Matrícula',
      ],
      extraSection: 'Sala',
    });
  });

  test('avaliacoes expõem os criterios de filtro esperados', async () => {
    setupCommonMocks({
      '/avaliacoes/filter-options': { data: { options: { semestre: ['2026-1'] } } },
      '/avaliacoes/form-options': { data: { alunos: [], cursos: [], status: [] } },
      '/avaliacoes/': baseResponse,
    });

    renderWithRouter(<AvaliacoesPage />);

    await expectDrawerToExposeExtraCriterion({
      buttonName: 'Abrir filtros',
      drawerTestId: 'avaliacoes-filter-drawer',
      expectedSections: ['Nota', 'Status', 'Observação', 'Aluno', 'Curso', 'Turma', 'Data de Ingresso', 'Data de Conclusão'],
      extraSection: 'Semestre',
    });
  });

  test('usuarios expõem os criterios de filtro esperados', async () => {
    setupCommonMocks({
      '/usuarios/filter-options': { data: { options: { ultimo_acesso: ['2026-05-01'] } } },
      '/usuarios/': baseResponse,
    });

    renderWithRouter(<UsersPage />);

    await expectDrawerToExposeExtraCriterion({
      buttonName: 'Abrir filtros',
      drawerTestId: 'users-filter-drawer',
      expectedSections: ['E-mail', 'Perfil', 'IdAluno', 'Status'],
      extraSection: 'Ultimo Acesso',
    });
  });

  test('interesses expõem os criterios de filtro esperados', async () => {
    setupCommonMocks({
      '/interesses/filter-options': { data: { options: { categoria: ['Tecnologia'] } } },
      '/interesses/': baseResponse,
    });

    renderWithRouter(<InteressesPage />);

    await expectDrawerToExposeExtraCriterion({
      buttonName: 'Abrir filtros',
      drawerTestId: 'interesses-filter-drawer',
      expectedSections: ['Descricao'],
      extraSection: 'Categoria',
    });
  });

  test('trilhas expõem os criterios de filtro esperados', async () => {
    setupCommonMocks({
      '/trilhas/filter-options': { data: { options: { carga_horaria: ['120h'] } } },
      '/trilhas/': baseResponse,
    });

    renderWithRouter(<TrilhasPage />);

    await expectDrawerToExposeExtraCriterion({
      buttonName: 'Abrir filtros',
      drawerTestId: 'trilhas-filter-drawer',
      expectedSections: ['Nome', 'Descricao', 'Qtd Cursos', 'Status'],
      extraSection: 'Carga Horaria',
    });
  });

  test('alunos-interesses expõem os criterios de filtro esperados', async () => {
    setupCommonMocks({
      '/alunos-interesses/filter-options': { data: { options: { origem: ['Importação'] } } },
      '/alunos-interesses/': baseResponse,
      '/alunos-interesses/form-options': { data: { alunos: [], interesses: [] } },
    });

    renderWithRouter(<AlunosInteressesPage />);

    await expectDrawerToExposeExtraCriterion({
      buttonName: 'Abrir filtros',
      drawerTestId: 'alunos-interesses-filter-drawer',
      expectedSections: ['Aluno', 'Interesse'],
      extraSection: 'Origem',
    });
  });

  test.each([
    {
      name: 'alunos',
      page: <AlunosPage />,
      setupMocks: {
        '/alunos/filter-options': { data: { options: { nome: ['ALEX PAVARINI'] } } },
        '/alunos/form-options': { data: { turnos: [], turmas: [], situacoes: [] } },
        '/alunos': baseResponse,
      },
      buttonName: 'Abrir filtros',
      drawerTestId: 'alunos-filter-drawer',
      criterionLabel: 'Nome Completo do Aluno(a)',
      optionValue: 'ALEX PAVARINI',
      listUrl: '/alunos',
      paramKey: 'nome_in',
    },
    {
      name: 'professores',
      page: <ProfessoresPage />,
      setupMocks: {
        '/professores/filter-options': { data: { options: { nome: ['MARIA'] } } },
        '/professores/': baseResponse,
      },
      buttonName: 'Abrir filtros',
      drawerTestId: 'professores-filter-drawer',
      criterionLabel: 'Nome',
      optionValue: 'MARIA',
      listUrl: '/professores/',
      paramKey: 'nome_in',
    },
    {
      name: 'turmas',
      page: <TurmasPage />,
      setupMocks: {
        '/turmas/filter-options': { data: { options: { ano: ['2026'] } } },
        '/turmas/': baseResponse,
        '/turmas/professores': { data: [] },
        '/academico/turmas': { data: [] },
        '/academico/professores': { data: [] },
      },
      buttonName: 'Abrir filtros',
      drawerTestId: 'turmas-filter-drawer',
      criterionLabel: 'Ano',
      optionValue: '2026',
      listUrl: '/turmas/',
      paramKey: 'ano_in',
    },
    {
      name: 'chamadas',
      page: <ChamadasPage />,
      setupMocks: {
        '/chamadas/filter-options': { data: { options: { presenca: ['Presente'] } } },
        '/chamadas/form-options': { data: { alunos: [], aulas: [], matriculas: [], presencas: [] } },
        '/chamadas/frequencia-resumo': baseResponse,
        '/chamadas/': baseResponse,
      },
      buttonName: 'Abrir filtros',
      drawerTestId: 'chamadas-filter-drawer',
      criterionLabel: 'Presença',
      optionValue: 'Presente',
      listUrl: '/chamadas/frequencia-resumo',
      paramKey: 'presenca_in',
    },
    {
      name: 'avaliacoes',
      page: <AvaliacoesPage />,
      setupMocks: {
        '/avaliacoes/filter-options': { data: { options: { status: ['Aprovado'] } } },
        '/avaliacoes/form-options': { data: { alunos: [], cursos: [], status: [] } },
        '/avaliacoes/': baseResponse,
      },
      buttonName: 'Abrir filtros',
      drawerTestId: 'avaliacoes-filter-drawer',
      criterionLabel: 'Status',
      optionValue: 'Aprovado',
      listUrl: '/avaliacoes/',
      paramKey: 'status_in',
    },
    {
      name: 'usuarios',
      page: <UsersPage />,
      setupMocks: {
        '/usuarios/filter-options': { data: { options: { perfil: ['admin'] } } },
        '/usuarios/': baseResponse,
        '/usuarios/me': { data: { id: 'USR-1', user: 'admin@local', perfil: 'admin' } },
      },
      buttonName: 'Abrir filtros',
      drawerTestId: 'users-filter-drawer',
      criterionLabel: 'Perfil',
      optionValue: 'admin',
      listUrl: '/usuarios/',
      paramKey: 'perfil_in',
    },
    {
      name: 'interesses',
      page: <InteressesPage />,
      setupMocks: {
        '/interesses/filter-options': { data: { options: { descricao: ['Tecnologia'] } } },
        '/interesses/': baseResponse,
      },
      buttonName: 'Abrir filtros',
      drawerTestId: 'interesses-filter-drawer',
      criterionLabel: 'Descricao',
      optionValue: 'Tecnologia',
      listUrl: '/interesses/',
      paramKey: 'descricao_in',
    },
    {
      name: 'trilhas',
      page: <TrilhasPage />,
      setupMocks: {
        '/trilhas/filter-options': { data: { options: { nome_trilha: ['Trilha Fullstack'] } } },
        '/trilhas/': baseResponse,
      },
      buttonName: 'Abrir filtros',
      drawerTestId: 'trilhas-filter-drawer',
      criterionLabel: 'Nome',
      optionValue: 'Trilha Fullstack',
      listUrl: '/trilhas/',
      paramKey: 'nome_in',
    },
    {
      name: 'alunos-interesses',
      page: <AlunosInteressesPage />,
      setupMocks: {
        '/alunos-interesses/filter-options': { data: { options: { id_aluno: ['ALN-1'] } } },
        '/alunos-interesses/form-options': { data: { alunos: [], interesses: [] } },
        '/alunos-interesses/': baseResponse,
      },
      buttonName: 'Abrir filtros',
      drawerTestId: 'alunos-interesses-filter-drawer',
      criterionLabel: 'Aluno',
      optionValue: 'ALN-1',
      listUrl: '/alunos-interesses/',
      paramKey: 'id_aluno',
    },
    {
      name: 'cursos',
      page: <CursosPage />,
      setupMocks: {
        '/cursos/filter-options': { data: { options: { nome: ['Curso A'] } } },
        '/cursos/': baseResponse,
        '/cursos/matriculas': { data: { items: [], total: 0, page: 1 } },
        '/cursos/matriculas/options': { data: { alunos: [], cursos: [], turmas: [], status: [] } },
      },
      buttonName: 'Abrir filtros de cursos',
      drawerTestId: 'cursos-filter-drawer',
      criterionLabel: 'Nome do curso',
      optionValue: 'Curso A',
      listUrl: '/cursos/',
      paramKey: 'nome_in',
    },
  ])('seleção de filtro dispara query param correto em $name', async (scenario) => {
    await expectFilterSelectionToDispatchParam(scenario);
  });

  test.each([
    {
      name: 'alunos',
      page: <AlunosPage />,
      buttonName: 'Abrir filtros',
      drawerTestId: 'alunos-filter-drawer',
      criterionLabel: 'Nome Completo do Aluno(a)',
      optionValue: 'ALEX PAVARINI',
      listUrl: '/alunos',
      paramKey: 'nome_in',
      mockGet: async (url, config = {}) => {
        if (url === '/alunos/filter-options') return { data: { options: { nome: ['ALEX PAVARINI', 'BRUNA ROCHA'] } } };
        if (url === '/alunos/form-options') return { data: { turnos: [], turmas: [], situacoes: [] } };
        if (url === '/alunos') {
          const isFiltered = config?.params?.nome_in === JSON.stringify(['ALEX PAVARINI']);
          return paged(isFiltered
            ? [{ IdAluno: 'ALN-1', NomeAluno: 'ALEX PAVARINI', Situacao: 'Em Aberto' }]
            : [
              { IdAluno: 'ALN-1', NomeAluno: 'ALEX PAVARINI', Situacao: 'Em Aberto' },
              { IdAluno: 'ALN-2', NomeAluno: 'BRUNA ROCHA', Situacao: 'Em Aberto' },
            ]);
        }
        return baseResponse;
      },
    },
    {
      name: 'professores',
      page: <ProfessoresPage />,
      buttonName: 'Abrir filtros',
      drawerTestId: 'professores-filter-drawer',
      criterionLabel: 'Nome',
      optionValue: 'MARIA',
      listUrl: '/professores/',
      paramKey: 'nome_in',
      mockGet: async (url, config = {}) => {
        if (url === '/professores/filter-options') return { data: { options: { nome: ['MARIA', 'JOAO'] } } };
        if (url === '/professores/') {
          const isFiltered = config?.params?.nome_in === JSON.stringify(['MARIA']);
          return paged(isFiltered
            ? [{ id_professor: 'PROF-1', nome: 'MARIA', email: 'maria@escola.com', telefone: '14999990000', whatsapp: true, endereco: 'Rua A', ativo: true }]
            : [
              { id_professor: 'PROF-1', nome: 'MARIA', email: 'maria@escola.com', telefone: '14999990000', whatsapp: true, endereco: 'Rua A', ativo: true },
              { id_professor: 'PROF-2', nome: 'JOAO', email: 'joao@escola.com', telefone: '14999991111', whatsapp: false, endereco: 'Rua B', ativo: true },
            ]);
        }
        return baseResponse;
      },
    },
    {
      name: 'turmas',
      page: <TurmasPage />,
      buttonName: 'Abrir filtros',
      drawerTestId: 'turmas-filter-drawer',
      criterionLabel: 'Ano',
      optionValue: '2026',
      listUrl: '/turmas/',
      paramKey: 'ano_in',
      mockGet: async (url, config = {}) => {
        if (url === '/turmas/filter-options') return { data: { options: { ano: ['2026', '2025'] } } };
        if (url === '/turmas/professores') return { data: { items: [{ id_professor: 'PROF-1', nome: 'Maria' }, { id_professor: 'PROF-2', nome: 'João' }] } };
        if (url === '/turmas/') {
          const isFiltered = config?.params?.ano_in === JSON.stringify(['2026']);
          return paged(isFiltered
            ? [{ id_turma: 'T-1', nome: 'Turma A', ano: '2026-01-01', id_professor: 'PROF-1', nome_professor: 'Maria', ativo: true }]
            : [
              { id_turma: 'T-1', nome: 'Turma A', ano: '2026-01-01', id_professor: 'PROF-1', nome_professor: 'Maria', ativo: true },
              { id_turma: 'T-2', nome: 'Turma B', ano: '2025-01-01', id_professor: 'PROF-2', nome_professor: 'João', ativo: true },
            ]);
        }
        return baseResponse;
      },
    },
    {
      name: 'avaliacoes',
      page: <AvaliacoesPage />,
      buttonName: 'Abrir filtros',
      drawerTestId: 'avaliacoes-filter-drawer',
      criterionLabel: 'Status',
      optionValue: 'Aprovado',
      listUrl: '/avaliacoes/',
      paramKey: 'status_in',
      mockGet: async (url, config = {}) => {
        if (url === '/avaliacoes/filter-options') return { data: { options: { status: ['Aprovado', 'Reprovado'] } } };
        if (url === '/avaliacoes/form-options') return { data: { alunos: [], cursos: [], status: ['Aprovado', 'Reprovado'] } };
        if (url === '/avaliacoes/') {
          const isFiltered = config?.params?.status_in === JSON.stringify(['Aprovado']);
          return paged(isFiltered
            ? [{ IdAvaliacao: 'AVL-1', NomeAluno: 'Ana', NomeCurso: 'Matemática', Nota: 9, Status: 'Aprovado', OBS: '', ativo: true }]
            : [
              { IdAvaliacao: 'AVL-1', NomeAluno: 'Ana', NomeCurso: 'Matemática', Nota: 9, Status: 'Aprovado', OBS: '', ativo: true },
              { IdAvaliacao: 'AVL-2', NomeAluno: 'Bruno', NomeCurso: 'Física', Nota: 5, Status: 'Reprovado', OBS: '', ativo: true },
            ]);
        }
        return baseResponse;
      },
    },
    {
      name: 'usuarios',
      page: <UsersPage />,
      buttonName: 'Abrir filtros',
      drawerTestId: 'users-filter-drawer',
      criterionLabel: 'Perfil',
      optionValue: 'admin',
      listUrl: '/usuarios/',
      paramKey: 'perfil_in',
      mockGet: async (url, config = {}) => {
        if (url === '/usuarios/filter-options') return { data: { options: { perfil: ['admin', 'professor'] } } };
        if (url === '/usuarios/me') return { data: { id: 'USR-1', user: 'admin@local', perfil: 'admin' } };
        if (url === '/usuarios/') {
          const isFiltered = config?.params?.perfil_in === JSON.stringify(['admin']);
          return paged(isFiltered
            ? [{ id: 'USR-1', login: 'admin@local', perfil: 'admin', id_aluno: '', ativo: true }]
            : [
              { id: 'USR-1', login: 'admin@local', perfil: 'admin', id_aluno: '', ativo: true },
              { id: 'USR-2', login: 'prof@local', perfil: 'professor', id_aluno: '', ativo: true },
            ]);
        }
        return baseResponse;
      },
    },
    {
      name: 'cursos',
      page: <CursosPage />,
      buttonName: 'Abrir filtros de cursos',
      drawerTestId: 'cursos-filter-drawer',
      criterionLabel: 'Nome do curso',
      optionValue: 'Curso A',
      listUrl: '/cursos/',
      paramKey: 'nome_in',
      initialCountText: '2 curso(s) • 0 matrícula(s)',
      finalCountText: '1 curso(s) • 0 matrícula(s)',
      mockGet: async (url, config = {}) => {
        if (url === '/cursos/filter-options') return { data: { options: { nome: ['Curso A', 'Curso B'] } } };
        if (url === '/cursos/matriculas') return { data: { items: [], total: 0, page: 1 } };
        if (url === '/cursos/matriculas/options') return { data: { alunos: [], cursos: [], turmas: [], status: [] } };
        if (url === '/chamadas/form-options') return { data: { alunos: [], aulas: [], matriculas: [], presencas: [] } };
        if (url === '/avaliacoes/') return { data: { items: [], total: 0, page: 1 } };
        if (url === '/chamadas/') return { data: { items: [], total: 0, page: 1 } };
        if (url === '/cursos/') {
          const isFiltered = config?.params?.nome_in === JSON.stringify(['Curso A']);
          return paged(isFiltered
            ? [{ IdCurso: 'CUR-1', NomeCurso: 'Curso A', DescricaoCurso: 'Desc A', ativo: true }]
            : [
              { IdCurso: 'CUR-1', NomeCurso: 'Curso A', DescricaoCurso: 'Desc A', ativo: true },
              { IdCurso: 'CUR-2', NomeCurso: 'Curso B', DescricaoCurso: 'Desc B', ativo: true },
            ]);
        }
        return baseResponse;
      },
    },
    {
      name: 'chamadas',
      page: <ChamadasPage />,
      buttonName: 'Abrir filtros',
      drawerTestId: 'chamadas-filter-drawer',
      criterionLabel: 'Id Aluno',
      optionValue: 'ANA',
      listUrl: '/chamadas/frequencia-resumo',
      paramKey: 'id_aluno_in',
      initialCountText: '2 registro(s)',
      finalCountText: '1 registro(s)',
      mockGet: async (url, config = {}) => {
        if (url === '/chamadas/filter-options') return { data: { options: { id_aluno: ['ANA', 'BRUNO'] } } };
        if (url === '/chamadas/form-options') return { data: { alunos: [], aulas: [], matriculas: [], presencas: [] } };
        if (url === '/chamadas/frequencia-resumo') {
          const isFiltered = config?.params?.id_aluno_in === JSON.stringify(['ANA']);
          return paged(isFiltered
            ? [{ IdAluno: 'ALN-1', NomeAluno: 'ANA', TurmaIngresso: 'Turma A', TotalAulas: 12, Presencas: 10, Ausencias: 2, ativo: true }]
            : [
              { IdAluno: 'ALN-1', NomeAluno: 'ANA', TurmaIngresso: 'Turma A', TotalAulas: 12, Presencas: 10, Ausencias: 2, ativo: true },
              { IdAluno: 'ALN-2', NomeAluno: 'BRUNO', TurmaIngresso: 'Turma B', TotalAulas: 10, Presencas: 8, Ausencias: 2, ativo: true },
            ]);
        }
        return baseResponse;
      },
    },
    {
      name: 'interesses',
      page: <InteressesPage />,
      buttonName: 'Abrir filtros',
      drawerTestId: 'interesses-filter-drawer',
      criterionLabel: 'Descricao',
      optionValue: 'Robótica',
      listUrl: '/interesses/',
      paramKey: 'descricao_in',
      initialCountText: '2 registro(s)',
      finalCountText: '1 registro(s)',
      mockGet: async (url, config = {}) => {
        if (url === '/interesses/filter-options') return { data: { options: { descricao: ['Robótica', 'Música'] } } };
        if (url === '/interesses/') {
          const isFiltered = config?.params?.descricao_in === JSON.stringify(['Robótica']);
          return paged(isFiltered
            ? [{ IdInteresse: 'INT-1', Descricao: 'Robótica', ativo: true }]
            : [
              { IdInteresse: 'INT-1', Descricao: 'Robótica', ativo: true },
              { IdInteresse: 'INT-2', Descricao: 'Música', ativo: true },
            ]);
        }
        return baseResponse;
      },
    },
    {
      name: 'trilhas',
      page: <TrilhasPage />,
      buttonName: 'Abrir filtros',
      drawerTestId: 'trilhas-filter-drawer',
      criterionLabel: 'Nome',
      optionValue: 'Trilha Fullstack',
      listUrl: '/trilhas/',
      paramKey: 'nome_in',
      initialCountText: '2 registro(s)',
      finalCountText: '1 registro(s)',
      mockGet: async (url, config = {}) => {
        if (url === '/trilhas/filter-options') return { data: { options: { nome_trilha: ['Trilha Fullstack', 'Trilha Data'] } } };
        if (url === '/trilhas/') {
          const isFiltered = config?.params?.nome_in === JSON.stringify(['Trilha Fullstack']);
          return paged(isFiltered
            ? [{ IdTrilha: 'TRL-1', NomeTrilha: 'Trilha Fullstack', ativo: true }]
            : [
              { IdTrilha: 'TRL-1', NomeTrilha: 'Trilha Fullstack', ativo: true },
              { IdTrilha: 'TRL-2', NomeTrilha: 'Trilha Data', ativo: true },
            ]);
        }
        return baseResponse;
      },
    },
    {
      name: 'alunos-interesses',
      page: <AlunosInteressesPage />,
      buttonName: 'Abrir filtros',
      drawerTestId: 'alunos-interesses-filter-drawer',
      criterionLabel: 'Aluno',
      optionValue: 'ANA',
      listUrl: '/alunos-interesses/',
      paramKey: 'id_aluno',
      initialCountText: '2 registro(s)',
      finalCountText: '1 registro(s)',
      mockGet: async (url, config = {}) => {
        if (url === '/alunos-interesses/filter-options') return { data: { options: { id_aluno: ['ANA', 'BRUNO'] } } };
        if (url === '/alunos-interesses/form-options') return { data: { alunos: [], interesses: [] } };
        if (url === '/alunos-interesses/') {
          const isFiltered = config?.params?.id_aluno === JSON.stringify(['ANA']);
          return paged(isFiltered
            ? [{ IdAlunoInteresse: 'AI-1', IdAluno: 'ALN-1', NomeAluno: 'ANA', DescricaoInteresse: 'Robótica', ativo: true }]
            : [
              { IdAlunoInteresse: 'AI-1', IdAluno: 'ALN-1', NomeAluno: 'ANA', DescricaoInteresse: 'Robótica', ativo: true },
              { IdAlunoInteresse: 'AI-2', IdAluno: 'ALN-2', NomeAluno: 'BRUNO', DescricaoInteresse: 'Música', ativo: true },
            ]);
        }
        return baseResponse;
      },
    },
  ])('seleção de filtro reflete no total renderizado em $name', async (scenario) => {
    await expectFilterSelectionToNarrowRenderedResults(scenario);
  });
});
