import React, { useEffect, useState } from 'react';
import { authApi } from '../api/authApi';
import notify from '../utils/notify';
import { redirectWindow } from '../utils/redirectWindow';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const feedback = document.getElementById('login-feedback');
    if (!feedback) return;
    feedback.textContent = '';
    feedback.className = 'form-feedback';
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await authApi.login(email, password);
      if (result) {
        redirectWindow('/dashboard');
      }
    } catch (err) {
      notify(err?.response?.data?.detail || 'Usuário ou senha inválidos.', { type: 'error' });
    }
    setLoading(false);
  };

  return (
    <div className="auth-body">
      <div className="login-container">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Iniciar sessão</h2>
        <div className="input-group">
          <label htmlFor="email">E-mail</label>
          <input type="email" id="email" name="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" />
        </div>
        <div className="input-group">
          <label htmlFor="password">Senha</label>
          <input type="password" id="password" name="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Autenticando...' : 'Entrar'}</button>
        <div id="login-feedback" className="form-feedback" aria-live="polite"></div>
        <div className="forgot-password">
          <a href="/forgot-password.html">Esqueci minha senha?</a>
        </div>
      </form>
    </div>
    </div>
  );
}
