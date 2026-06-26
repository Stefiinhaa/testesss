import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AlunosPage from '../pages/Alunos';

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

const getFieldControl = (labelText) => {
  const labelNode = screen.getAllByText(labelText).find((node) => node.closest('.field'));
  const field = labelNode.closest('.field');
  return field.querySelector('input, select, textarea');
};

const getPanelFieldControl = (labelText) => {
  const labelNode = screen.getAllByText(labelText).find((node) => node.closest('.details-form-stack') || node.closest('form.card'));
  const field = labelNode.closest('.field') || labelNode.closest('label.field.checkbox');
  return field.querySelector('input, select, textarea');
};

const getDrawerFieldControl = (labelText) => {
  const labelNode = screen.getAllByText(labelText).find((node) => node.closest('.list-filter-drawer'));
  const field = labelNode.closest('.field');
  return field.querySelector('input, select, textarea');
};

const fillRequiredAlunoFields = ({
  nome = 'Ana',
  email = 'ana@teste.com',
  dataNascimento = '01012000',
  cidadeNascimento = 'Marília',
  foneCelularDdi = '55',
  foneCelularDdd = '14',
  foneCelularNumero = '998765432',
  escolaFundamental = 'EE Centro',
  escolaAtual = 'EE Atual',
  turno = 'Manhã',
  turma = 'T-1',
  situacao = 'Em Aberto',
} = {}) => {
  fireEvent.change(getPanelFieldControl('Nome completo do aluno(a)'), { target: { value: nome } });
  fireEvent.change(getPanelFieldControl('E-mail'), { target: { value: email } });
  fireEvent.change(getPanelFieldControl('Data de Nascimento'), { target: { value: dataNascimento } });
  fireEvent.change(getPanelFieldControl('Cidade de Nascimento'), { target: { value: cidadeNascimento } });
  fireEvent.change(getPanelFieldControl('DDI'), { target: { value: foneCelularDdi } });
  fireEvent.change(getPanelFieldControl('DDD'), { target: { value: foneCelularDdd } });
  fireEvent.change(getPanelFieldControl('Número do celular'), { target: { value: foneCelularNumero } });
  fireEvent.change(getPanelFieldControl('Escola Cursada Ensino Fundamental'), { target: { value: escolaFundamental } });
  fireEvent.change(getPanelFieldControl('Escola Atual'), { target: { value: escolaAtual } });
  fireEvent.change(getPanelFieldControl('Turno'), { target: { value: turno } });
  fireEvent.change(getPanelFieldControl('Turma de ingresso'), { target: { value: turma } });
  fireEvent.change(getPanelFieldControl('Situação'), { target: { value: situacao } });
};

describe('Melhorias do formulário de alunos', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.put.mockReset();
    api.delete.mockReset();
    notify.mockClear();
    mockNavigate.mockReset();
    window.confirm = jest.fn(() => true);
    URL.createObjectURL = jest.fn(() => 'blob:foto-aluno');
    URL.revokeObjectURL = jest.fn();
    global.FileReader = class MockFileReader {
      readAsDataURL() {
        this.result = 'data:image/png;base64,ZmFrZQ==';
        if (this.onload) this.onload({ target: { result: this.result } });
      }
    };
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  test('aplica máscaras e mostra campos condicionais', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Abrir filtros' });
    expect(document.querySelector('.entity-header .search-input')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    expect(screen.queryByLabelText('Pesquisar alunos')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar aluno' }));

    fireEvent.change(getFieldControl('CPF'), { target: { value: '12345678901' } });
    expect(getFieldControl('CPF')).toHaveValue('123.456.789-01');

    fireEvent.change(getFieldControl('DDD'), { target: { value: '14' } });
    fireEvent.change(getFieldControl('Número do celular'), { target: { value: '998765432' } });
    expect(getFieldControl('DDD')).toHaveValue('14');
    expect(getFieldControl('Número do celular')).toHaveValue('998765432');

    fireEvent.change(getFieldControl('CEP'), { target: { value: '17400000' } });
    expect(getFieldControl('CEP')).toHaveValue('17400-000');

    fireEvent.change(getFieldControl('Trabalha?'), { target: { value: 'Sim' } });
    expect(await screen.findByTestId('aluno-empresa-field')).toBeInTheDocument();
    expect(await screen.findByTestId('aluno-funcao-field')).toBeInTheDocument();
    expect(getFieldControl('Em qual função?')).toBeInTheDocument();

    fireEvent.change(getFieldControl('Está satisfeito no trabalho?'), { target: { value: 'Sim' } });
    await waitFor(() => {
      expect(screen.queryByTestId('aluno-motivo-field')).not.toBeInTheDocument();
    });

    fireEvent.change(getFieldControl('Está satisfeito no trabalho?'), { target: { value: 'Não' } });
    expect(await screen.findByTestId('aluno-motivo-field')).toBeInTheDocument();

    fireEvent.change(getFieldControl('Situação'), { target: { value: 'Cancelado' } });
    expect(await screen.findByTestId('aluno-motivo-field')).toBeInTheDocument();

    fireEvent.change(getFieldControl('Trabalha?'), { target: { value: 'Não' } });
    fireEvent.change(getFieldControl('Faz estágio?'), { target: { value: 'Sim' } });
    expect(await screen.findByTestId('aluno-empresa-field')).toBeInTheDocument();
    expect(await screen.findByTestId('aluno-funcao-field')).toBeInTheDocument();

    fireEvent.change(getFieldControl('Faz estágio?'), { target: { value: 'Não' } });

    await waitFor(() => {
      expect(screen.queryByTestId('aluno-empresa-field')).not.toBeInTheDocument();
      expect(screen.queryByTestId('aluno-funcao-field')).not.toBeInTheDocument();
    });
  });

  test('normaliza resposta em array simples sem quebrar a listagem', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/filter-options') {
        throw new Error('sem opções');
      }
      if (url === '/alunos') {
        return { data: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', AlunoDestaque: true, DescricaoDestaque: 'Representa a turma', Email: 'ana@teste.com', Situacao: 'Em Aberto', IdTurma: 'T1' }] };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('SIM')).toBeInTheDocument();
    expect(screen.getByText('Representa a turma')).toBeInTheDocument();
  });

  test('drawer de alunos exibe apenas critérios de filtro', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana' }], total: 1, page: 1 } };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Abrir filtros' });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));

    expect(screen.queryByPlaceholderText('Buscar')).not.toBeInTheDocument();
    const drawer = screen.getByTestId('alunos-filter-drawer');
    expect(within(drawer).getByRole('button', { name: 'Sexo' })).toBeInTheDocument();
  });

  test('filtra alunos por Nome Completo do Aluno(a) com nome_in exato', async () => {
    api.get.mockImplementation(async (url, config = {}) => {
      if (url === '/alunos/filter-options') {
        return { data: { options: { nome: ['ALEX PAVARINI', 'BRUNA ROCHA'] } } };
      }
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [], situacoes: ['Em Aberto'] } };
      }
      if (url === '/alunos') {
        const params = config.params || {};
        const nomeIn = params.nome_in;
        if (nomeIn === JSON.stringify(['ALEX PAVARINI'])) {
          return {
            data: {
              items: [{ IdAluno: 'ALN-1', NomeAluno: 'ALEX PAVARINI', Situacao: 'Em Aberto' }],
              total: 1,
              page: 1,
            },
          };
        }

        return {
          data: {
            items: [
              { IdAluno: 'ALN-1', NomeAluno: 'ALEX PAVARINI', Situacao: 'Em Aberto' },
              { IdAluno: 'ALN-2', NomeAluno: 'BRUNA ROCHA', Situacao: 'Em Aberto' },
            ],
            total: 2,
            page: 1,
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByText('ALEX PAVARINI');
    expect(screen.getByText('BRUNA ROCHA')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    const drawer = await screen.findByTestId('alunos-filter-drawer');
    fireEvent.click(within(drawer).getByRole('button', { name: 'Nome Completo do Aluno(a)' }));

    const alexCheckbox = await within(drawer).findByRole('checkbox', { name: 'ALEX PAVARINI' });
    fireEvent.click(alexCheckbox);

    await waitFor(() => {
      const alunoCalls = api.get.mock.calls.filter(([calledUrl]) => calledUrl === '/alunos');
      const hasExactFilterCall = alunoCalls.some(([, calledConfig]) => calledConfig?.params?.nome_in === JSON.stringify(['ALEX PAVARINI']));
      expect(hasExactFilterCall).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByText('ALEX PAVARINI', { selector: '.table-primary-text' })).toBeInTheDocument();
      expect(screen.queryByText('BRUNA ROCHA', { selector: '.table-primary-text' })).not.toBeInTheDocument();
    });
  });

  test('restringe paginação para 10, 50 e 100 e refaz busca paginada sob demanda', async () => {
    api.get.mockImplementation(async (url, config = {}) => {
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [], situacoes: ['Em Aberto'] } };
      }
      if (url === '/alunos') {
        const params = config.params || {};
        const currentPage = Number(params.page || 1);
        const perPage = Number(params.per_page || 10);
        return {
          data: {
            items: Array.from({ length: Math.min(perPage, 2) }, (_, index) => ({
              IdAluno: `ALN-${currentPage}-${index + 1}`,
              NomeAluno: `Aluno ${currentPage}-${index + 1}`,
              Situacao: 'Em Aberto',
            })),
            total: 120,
            page: currentPage,
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByText('Aluno 1-1');

    const listCalls = () => api.get.mock.calls.filter(([url]) => url === '/alunos');
    expect(listCalls()[0][1].params).toMatchObject({ page: 1, per_page: 10 });

    const pageSizeSelect = screen.getByDisplayValue('10');
    expect(Array.from(pageSizeSelect.querySelectorAll('option')).map((option) => option.value)).toEqual(['10', '50', '100']);

    fireEvent.change(pageSizeSelect, { target: { value: '50' } });

    await waitFor(() => {
      const calls = listCalls();
      expect(calls.some(([, config]) => config.params?.page === 1 && config.params?.per_page === 50)).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: '>' }));

    await waitFor(() => {
      const calls = listCalls();
      expect(calls.some(([, config]) => config.params?.page === 2 && config.params?.per_page === 50)).toBe(true);
    });
  });

  test('exibe campos de destaque logo após nome e foto no formulário', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', Imagem: '/api/static/alunos/aln-1.jpg', AlunoDestaque: true, DescricaoDestaque: 'Representa a turma' }], total: 1, page: 1 } };
      }
      if (url === '/alunos/ALN-1/details') {
        return { data: { item: { id_aluno: 'ALN-1', nome: 'Ana', imagem: '/api/static/alunos/aln-1.jpg', aluno_destaque: true, descricao_destaque: 'Representa a turma' } } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Editar aluno' }));

    expect(await screen.findByLabelText('Descrição destaque')).toHaveValue('Representa a turma');
    expect(screen.getByLabelText('Destaque')).toBeChecked();
    expect(screen.getAllByAltText('Foto de Ana').length).toBeGreaterThan(0);
  });

  test('mantém a ordem pedida após fone celular e whatsapp', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã', 'Tarde'], turmas: [{ id: 'T-1', nome: 'Turma A' }], situacoes: ['Em Aberto', 'Concluído'], escolas_ensino_medio: ['EE Centro'], escolas_atuais: ['EE Atual'] } };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Adicionar aluno' });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar aluno' }));

    const orderedLabels = [
      'Fone Celular',
      'WhatsApp',
      'CEP',
      'Rua Residencial',
      'Número Residencial',
      'Bairro Residencial',
      'Complemento Residencial',
      'Cidade',
      'Estado',
      'País',
      'Endereço',
      'Pai',
      'Mãe',
      'Escola Cursada Ensino Fundamental',
      'Escola Atual',
      'Turno',
      'Data de Ingresso',
      'Data de Conclusão',
      'Turma de ingresso',
      'Trabalha?',
      'Faz estágio?',
      'Situação',
    ];

    const formLabels = Array.from(container.querySelectorAll('.details-form-stack .field label, .details-form-stack label.field.checkbox'))
      .map((node) => node.textContent.trim().replace(/\s+/g, ' '));

    const positions = orderedLabels.map((label) => formLabels.indexOf(label));

    positions.forEach((position) => {
      expect(position).toBeGreaterThanOrEqual(0);
    });

    positions.reduce((previous, current) => {
      if (previous !== null) {
        expect(current).toBeGreaterThan(previous);
      }
      return current;
    }, null);
  });

    test('marca os campos obrigatórios visuais do formulário principal', async () => {
      api.get.mockImplementation(async (url) => {
        if (url === '/alunos/form-options') {
          return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }], situacoes: ['Em Aberto'], escolas_ensino_medio: ['EE Centro'], escolas_atuais: ['EE Atual'] } };
        }
        if (url === '/alunos/filter-options') {
          return { data: { options: { naturalidade: ['Marília'], setor: ['Administrativo'] } } };
        }
        if (url === '/alunos') {
          return { data: { items: [], total: 0, page: 1 } };
        }
        return { data: {} };
      });

      render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AlunosPage />
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Adicionar aluno' }));

      ['Nome completo do aluno(a)', 'E-mail', 'Data de Nascimento', 'Cidade de Nascimento', 'Fone Celular', 'Escola Cursada Ensino Fundamental', 'Escola Atual', 'Turno', 'Turma de ingresso', 'Situação'].forEach((labelText) => {
        expect(screen.getAllByText(labelText).some((node) => node.classList.contains('field-label-required'))).toBe(true);
      });
    });

    test('Enter avança o foco sem acionar salvamento acidental', async () => {
      api.get.mockImplementation(async (url) => {
        if (url === '/alunos/form-options') {
          return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }], situacoes: ['Em Aberto'] } };
        }
        if (url === '/alunos/filter-options') {
          return { data: { options: {} } };
        }
        if (url === '/alunos') {
          return { data: { items: [], total: 0, page: 1 } };
        }
        return { data: {} };
      });

      render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AlunosPage />
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Adicionar aluno' }));

      const nomeField = getPanelFieldControl('Nome completo do aluno(a)');
      const destaqueField = screen.getByLabelText('Destaque');
      nomeField.focus();

      fireEvent.keyDown(nomeField, { key: 'Enter', code: 'Enter', charCode: 13 });

      expect(api.post).not.toHaveBeenCalled();
      expect(destaqueField).toHaveFocus();
    });

    test('desabilita salvamento enquanto houver obrigatórios ausentes e mostra o resumo no feedback HTML', async () => {
      api.get.mockImplementation(async (url) => {
        if (url === '/alunos/form-options') {
          return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }], situacoes: ['Em Aberto'] } };
        }
        if (url === '/alunos/filter-options') {
          return { data: { options: {} } };
        }
        if (url === '/alunos') {
          return { data: { items: [], total: 0, page: 1 } };
        }
        return { data: {} };
      });

      render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AlunosPage />
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Adicionar aluno' }));
      const saveButton = screen.getByRole('button', { name: 'Salvar' });

      expect(saveButton).not.toBeDisabled();
      fireEvent.click(saveButton);

      expect(api.post).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('Nome completo do aluno(a)'), expect.objectContaining({ type: 'error' }));
      expect(document.getElementById('aluno-form-feedback')).toHaveTextContent('Nome completo do aluno(a)');
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();

      fillRequiredAlunoFields();

      await waitFor(() => {
        expect(document.getElementById('aluno-form-feedback')).not.toHaveTextContent('Nome completo do aluno(a)');
      });
    });

    test('exige Em qual função quando trabalho ou estágio estiver ativo', async () => {
      api.get.mockImplementation(async (url) => {
        if (url === '/alunos/form-options') {
          return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }], situacoes: ['Em Aberto'] } };
        }
        if (url === '/alunos/filter-options') {
          return { data: { options: {} } };
        }
        if (url === '/alunos') {
          return { data: { items: [], total: 0, page: 1 } };
        }
        return { data: {} };
      });

      render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AlunosPage />
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Adicionar aluno' }));
      fillRequiredAlunoFields();
      fireEvent.change(getPanelFieldControl('Trabalha?'), { target: { value: 'Sim' } });

      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(api.post).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Salvar' })).not.toBeDisabled();
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('Em qual função?'), expect.objectContaining({ type: 'error' }));
      expect(document.getElementById('aluno-form-feedback')).toHaveTextContent('Em qual função?');
    });

    test('campos editáveis usam datalist com valores existentes para cidade de nascimento, escolas e setor', async () => {
      api.get.mockImplementation(async (url) => {
        if (url === '/alunos/form-options') {
          return {
            data: {
              turnos: ['Manhã'],
              turmas: [],
              situacoes: ['Em Aberto'],
              escolas_ensino_medio: ['EE Centro'],
              escolas_atuais: ['EE Atual'],
            },
          };
        }
        if (url === '/alunos/filter-options') {
          return { data: { options: { naturalidade: ['Marília'], setor: ['Administrativo'] } } };
        }
        if (url === '/alunos') {
          return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', CidadeNaturalidade: 'Assis', Setor: 'Comercial' }], total: 1, page: 1 } };
        }
        return { data: {} };
      });

      render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AlunosPage />
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Adicionar aluno' }));

      expect(getPanelFieldControl('Cidade de Nascimento').tagName).toBe('INPUT');
      expect(getPanelFieldControl('Cidade de Nascimento')).toHaveAttribute('list', 'aluno-cidade-nascimento-options');
      expect(getPanelFieldControl('Escola Cursada Ensino Fundamental').tagName).toBe('INPUT');
      expect(getPanelFieldControl('Escola Atual').tagName).toBe('INPUT');
      expect(getPanelFieldControl('Setor').tagName).toBe('INPUT');
      expect(document.querySelector('#aluno-cidade-nascimento-options option[value="Marília"]')).not.toBeNull();
      expect(document.querySelector('#aluno-cidade-nascimento-options option[value="Assis"]')).not.toBeNull();
      expect(document.querySelector('#aluno-escola-fundamental-options option[value="EE Centro"]')).not.toBeNull();
      expect(document.querySelector('#aluno-escola-atual-options option[value="EE Atual"]')).not.toBeNull();
      expect(document.querySelector('#aluno-setor-options option[value="Administrativo"]')).not.toBeNull();
      expect(document.querySelector('#aluno-setor-options option[value="Comercial"]')).not.toBeNull();
    });

    test('busca CEP pelo botão e recompõe endereço quando o número residencial muda', async () => {
      api.get.mockImplementation(async (url) => {
        if (url === '/alunos/form-options') {
          return {
            data: {
              turnos: ['Manhã'],
              turmas: [{ id: 'T-1', nome: 'Turma A' }],
              situacoes: ['Em Aberto'],
              escolas_ensino_medio: ['EE Centro'],
              escolas_atuais: ['EE Atual'],
            },
          };
        }
        if (url === '/alunos/filter-options') {
          return { data: { options: {} } };
        }
        if (url === '/alunos') {
          return { data: { items: [], total: 0, page: 1 } };
        }
        if (url === '/alunos/cep-lookup') {
          return {
            data: {
              item: {
                cep: '17400000',
                rua_residencial: 'Rua das Flores',
                bairro_residencial: 'Centro',
                cidade: 'Marília',
                estado: 'SP',
                pais: 'Brasil',
              },
            },
          };
        }
        return { data: {} };
      });
      api.post.mockResolvedValue({ data: { id: 'ALN-2' } });

      render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AlunosPage />
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Adicionar aluno' }));
      fillRequiredAlunoFields();
      fireEvent.change(getPanelFieldControl('CEP'), { target: { value: '17400000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Buscar CEP' }));

      await waitFor(() => {
        expect(getPanelFieldControl('Rua Residencial')).toHaveValue('Rua das Flores');
        expect(getPanelFieldControl('Bairro Residencial')).toHaveValue('Centro');
        expect(getPanelFieldControl('Cidade')).toHaveValue('Marília');
      });

      fireEvent.change(getPanelFieldControl('Número Residencial'), { target: { value: '120' } });
      expect(getPanelFieldControl('Endereço')).toHaveValue('Rua das Flores, 120, Centro, Marília, SP, 17400-000, Brasil');

      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/alunos', expect.objectContaining({
          NomeAluno: 'Ana',
          NumResidencial: '120',
          Endereco: 'Rua das Flores, 120, Centro, Marília, SP, 17400-000, Brasil',
        }));
      });
    });

  test('breadcrumb de alunos fecha o painel de edição', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }] } };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', IdTurma: 'T-1' }], total: 1, page: 1 } };
      }
      if (url === '/alunos/ALN-1/details') {
        return { data: { item: { id_aluno: 'ALN-1', nome: 'Ana', id_turma: 'T-1' } } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Editar aluno' }));

    expect(await screen.findByText('Detalhes do Aluno')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Alunos' }));

    await waitFor(() => {
      expect(screen.queryByText('Detalhes do Aluno')).not.toBeInTheDocument();
    });
  });

  test('abre o aluno diretamente quando a página recebe o parâmetro edit na query string', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }], situacoes: ['Em Aberto'] } };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', Email: 'ana@teste.com', IdTurma: 'T-1', Situacao: 'Em Aberto' }], total: 1, page: 1 } };
      }
      if (url === '/alunos/ALN-1/details') {
        return { data: { item: { id_aluno: 'ALN-1', nome: 'Ana', email: 'ana@teste.com', id_turma: 'T-1', situacao: 'Em Aberto' } } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter initialEntries={['/alunos?edit=ALN-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Detalhes do Aluno')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ana')).toBeInTheDocument();
  });

  test('fecha o painel aberto por query string e limpa o parâmetro edit', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }], situacoes: ['Em Aberto'] } };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', Email: 'ana@teste.com', IdTurma: 'T-1', Situacao: 'Em Aberto' }], total: 1, page: 1 } };
      }
      if (url === '/alunos/ALN-1/details') {
        return {
          data: {
            item: {
              id_aluno: 'ALN-1',
              nome: 'Ana',
              email: 'ana@teste.com',
              id_turma: 'T-1',
              situacao: 'Em Aberto',
              interesses: ['Robótica'],
              avaliacoes_relacionadas: [],
              matriculas_relacionadas: [],
              chamadas_relacionadas: [],
              totais_relacionados: { total_aulas: 0, presencas: 0, faltas: 0 },
            },
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter initialEntries={['/alunos?edit=ALN-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Detalhes do Aluno')).toBeInTheDocument();
    const relatedSection = screen.getByText('Interesses Relacionados').closest('.related-section-block');
    fireEvent.click(within(relatedSection).getByRole('button', { name: 'Expandir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ana' }));
    const detailsForm = screen.getByText('Detalhes do Aluno').closest('form');
    fireEvent.click(within(detailsForm).getByRole('button', { name: 'Fechar' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/alunos', { replace: true });
    });
  });

  test('remove link de WhatsApp, autopreenche endereço por CEP e envia datas no padrão ISO', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return {
          data: {
            turnos: ['Manhã'],
            turmas: [{ id: 'T-1', nome: 'Turma A' }],
            situacoes: ['Em Aberto', 'Concluído'],
            escolas_ensino_medio: ['EE Centro'],
            escolas_atuais: ['EE Atual'],
          },
        };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      if (url === '/alunos/cep-lookup') {
        return {
          data: {
            item: {
              cep: '17400000',
              rua_residencial: 'Rua das Flores',
              bairro_residencial: 'Centro',
              cidade: 'Marília',
              estado: 'SP',
              pais: 'Brasil',
            },
          },
        };
      }
      return { data: {} };
    });
    api.post.mockResolvedValue({ data: { id: 'ALN-2' } });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Adicionar aluno' });
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent('Alunos');

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar aluno' }));
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();

    fillRequiredAlunoFields();
    fireEvent.click(getPanelFieldControl('WhatsApp'));
    fireEvent.change(getPanelFieldControl('CEP'), { target: { value: '17400000' } });
    fireEvent.blur(getPanelFieldControl('CEP'));

    await waitFor(() => {
      expect(getPanelFieldControl('Cidade')).toHaveValue('Marília');
      expect(getPanelFieldControl('Estado')).toHaveValue('SP');
      expect(getPanelFieldControl('País')).toHaveValue('Brasil');
      expect(getPanelFieldControl('Rua Residencial')).toHaveValue('Rua das Flores');
      expect(getPanelFieldControl('Bairro Residencial')).toHaveValue('Centro');
    });

    fireEvent.change(getPanelFieldControl('Data de Ingresso'), { target: { value: '01022026' } });
    fireEvent.change(getPanelFieldControl('Data de Conclusão'), { target: { value: '15032026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/alunos', expect.objectContaining({
        NomeAluno: 'Ana',
        WhatsApp: true,
        RuaResidencial: 'Rua das Flores',
        BairroResidencial: 'Centro',
        CidadeResidencial: 'Marília',
        Estado: 'SP',
        Pais: 'Brasil',
        DataIngresso: '2026-02-01',
        DataConclusao: '2026-03-15',
      }));
    });
  });

  test('limpa o caminho da foto ao salvar a edição do aluno', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã', 'Tarde'], turmas: [{ id: 'T-1', nome: 'Turma A' }] } };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', Imagem: '/api/static/alunos/aln-1.jpg', IdTurma: 'T-1' }], total: 1, page: 1 } };
      }
      if (url === '/alunos/ALN-1/details') {
        return {
          data: {
            item: {
              id_aluno: 'ALN-1',
              nome: 'Ana',
              imagem: '/api/static/alunos/aln-1.jpg',
              email: 'ana@teste.com',
              id_turma: 'T-1',
              data_nascimento: '2000-01-01',
              cidade_naturalidade: 'Marília',
              fone_celular: '14998765432',
              escola_ensino_medio: 'EE Centro',
              escola_atual: 'EE Atual',
              turno: 'Manhã',
              situacao: 'Em Aberto',
            },
          },
        };
      }
      return { data: {} };
    });
    api.put.mockResolvedValue({ data: { item: { id_aluno: 'ALN-1', nome: 'Ana', imagem: null, id_turma: 'T-1' } } });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Editar aluno' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Remover foto' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Salvar' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/alunos/ALN-1', expect.objectContaining({ Imagem: null }));
    });
  });

  test('expande avaliações relacionadas e encaminha adicionar para o formulário lateral correto', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }] } };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', IdTurma: 'T-1' }], total: 1, page: 1 } };
      }
      if (url === '/alunos/ALN-1/details') {
        return {
          data: {
            item: {
              id_aluno: 'ALN-1',
              nome: 'Ana',
              id_turma: 'T-1',
              avaliacoes_relacionadas: [{ nome_aluno: 'Ana', nome_curso: 'Matemática', nota: 9, obs: 'Ótima', data_ingresso: '2026-02-01', data_conclusao: '2026-12-20' }],
              matriculas_relacionadas: [],
              chamadas_relacionadas: [],
              interesses: [],
              totais_relacionados: { total_aulas: 0, presencas: 0, faltas: 0 },
            },
          },
        };
      }
      return { data: {} };
    });

    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Editar aluno' }));

    const section = await screen.findByText('Avaliações Relacionadas');
    const sectionBlock = section.closest('.related-section-block');
    fireEvent.click(within(sectionBlock).getByRole('button', { name: 'Expandir' }));

    await waitFor(() => {
      expect(container.querySelector('.details-form-stack.related-focus-active')).not.toBeNull();
      expect(sectionBlock).toHaveClass('is-expanded');
      expect(screen.getByRole('button', { name: 'Ana' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Avaliações Relacionadas 1' })).toBeInTheDocument();
      expect(screen.getByText('01/02/2026')).toBeInTheDocument();
      expect(screen.getByText('20/12/2026')).toBeInTheDocument();
    });

    fireEvent.click(within(sectionBlock).getByRole('button', { name: 'Adicionar' }));
    expect(mockNavigate).toHaveBeenCalledWith('/avaliacoes?origin=alunos&aluno=ALN-1&alunoNome=Ana&create=1');
  });

  test('lista interesses relacionados sem repetir a coluna do aluno dentro do formulário', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }] } };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', IdTurma: 'T-1' }], total: 1, page: 1 } };
      }
      if (url === '/alunos/ALN-1/details') {
        return {
          data: {
            item: {
              id_aluno: 'ALN-1',
              nome: 'Ana',
              id_turma: 'T-1',
              interesses: [],
            },
          },
        };
      }
      if (url === '/alunos-interesses/') {
        return {
          data: {
            items: [
              { IdAlunoInteresse: 'AI-1', IdAluno: 'ALN-1', IdInteresse: 'INT-1', DescricaoInteresse: 'Robótica' },
              { IdAlunoInteresse: 'AI-2', IdAluno: 'ALN-1', IdInteresse: 'INT-2', DescricaoInteresse: 'Música' },
            ],
            total: 2,
            page: 1,
          },
        };
      }
      if (url === '/alunos-interesses/form-options') {
        return {
          data: {
            interesses: [],
          },
        };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Editar aluno' }));

    const section = await screen.findByText('Interesses Relacionados');
    const sectionBlock = section.closest('.related-section-block');
    fireEvent.click(within(sectionBlock).getByRole('button', { name: 'Expandir' }));

    await waitFor(() => {
      expect(within(sectionBlock).queryByRole('columnheader', { name: 'Aluno' })).not.toBeInTheDocument();
      expect(within(sectionBlock).getByRole('columnheader', { name: 'Interesse' })).toBeInTheDocument();
      expect(within(sectionBlock).getByRole('columnheader', { name: 'Ações' })).toBeInTheDocument();
      expect(within(sectionBlock).getByText('Robótica')).toBeInTheDocument();
      expect(within(sectionBlock).getByText('Música')).toBeInTheDocument();
    });
  });

  test('vincula interesses diretamente no formulário do aluno sem navegar para outra página', async () => {
    let interessesAluno = [
      { IdAlunoInteresse: 'AI-1', IdAluno: 'ALN-1', IdInteresse: 'INT-1', DescricaoInteresse: 'Robótica' },
    ];

    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }] } };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', IdTurma: 'T-1' }], total: 1, page: 1 } };
      }
      if (url === '/alunos/ALN-1/details') {
        return {
          data: {
            item: {
              id_aluno: 'ALN-1',
              nome: 'Ana',
              id_turma: 'T-1',
              interesses: interessesAluno.map((item) => item.DescricaoInteresse),
            },
          },
        };
      }
      if (url === '/alunos-interesses/') {
        return { data: { items: interessesAluno, total: interessesAluno.length, page: 1 } };
      }
      if (url === '/alunos-interesses/form-options') {
        return {
          data: {
            interesses: [
              { id: 'INT-1', nome: 'Robótica' },
              { id: 'INT-2', nome: 'Música' },
            ],
          },
        };
      }
      return { data: {} };
    });

    api.post.mockImplementation(async (url, payload) => {
      if (url === '/alunos-interesses/') {
        const descricao = payload.IdInteresse === 'INT-2' ? 'Música' : 'Robótica';
        interessesAluno = [
          ...interessesAluno,
          {
            IdAlunoInteresse: 'AI-2',
            IdAluno: 'ALN-1',
            IdInteresse: payload.IdInteresse,
            DescricaoInteresse: descricao,
          },
        ];
        return { data: {} };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Editar aluno' }));

    const section = await screen.findByText('Interesses Relacionados');
    const sectionBlock = section.closest('.related-section-block');
    fireEvent.click(within(sectionBlock).getByRole('button', { name: 'Expandir' }));

    await waitFor(() => {
      expect(within(sectionBlock).getByText('Robótica')).toBeInTheDocument();
      expect(within(sectionBlock).getByRole('button', { name: 'Vincular Interesse' })).toBeInTheDocument();
    });

    fireEvent.change(within(sectionBlock).getByLabelText('Selecionar interesse relacionado'), { target: { value: 'INT-2' } });
    fireEvent.click(within(sectionBlock).getByRole('button', { name: 'Vincular Interesse' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/alunos-interesses/', { IdAluno: 'ALN-1', IdInteresse: 'INT-2' });
      expect(within(sectionBlock).getByText('Música')).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('vincula trilhas diretamente no rodapé do formulário do aluno', async () => {
    let trilhasAluno = [
      { IdAlunoTrilha: 'ALT-1', IdAluno: 'ALN-1', IdTrilha: 'TR-1', NotaTrilha: 8.5 },
    ];

    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }] } };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', IdTurma: 'T-1' }], total: 1, page: 1 } };
      }
      if (url === '/alunos/ALN-1/details') {
        return {
          data: {
            item: {
              id_aluno: 'ALN-1',
              nome: 'Ana',
              id_turma: 'T-1',
              interesses: [],
            },
          },
        };
      }
      if (url === '/trilhas/') {
        return {
          data: {
            items: [
              { id_trilha: 'TR-1', nome_trilha: 'Base de Dados', qtd_cursos: 3 },
              { id_trilha: 'TR-2', nome_trilha: 'Inteligência Artificial', qtd_cursos: 5 },
            ],
            total: 2,
            page: 1,
          },
        };
      }
      if (url === '/alunos/ALN-1/trilhas') {
        return { data: { items: trilhasAluno, total: trilhasAluno.length } };
      }
      return { data: {} };
    });

    api.post.mockImplementation(async (url, payload) => {
      if (url === '/alunos/ALN-1/trilhas') {
        trilhasAluno = [
          ...trilhasAluno,
          {
            IdAlunoTrilha: 'ALT-2',
            IdAluno: 'ALN-1',
            IdTrilha: payload.IdTrilha,
            NotaTrilha: payload.NotaTrilha,
          },
        ];
        return { data: {} };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Editar aluno' }));

    const section = await screen.findByText('Trilhas Relacionadas');
    const sectionBlock = section.closest('.related-section-block');
    fireEvent.click(within(sectionBlock).getByRole('button', { name: 'Expandir' }));

    await waitFor(() => {
      expect(within(sectionBlock).getByText('Base de Dados')).toBeInTheDocument();
      expect(within(sectionBlock).getByRole('columnheader', { name: 'Qtd. Cursos' })).toBeInTheDocument();
    });

    fireEvent.change(within(sectionBlock).getByLabelText('Selecionar trilha'), { target: { value: 'TR-2' } });
    fireEvent.change(within(sectionBlock).getByLabelText('Nota da trilha'), { target: { value: '9.25' } });
    fireEvent.click(within(sectionBlock).getByRole('button', { name: 'Vincular Trilha' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/alunos/ALN-1/trilhas', { IdTrilha: 'TR-2', NotaTrilha: 9.25 });
      expect(within(sectionBlock).getByText('Inteligência Artificial')).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('combina opções do backend com os registros carregados para exibir filtro de cor', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [], situacoes: ['Em Aberto'] } };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', Cor: 'Parda' }], total: 1, page: 1 } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    const drawer = screen.getByTestId('alunos-filter-drawer');
    fireEvent.click(within(drawer).getByRole('button', { name: /Cor/i }));

    await waitFor(() => {
      expect(within(drawer).getByRole('checkbox', { name: /Parda/i })).toBeInTheDocument();
    });
  });

  test('exibe matrículas, chamadas e totais no detalhe do aluno e permite adicionar chamada no próprio formulário', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }] } };
      }
      if (url === '/chamadas/form-options') {
        return {
          data: {
            aulas: [{ id: 'AULA-1', nome: 'Aula 1' }],
            matriculas: [{ id: 'MAT-1', nome: 'Matricula 1', id_aluno: 'ALN-1' }],
            presencas: ['Presente', 'Ausente'],
          },
        };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [{ IdAluno: 'ALN-1', NomeAluno: 'Ana', IdTurma: 'T-1' }], total: 1, page: 1 } };
      }
      if (url === '/alunos/ALN-1/details') {
        return {
          data: {
            item: {
              id_aluno: 'ALN-1',
              nome: 'Ana',
              id_turma: 'T-1',
              matriculas_relacionadas: [{ data_matricula: '2026-02-01', data_conclusao: '2026-12-20', curso: 'Matemática', turma: 'Turma A', status: 'Ativa' }],
              chamadas_relacionadas: [{ nome_aluno: 'Ana', presenca: 'Presente', data: '2026-02-10' }],
              avaliacoes_relacionadas: [],
              interesses: [],
              totais_relacionados: { total_aulas: 12, presencas: 10, faltas: 2 },
            },
          },
        };
      }
      return { data: {} };
    });
    api.post.mockResolvedValue({ data: {} });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Editar aluno' }));

    const chamadasSection = await screen.findByText('Chamadas Relacionadas');
    const chamadasBlock = chamadasSection.closest('.related-section-block');
    fireEvent.click(within(chamadasBlock).getByRole('button', { name: 'Expandir' }));

    const matriculasSection = await screen.findByText('Matrículas Relacionadas');
    const matriculasBlock = matriculasSection.closest('.related-section-block');
    fireEvent.click(within(matriculasBlock).getByRole('button', { name: 'Expandir' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Totais do aluno')).toBeInTheDocument();
      expect(screen.getByText('Total de Aulas')).toBeInTheDocument();
      expect(screen.getByText((_content, element) => element?.classList?.contains('status-info') && element?.textContent?.includes('12'))).toBeInTheDocument();
      expect(screen.getByText((_content, element) => element?.classList?.contains('status-positive') && element?.textContent?.includes('10'))).toBeInTheDocument();
      expect(screen.getByText((_content, element) => element?.classList?.contains('status-negative') && element?.textContent?.includes('2'))).toBeInTheDocument();
      expect(within(chamadasBlock).getByText('Ana')).toBeInTheDocument();
      expect(within(chamadasBlock).getByText('10/02/2026')).toBeInTheDocument();
      expect(within(matriculasBlock).getByText('Matemática')).toBeInTheDocument();
      expect(within(matriculasBlock).getByText('Turma A')).toBeInTheDocument();
    });

    fireEvent.change(within(chamadasBlock).getByLabelText('Data da chamada relacionada'), { target: { value: '2026-02-11' } });
    fireEvent.change(within(chamadasBlock).getByLabelText('Presença da chamada relacionada'), { target: { value: 'Presente' } });
    fireEvent.change(within(chamadasBlock).getByLabelText('Aula da chamada relacionada'), { target: { value: 'AULA-1' } });
    fireEvent.change(within(chamadasBlock).getByLabelText('Matrícula da chamada relacionada'), { target: { value: 'MAT-1' } });
    fireEvent.click(within(chamadasBlock).getByRole('button', { name: 'Adicionar Chamada' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/chamadas/', {
        Data: '2026-02-11',
        IdAluno: 'ALN-1',
        Aula: 'AULA-1',
        Presenca: 'Presente',
        IdMatricula: 'MAT-1',
      });
    });
  });

  test('zera Empresa e Funcao no payload quando trabalha e estagio ficam como nao', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã'], turmas: [{ id: 'T-1', nome: 'Turma A' }], situacoes: ['Em Aberto'] } };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      return { data: {} };
    });
    api.post.mockResolvedValue({ data: { id: 'ALN-1' } });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Adicionar aluno' });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar aluno' }));

    fillRequiredAlunoFields({ nome: 'Ana', email: 'ana@teste.com' });

    fireEvent.change(getPanelFieldControl('Trabalha?'), { target: { value: 'Não' } });
    fireEvent.change(getPanelFieldControl('Faz estágio?'), { target: { value: 'Não' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/alunos', expect.objectContaining({ Empresa: null, Funcao: null }));
    });
  });

  test('novo aluno aceita arquivo local e envia upload após o salvamento', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/alunos/form-options') {
        return { data: { turnos: ['Manhã', 'Tarde', 'Noite'], turmas: [{ id: 'T-1', nome: 'Turma A' }] } };
      }
      if (url === '/alunos/filter-options') {
        return { data: { options: {} } };
      }
      if (url === '/alunos') {
        return { data: { items: [], total: 0, page: 1 } };
      }
      return { data: {} };
    });

    api.post.mockImplementation(async (url) => {
      if (url === '/alunos') {
        return { data: { id: 'ALN-NOVO-1' } };
      }
      if (url === '/alunos/ALN-NOVO-1/imagem') {
        return { data: { url: '/api/static/alunos/aln-novo-1.png' } };
      }
      return { data: {} };
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AlunosPage />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Adicionar aluno' });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar aluno' }));

    fillRequiredAlunoFields({ nome: 'Bruna Rocha', email: 'bruna@teste.com' });

    const fileInput = screen.getByLabelText('Nova foto');
    const photoFile = new File(['foto-local'], 'bruna.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [photoFile] } });

    expect(await screen.findByText('Arquivo selecionado: bruna.png')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/alunos', expect.objectContaining({ NomeAluno: 'Bruna Rocha', IdTurma: 'T-1', Imagem: null }));
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/alunos/ALN-NOVO-1/imagem', expect.any(FormData), expect.any(Object));
    });
  });
});
