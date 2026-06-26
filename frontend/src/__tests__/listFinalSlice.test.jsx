import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AvaliacoesPage from '../pages/Avaliacoes';
import ChamadasPage from '../pages/Chamadas';
import InteressesPage from '../pages/Interesses';
import ProfessoresPage from '../pages/Professores';

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
const getSortButton = (labelText) => screen.getAllByRole('button', { name: labelText }).find((node) => node.classList.contains('sort-btn'));
const getPanelControl = (labelText) => {
  const labelNode = screen.getAllByText(labelText).find((node) => node.closest('form.card'));
  const field = labelNode.closest('.field') || labelNode.closest('label.field.checkbox');
  return field.querySelector('input, select, textarea');
};
const getDrawerControl = (labelText) => {
  const labelNode = screen.getAllByText(labelText).find((node) => node.closest('.list-filter-drawer'));
  const field = labelNode.closest('.field');
  return field.querySelector('input, select, textarea');
};

describe('Fatia final das listagens', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.put.mockReset();
    api.delete.mockReset();
    notify.mockReset();
    window.confirm = jest.fn(() => true);
    HTMLElement.prototype.scrollIntoView = jest.fn();
    URL.createObjectURL = jest.fn(() => 'blob:foto-professor');
    URL.revokeObjectURL = jest.fn();
    global.FileReader = class MockFileReader {
      readAsDataURL() {
        this.result = 'data:image/png;base64,ZmFrZQ==';
        if (this.onload) this.onload({ target: { result: this.result } });
      }
    };
  });

  test('Avaliações usa drawer de filtros, mostra datas e preserva breadcrumb quando vem de alunos', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/avaliacoes/filter-options') {
        return { data: { options: { nota: ['8.5'], status: ['CONCLUÍDO'], obs: ['Recuperação'] } } };
      }
      if (url === '/avaliacoes/form-options') {
        return { data: { alunos: [{ id: 'ALN-12345', nome: 'Ana' }], cursos: [{ id: 'CUR-8888', nome: 'Matemática' }], status: ['CONCLUÍDO'] } };
      }
      if (url === '/avaliacoes/') {
        return {
          data: {
            items: [{ IdAvaliacao: 'AVL-9001', Nota: 8.5, Status: 'CONCLUÍDO', OBS: 'Recuperação', IdAluno: 'ALN-12345', IdCurso: 'CUR-8888', NomeAluno: 'Ana', NomeCurso: 'Matemática', DataIngresso: '2026-02-01', DataConclusao: '2026-12-20', ativo: true }],
            total: 1,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter initialEntries={['/avaliacoes?origin=alunos&aluno=ALN-12345&alunoNome=Ana&create=1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AvaliacoesPage />
      </MemoryRouter>
    );

    const anaElements = await screen.findAllByText('Ana');
    expect(anaElements.length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Alunos');
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Ana');
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/alunos?edit=ALN-12345');
    expect(screen.getByText('01/02/2026')).toBeInTheDocument();
    expect(screen.getByText('20/12/2026')).toBeInTheDocument();
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^ID$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    await waitFor(() => expect(screen.getByTestId('avaliacoes-filter-drawer')).toHaveClass('open'));
    expect(screen.queryByPlaceholderText('Buscar')).not.toBeInTheDocument();
    const drawer = screen.getByTestId('avaliacoes-filter-drawer');
    expect(within(drawer).getByRole('button', { name: /Nota/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Status/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Observação/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /^Aluno$/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /^Curso/i })).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole('button', { name: /Nota/i }));
    fireEvent.click(within(drawer).getByRole('checkbox', { name: /8.5/i }));
    expect(screen.getByRole('button', { name: /Nota: 8.5/i })).toBeInTheDocument();
    expect(within(drawer).queryByLabelText('Filtros selecionados')).not.toBeInTheDocument();
    const selectedChips = screen.getByLabelText('Filtros selecionados');
    expect(within(selectedChips).getByRole('button', { name: /Nota: 8.5/i })).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole('checkbox', { name: /8.5/i }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Nota: 8.5/i })).not.toBeInTheDocument();
    });

    const updatedAnaElements = await screen.findAllByText('Ana');
    const updatedAvaliacaoRowLabel = updatedAnaElements.find((el) => el.closest('tr'));
    fireEvent.click(within(updatedAvaliacaoRowLabel.closest('tr')).getByRole('button', { name: 'Detalhes' }));
    await waitFor(() => expect(screen.getByText('Detalhes da Avaliação')).toBeInTheDocument());
    expect(getPanelControl('Aluno')).not.toBeDisabled();
  });

  test('Avaliações reordena por status ao clicar no cabeçalho', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/avaliacoes/filter-options') {
        return { data: { options: { nota: ['7.0', '9.5'], obs: ['Revisar', 'Excelente'] } } };
      }
      if (url === '/avaliacoes/') {
        return {
          data: {
            items: [
              { IdAvaliacao: 'AVL-2', Nota: 9.5, Status: 'PENDENTE', OBS: 'Excelente', IdAluno: 'ALN-2', IdCurso: 'CUR-2', NomeAluno: 'Bruno', NomeCurso: 'Biologia', ativo: true },
              { IdAvaliacao: 'AVL-1', Nota: 7.0, Status: 'CONCLUÍDO', OBS: 'Revisar', IdAluno: 'ALN-1', IdCurso: 'CUR-1', NomeAluno: 'Ana', NomeCurso: 'Matemática', ativo: true },
            ],
            total: 2,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AvaliacoesPage />
      </MemoryRouter>
    );

    await screen.findByText('Bruno');
    const getFirstStatus = () => container.querySelector('tbody tr td:nth-child(4)')?.textContent;
    const getListFetchCalls = () => api.get.mock.calls.filter(([url]) => url === '/avaliacoes/').length;
    const initialListFetchCalls = getListFetchCalls();

    expect(initialListFetchCalls).toBeGreaterThanOrEqual(1);

    fireEvent.click(getSortButton(/Status/i));
    await waitFor(() => {
      expect(getFirstStatus()).toBe('CONCLUÍDO');
    });
    expect(getListFetchCalls()).toBe(initialListFetchCalls);

    fireEvent.click(getSortButton(/Status/i));
    await waitFor(() => {
      expect(getFirstStatus()).toBe('PENDENTE');
    });
    expect(getListFetchCalls()).toBe(initialListFetchCalls);
  });

  test('Chamadas mascara IDs, usa filtro por nome e abre drawer de filtros', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/chamadas/filter-options') {
        return { data: { options: { data: ['2026-04-18'], presenca: ['Presente'], id_aluno: ['Ana'], aula: ['Matemática'], id_matricula: ['Ana'] } } };
      }
      if (url === '/chamadas/form-options') {
        return { data: { alunos: [{ id: 'ALN-12345', nome: 'Ana' }], aulas: [{ id: 'AULA-1', nome: 'Matemática' }], matriculas: [{ id: 'MAT-7777', nome: 'Ana' }], presencas: ['Presente', 'Ausente'] } };
      }
      if (url === '/chamadas/frequencia-resumo') {
        return {
          data: {
            items: [{ IdAluno: 'ALN-12345', NomeAluno: 'Ana', TurmaIngresso: 'Turma A', TotalAulas: 12, Presencas: 10, Ausencias: 2, ativo: true }],
            total: 1,
            page: 1,
          },
        };
      }
      if (url === '/chamadas/') {
        return {
          data: {
            items: [{ IdChamada: 'CH-1200', Data: '2026-04-18', IdAluno: 'ALN-12345', Aula: 'Matemática', NomeAluno: 'Ana', NomeAula: 'Matemática', Presenca: 'Presente', IdMatricula: 'MAT-7777', ResumoMatricula: 'Matemática • Turma A • Ativo', ativo: true }],
            total: 1,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter initialEntries={['/chamadas?origin=alunos&aluno=ALN-12345&alunoNome=Ana']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ChamadasPage />
      </MemoryRouter>
    );

    const chamadaRowLabel = await screen.findByText((content, element) => element.classList.contains('table-primary-text') && content === 'Ana');
    expect(chamadaRowLabel).toBeInTheDocument();
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Alunos');
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Ana');
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/alunos?edit=ALN-12345');
    expect(screen.getByText('Turma A')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /ID Aluno/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    await waitFor(() => expect(screen.getByTestId('chamadas-filter-drawer')).toHaveClass('open'));
    expect(screen.queryByPlaceholderText('Buscar')).not.toBeInTheDocument();
    const drawer = screen.getByTestId('chamadas-filter-drawer');
    expect(within(drawer).getByRole('button', { name: /^Data$/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /^Presença$/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Id Aluno/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /^Aula/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Matrícula/i })).toBeInTheDocument();

    fireEvent.click(within(chamadaRowLabel.closest('tr')).getByRole('button', { name: 'Detalhes' }));
    await waitFor(() => expect(screen.getByText('Detalhes da Frequência')).toBeInTheDocument());
      expect(screen.getAllByText('Chamadas Relacionadas').length).toBeGreaterThan(0);
  });

  test('Interesses mantém descrição em foco, esconde header de ID explícito e abre já editável', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/interesses/filter-options') {
        return { data: { options: { descricao: ['Robótica'] } } };
      }
      if (url === '/interesses/') {
        return {
          data: {
            items: [{ IdInteresse: 'INT-6000', Descricao: 'Robótica', ativo: true }],
            total: 1,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <InteressesPage />
      </MemoryRouter>
    );

    const interesseRowLabel = await screen.findByText('Robótica');
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Interesses');
    expect(screen.queryByRole('columnheader', { name: /^ID$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar interesse Robótica' })[0]);
    await waitFor(() => expect(screen.getByText('Interesse: Robótica')).toBeInTheDocument());
    const descricaoInput = screen.getByDisplayValue('Robótica');
    expect(descricaoInput).not.toBeDisabled();
  });

  test('Professores carrega fallback legado, abre detalhes pelo cartão e expõe atalho de WhatsApp', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/professores/filter-options') {
        throw new Error('sem filtro dedicado');
      }
      if (url === '/professores/') {
        throw new Error('rota principal indisponível');
      }
      if (url === '/academico/professores') {
        return {
          data: [{ IdProfessor: 'PROF-2024', NomeProfessor: 'Maria Silva', EmailProfessor: 'maria@escola.com', Telefone: '14998765432', WhatsApp: true, Endereco: 'Rua A, 10' }],
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProfessoresPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('(14) 99876-5432')).toBeInTheDocument();
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Professores');
    expect(document.querySelector('.entity-header .search-input')).toBeNull();
    fireEvent.click(screen.getByRole('heading', { name: 'Maria Silva' }));

    await waitFor(() => expect(screen.getByText('Detalhes do Professor')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/5514998765432');
  });

  test('Professores marca visualmente os campos obrigatórios do formulário', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/professores/filter-options') {
        return { data: { options: { nome: [], email: [] } } };
      }
      if (url === '/professores/') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProfessoresPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar professor' }));
    expect(screen.getAllByText('Nome').some((node) => node.classList.contains('field-label-required'))).toBe(true);
    expect(screen.getAllByText('E-mail').some((node) => node.classList.contains('field-label-required'))).toBe(true);
    expect(screen.getAllByText('Telefone').some((node) => node.classList.contains('field-label-required'))).toBe(true);
    expect(screen.getAllByText('DDD').some((node) => node.classList.contains('field-label-required'))).toBe(true);
    expect(screen.getAllByText('Número do telefone').some((node) => node.classList.contains('field-label-required'))).toBe(true);
  });

  test('Professores lista obrigatórios na ordem do formulário e rola até o primeiro inválido', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/professores/filter-options') {
        return { data: { options: { nome: [], email: [] } } };
      }
      if (url === '/professores/') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProfessoresPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar professor' }));
    fireEvent.change(getPanelControl('Nome'), { target: { value: 'Maria Silva' } });
    fireEvent.change(getPanelControl('E-mail'), { target: { value: 'maria@escola.com' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(api.post).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      'Preencha os campos obrigatórios: DDD, Número do telefone.',
      expect.objectContaining({ type: 'error' })
    );
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  test('Professores exibe apenas critérios no drawer de filtros', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/professores/filter-options') {
        return { data: { options: { nome: ['Maria Silva'], email: ['maria@escola.com'], telefone: ['14998765432'], whatsapp: ['Sim', 'Não'], endereco: ['Rua A, 10'] } } };
      }
      if (url === '/professores/') {
        return {
          data: {
            items: [{ id_professor: 'PROF-2024', nome: 'Maria Silva', email: 'maria@escola.com', telefone: '14998765432', ativo: true }],
            total: 1,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProfessoresPage />
      </MemoryRouter>
    );

    await screen.findByText('(14) 99876-5432');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));

    expect(screen.queryByPlaceholderText('Buscar')).not.toBeInTheDocument();
    const drawer = screen.getByTestId('professores-filter-drawer');
    expect(within(drawer).getByRole('button', { name: /^Nome/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /E-mail/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Telefone/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /WhatsApp/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Endereço/i })).toBeInTheDocument();
  });

  test('Professores reaproveita os registros carregados quando faltam opções de filtro', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/professores/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/professores/') {
        return {
          data: {
            items: [{ id_professor: 'PROF-2024', nome: 'Maria Silva', email: 'maria@escola.com', telefone: '14998765432', ativo: true }],
            total: 1,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProfessoresPage />
      </MemoryRouter>
    );

    await screen.findByText('(14) 99876-5432');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    const drawer = screen.getByTestId('professores-filter-drawer');
    fireEvent.click(within(drawer).getByRole('button', { name: /Nome/i }));

    await waitFor(() => {
      expect(within(drawer).getByRole('checkbox', { name: /Maria Silva/i })).toBeInTheDocument();
    });
  });

  test('Professores permite upload e remoção de foto como no formulário de alunos', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/professores/filter-options') {
        return { data: { options: { nome: ['Maria Silva'], email: ['maria@escola.com'] } } };
      }
      if (url === '/professores/') {
        return {
          data: {
            items: [{ id_professor: 'PROF-2024', nome: 'Maria Silva', email: 'maria@escola.com', telefone: '14998765432', foto: '/api/static/professores/maria.jpg', ativo: true }],
            total: 1,
            page: 1,
          },
        };
      }
      return { data: {} };
    });
    api.post.mockResolvedValue({ data: { url: '/api/static/professores/maria-nova.jpg' } });
    api.put.mockResolvedValue({ data: {} });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProfessoresPage />
      </MemoryRouter>
    );

    await screen.findByText('(14) 99876-5432');
    fireEvent.click(screen.getByRole('heading', { name: 'Maria Silva' }));

    const uploadButton = await screen.findByRole('button', { name: 'Trocar foto' });
    expect(uploadButton).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('URL da foto')).not.toBeInTheDocument();

    const fileInput = container.querySelector('#professor-photo-upload');
    const file = new File(['conteudo'], 'foto.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/professores/PROF-2024/imagem', expect.any(FormData), expect.any(Object));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remover foto' }));
    expect(screen.getByRole('button', { name: 'Nova foto' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/professores/PROF-2024', expect.objectContaining({ Foto: null }));
    });
  });

  test('Professores aceita foto local antes do primeiro salvamento', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/professores/filter-options') {
        return { data: { options: { nome: [], email: [] } } };
      }
      if (url === '/professores/') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      return { data: {} };
    });
    api.post.mockResolvedValue({ data: { id_professor: 'PROF-NEW-1' } });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProfessoresPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar professor' }));
    fireEvent.change(getPanelControl('Nome'), { target: { value: 'Nova Professora' } });
    fireEvent.change(getPanelControl('E-mail'), { target: { value: 'nova@escola.com' } });
    fireEvent.change(getPanelControl('DDI'), { target: { value: '55' } });
    fireEvent.change(getPanelControl('DDD'), { target: { value: '14' } });
    fireEvent.change(getPanelControl('Número do telefone'), { target: { value: '998765432' } });

    expect(screen.getByRole('button', { name: 'Nova foto' })).toBeInTheDocument();

    const fileInput = container.querySelector('#professor-photo-upload');
    const file = new File(['conteudo'], 'foto-local.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText('Arquivo selecionado: foto-local.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trocar foto' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/professores/', expect.objectContaining({
        NomeProfessor: 'Nova Professora',
        Telefone: '14998765432',
        TelefoneDDI: '55',
        TelefoneDDD: '14',
        TelefoneNumero: '998765432',
        Foto: null,
      }));
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/professores/PROF-NEW-1/imagem', expect.any(FormData), expect.any(Object));
    });
  });
});
