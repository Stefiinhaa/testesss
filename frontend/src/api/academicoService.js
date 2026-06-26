import api from './apiConfig';

/**
 * SERVIÇO ACADÊMICO
 * Gerencia a estrutura de ensino, cursos e turmas.
 */
export const academicoService = {
  // Lista cursos disponíveis
  fetchCursos: () => api.get('/academico/cursos'),

  // Busca detalhes de turmas cruzados com dados dos professores
  fetchTurmasComProfessores: () => api.get('/academico/turmas/detalhes'),

  // Exemplo de busca de disciplinas por curso
  fetchDisciplinas: (cursoId) => api.get(`/academico/cursos/${cursoId}/disciplinas`)
};

// Exportações individuais para manter compatibilidade com seu código atual
export const fetchCursos = academicoService.fetchCursos;
export const fetchTurmasComProfessores = academicoService.fetchTurmasComProfessores;

// Compatibilidade com o Dashboard legado
export const getTurmasDetalhes = async () => {
  const resp = await api.get('/academico/turmas/detalhes');
  return resp.data;
};

export default academicoService;
