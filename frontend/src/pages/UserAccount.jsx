import React, { useEffect, useState } from 'react';
import api from '../api/apiConfig';
import notify from '../utils/notify';
import { queueOfflineWrite, readOfflineResourceState, writeOfflineSnapshot } from '../utils/offlineManager';

export default function UserAccount() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    setLoading(true);
    try {
      const response = await api.get('/usuarios/me');
      const { pendingMutation } = readOfflineResourceState('/usuarios/me');
      setUser(pendingMutation ? { ...response.data, ...pendingMutation.data, senha: '' } : response.data);
    } catch (err) {
      const { pendingMutation, snapshot: cached } = readOfflineResourceState('/usuarios/me');
      if (pendingMutation || cached) {
        setUser({ ...(cached || {}), ...(pendingMutation?.data || {}), senha: '' });
      } else {
        console.error('Erro ao obter usuário', err);
        notify('Erro ao carregar usuário', { duration: 3500 });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!user) return;
    const payload = { login: user.login, senha: user.senha || undefined };
    try {
      await api.put('/usuarios/me', payload);
      const updatedUser = { ...user, senha: '' };
      setUser(updatedUser);
      writeOfflineSnapshot('/usuarios/me', updatedUser);
      notify('Usuário atualizado', { duration: 2500 });
    } catch (err) {
      if (err?.code === 'OFFLINE_WRITE_BLOCKED') {
        const queued = queueOfflineWrite({
          url: '/usuarios/me',
          method: 'put',
          data: payload,
          label: 'Usuário',
        });
        const queuedUser = { ...user, senha: '' };
        setUser(queuedUser);
        writeOfflineSnapshot('/usuarios/me', queuedUser);
        notify(`Alteração salva localmente às ${new Date(queued.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`, { duration: 3500 });
        return;
      }
      console.error(err);
      notify('Erro ao atualizar usuário', { duration: 3500 });
    }
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="app-shell">
      <h1 className="page-title">Usuário</h1>
      {user && (
        <form onSubmit={handleSaveUser} className="card">
          <div className="form-row">
            <div className="field">
              <label>E-mail</label>
              <input
                className="input"
                value={user.login || ''}
                onChange={e => setUser({ ...user, login: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Senha (deixe em branco para manter)</label>
              <input
                className="input"
                value={user.senha || ''}
                onChange={e => setUser({ ...user, senha: e.target.value })}
              />
            </div>
            <div className="toolbar">
              <button className="btn" type="submit">Salvar Usuário</button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
