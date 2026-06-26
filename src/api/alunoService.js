import api from './apiConfig';

/**
 * SERVIÇO DE ALUNOS
 * Gerencia o cadastro e métricas relacionadas aos estudantes.
 */
export const alunoService = {
  // Busca estatísticas de interesses (gráficos do dashboard)
  fetchEstatisticasInteresses: () => api.get('/alunos/estatisticas/interesses'),

  // Cadastra um novo registro de aluno
  cadastrarNovoAluno: (dados) => api.post('/alunos/', dados),

  // Exemplo de busca de perfil individual (útil para o 'meu perfil')
  getPerfil: (id) => api.get(`/alunos/${id}`)
};

// Exportações individuais para manter compatibilidade com seu código atual
export const fetchEstatisticasInteresses = alunoService.fetchEstatisticasInteresses;
export const cadastrarNovoAluno = alunoService.cadastrarNovoAluno;

export default alunoService;
