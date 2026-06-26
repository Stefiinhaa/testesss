import axios from 'axios';
import authClient from './authApiConfig';
import api from './apiConfig';
import { clearOfflineAuthState } from '../utils/offlineManager';
import { clearSessionHints, normalizeSessionProfile, persistSessionHints } from '../utils/sessionStore';
import { redirectWindow } from '../utils/redirectWindow';

const ACCESS_TOKEN_KEY = '@FullEduca:access_token';

const persistAccessToken = (token) => {
    try {
        if (token) {
            window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
        }
    } catch (_error) {
        // ignore local storage errors
    }
};

const clearAccessToken = () => {
    try {
        window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch (_error) {
        // ignore local storage errors
    }
};

const normalizeSession = (session) => {
    if (!session) return session;
    return {
        ...session,
        perfil: normalizeSessionProfile(session.perfil),
    };
};

const shouldRetryWithoutPrefix = (path, error) => {
    const status = error?.response?.status;
    if (status === 404 || status === 405) {
        return true;
    }
    return path === '/login' && status === 400;
};

const getFallbackPaths = (path) => {
    if (path === '/login') {
        return [
            { client: 'auth', path: '/token' },
            { client: 'public', path: '/login' },
            { client: 'public', path: '/token' },
        ];
    }
    return [{ client: 'public', path }];
};

const postWithAuthFallback = async (path, payload, config) => {
    const requestConfig = { withCredentials: true, ...(config || {}) };
    try {
        return await authClient.post(path, payload, requestConfig);
    } catch (error) {
        if (!shouldRetryWithoutPrefix(path, error)) {
            throw error;
        }

        let lastError = error;
        for (const fallback of getFallbackPaths(path)) {
            try {
                if (fallback.client === 'auth') {
                    return await authClient.post(fallback.path, payload, requestConfig);
                }
                return await axios.post(fallback.path, payload, requestConfig);
            } catch (fallbackError) {
                lastError = fallbackError;
            }
        }

        throw lastError;
    }
};

/**
 * SERVIÇO DE AUTENTICAÇÃO
 * Reutiliza a instância 'api' para garantir que os interceptores
 * de Token e Erro 401 funcionem aqui também.
 */
export const authApi = {
    // Realiza o login enviando os dados como x-www-form-urlencoded (padrão OAuth2/FastAPI)
    async login(email, password) {
        const formData = new URLSearchParams();
        formData.set('username', email);
        formData.set('password', password);

        const response = await postWithAuthFallback('/login', formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        persistAccessToken(response?.data?.access_token);
        const session = await api.get('/usuarios/me');
        const normalizedSession = normalizeSession(session.data);
        persistSessionHints(normalizedSession);
        return { ...response.data, ...normalizedSession, perfil: normalizedSession?.perfil || normalizeSessionProfile(response.data?.perfil) };
    },

    // Rota para recuperação de senha
    async forgotPassword(email) {
        return await postWithAuthFallback('/esqueci-senha', { email });
    },

    async getSession() {
        const response = await api.get('/usuarios/me');
        const normalizedSession = normalizeSession(response.data);
        persistSessionHints(normalizedSession);
        return normalizedSession;
    },

    // Realiza o cadastro de novos usuários
    async cadastrar(login, senha, perfil = 'aluno') {
        return await authClient.post('/usuarios/cadastrar', { login, senha, perfil });
    },

    // Limpa a sessão e redireciona
    async logout() {
        try {
            await postWithAuthFallback('/logout', {});
        } catch (error) {
            // local cleanup still happens below
        }
        clearSessionHints();
        clearOfflineAuthState();
        clearAccessToken();
        redirectWindow('/login');
    }
};

// Mantendo exportações individuais caso seu código atual as utilize (estilo factory)
export const loginRequest = (email, senha) => authApi.login(email, senha);
export const forgotPasswordRequest = (email) => authApi.forgotPassword(email);

export default authApi;
