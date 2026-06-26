import axios from 'axios';
import { clearOfflineAuthState } from '../utils/offlineManager';
import { clearSessionHints } from '../utils/sessionStore';

/**
 * Instância Axios para endpoints do serviço de autenticação.
 * Usa o prefixo `/auth` roteado pelo Traefik.
 */
const authApi = axios.create({
  baseURL: '/auth',
  withCredentials: true,
});

// Interceptor: Tratamento global de erros
authApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      clearSessionHints();
      clearOfflineAuthState();
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    if (!error.response) {
      console.error('Erro de conexão: O servidor parece estar offline.');
    }
    return Promise.reject(error);
  }
);

export default authApi;
