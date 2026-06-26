import axios from 'axios';
import authApi from './authApi';
import authClient from './authApiConfig';
import api from './apiConfig';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock('./authApiConfig', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock('./apiConfig', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('authApi', () => {
  const adminUser = 'admin@example.invalid';
  const adminPassword = 'example-admin-password'; // pragma: allowlist secret
  const sessionCacheKey = '@FullEduca:offline:get:/api/usuarios/me';
  const pendingMutationsKey = '@FullEduca:offline:mutations';

  beforeEach(() => {
    authClient.post.mockReset();
    axios.post.mockReset();
    api.get.mockReset();
    window.history.replaceState({}, '', '/login');
    Object.defineProperty(window, 'localStorage', {
      value: {
        setItem: jest.fn(),
        getItem: jest.fn(),
        removeItem: jest.fn(),
      },
      writable: true,
    });
  });

  test('faz fallback para /login sem prefixo quando /auth/login não existe no ambiente publicado', async () => {
    authClient.post.mockRejectedValue({ response: { status: 404, data: { detail: 'Not Found' } } });
    axios.post.mockResolvedValue({
      data: {
        access_token: 'token-publico',
        perfil: 'admin',
      },
    });
    api.get.mockResolvedValue({ data: { user: adminUser, perfil: 'admin' } });

    const result = await authApi.login(adminUser, adminPassword);

    expect(authClient.post).toHaveBeenCalledWith('/login', expect.any(URLSearchParams), {
      withCredentials: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(axios.post).toHaveBeenCalledWith('/login', expect.any(URLSearchParams), {
      withCredentials: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(api.get).toHaveBeenCalledWith('/usuarios/me');
    expect(window.localStorage.setItem).toHaveBeenCalledWith('@FullEduca:perfil', 'admin');
    expect(window.localStorage.setItem).toHaveBeenCalledWith('@FullEduca:user', adminUser);
    expect(result.access_token).toBe('token-publico');
  });

  test('faz fallback para /login sem prefixo quando /auth/login responde 400 no ambiente publicado', async () => {
    authClient.post.mockRejectedValue({ response: { status: 400, data: { detail: 'Bad Request' } } });
    axios.post.mockResolvedValue({
      data: {
        access_token: 'token-publico',
        perfil: 'admin',
      },
    });
    api.get.mockResolvedValue({ data: { user: adminUser, perfil: 'admin' } });

    const result = await authApi.login(adminUser, adminPassword);

    expect(authClient.post).toHaveBeenCalledWith('/login', expect.any(URLSearchParams), {
      withCredentials: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(axios.post).toHaveBeenCalledWith('/login', expect.any(URLSearchParams), {
      withCredentials: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(result.access_token).toBe('token-publico');
  });

  test('faz fallback para /auth/token quando /auth/login falha em ambiente publicado', async () => {
    authClient.post
      .mockRejectedValueOnce({ response: { status: 400, data: { detail: 'Bad Request' } } })
      .mockResolvedValueOnce({
        data: {
          access_token: 'token-auth-token',
          perfil: 'admin',
        },
      });
    api.get.mockResolvedValue({ data: { user: adminUser, perfil: 'admin' } });

    const result = await authApi.login(adminUser, adminPassword);

    expect(authClient.post).toHaveBeenNthCalledWith(1, '/login', expect.any(URLSearchParams), {
      withCredentials: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(authClient.post).toHaveBeenNthCalledWith(2, '/token', expect.any(URLSearchParams), {
      withCredentials: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(axios.post).not.toHaveBeenCalled();
    expect(result.access_token).toBe('token-auth-token');
  });

  test('faz fallback para /token sem prefixo quando /auth/login e /auth/token falham', async () => {
    authClient.post
      .mockRejectedValueOnce({ response: { status: 400, data: { detail: 'Bad Request' } } })
      .mockRejectedValueOnce({ response: { status: 405, data: { detail: 'Method Not Allowed' } } });
    axios.post
      .mockRejectedValueOnce({ response: { status: 405, data: { detail: 'Method Not Allowed' } } })
      .mockResolvedValueOnce({
        data: {
          access_token: 'token-public-token',
          perfil: 'admin',
        },
      });
    api.get.mockResolvedValue({ data: { user: adminUser, perfil: 'admin' } });

    const result = await authApi.login(adminUser, adminPassword);

    expect(authClient.post).toHaveBeenNthCalledWith(1, '/login', expect.any(URLSearchParams), {
      withCredentials: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(authClient.post).toHaveBeenNthCalledWith(2, '/token', expect.any(URLSearchParams), {
      withCredentials: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(axios.post).toHaveBeenNthCalledWith(1, '/login', expect.any(URLSearchParams), {
      withCredentials: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(axios.post).toHaveBeenNthCalledWith(2, '/token', expect.any(URLSearchParams), {
      withCredentials: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(result.access_token).toBe('token-public-token');
  });

  test('normaliza o perfil administrativo ao carregar a sessão atual', async () => {
    api.get.mockResolvedValue({
      data: {
        id: '7',
        user: 'admin@exemplo.local',
        perfil: ' Administrador ',
      },
    });

    const session = await authApi.getSession();

    expect(session).toEqual({
      id: '7',
      user: 'admin@exemplo.local',
      perfil: 'admin',
    });
    expect(window.localStorage.setItem).toHaveBeenCalledWith('@FullEduca:perfil', 'admin');
  });

  test('limpa a sessão local e redireciona mesmo quando o logout remoto falha', async () => {
    authClient.post.mockRejectedValueOnce(new Error('network error'));
    axios.post.mockRejectedValueOnce(new Error('network error'));

    await authApi.logout();

    expect(window.localStorage.removeItem).toHaveBeenCalledWith('@FullEduca:id');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('@FullEduca:perfil');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('@FullEduca:user');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('@FullEduca:login');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith(sessionCacheKey);
    expect(window.location.pathname).toBe('/login');
  });

  test('descarta fila offline pendente ao encerrar a sessão', async () => {
    authClient.post.mockResolvedValueOnce({ data: { ok: true } });

    await authApi.logout();

    expect(window.localStorage.setItem).toHaveBeenCalledWith(pendingMutationsKey, '[]');
  });
});
