import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../pages/Login';

jest.mock('../utils/notify', () => jest.fn());

jest.mock('../api/authApi', () => ({
  authApi: {
    login: jest.fn(),
  },
}));

const { authApi } = jest.requireMock('../api/authApi');
const notify = jest.requireMock('../utils/notify');

describe('LoginPage', () => {
  beforeEach(() => {
    authApi.login.mockReset();
    notify.mockReset();
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

  test('mostra feedback formatado em erro de login', async () => {
    authApi.login.mockRejectedValue({ response: { data: { detail: 'Usuário ou senha inválidos.' } } });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'teste@teste.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith('Usuário ou senha inválidos.', { type: 'error' });
    });

    expect(document.getElementById('login-feedback')).toBeEmptyDOMElement();
  });

  test('redireciona para o dashboard quando o login conclui com sucesso', async () => {
    authApi.login.mockResolvedValue({ id: '1', perfil: 'admin', user: 'admin@teste.local' });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'admin@teste.local' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('admin@teste.local', '123456');
    });

    expect(window.location.pathname).toBe('/dashboard');
  });
});
