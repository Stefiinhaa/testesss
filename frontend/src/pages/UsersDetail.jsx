import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/apiConfig';
import DeleteBehaviorField from '../components/DeleteBehaviorField';
import notify from '../utils/notify';
import { queueOfflineWrite, writeOfflineSnapshot } from '../utils/offlineManager';
import { getSessionUserId } from '../utils/sessionStore';

export default function UsersDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [initialUser, setInitialUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchUser = async () => {
    setLoading(true);
    try {
      const resp = await api.get(`/usuarios/${id}`);
      const normalizedUser = { ...resp.data, senha: '' };
      setUser(normalizedUser);
      setInitialUser(normalizedUser);
    } catch (err) {
      console.error('Erro ao buscar usuário', err);
      notify('Erro ao carregar usuário', { duration: 3500 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUser(); }, [id]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    try {
      const payload = { login: user.login, perfil: user.perfil, ativo: user.ativo };
      if (user.senha) payload.senha = user.senha;
      if (user.perfil === 'aluno') payload.id_aluno = user.id_aluno || null;
      await api.put(`/usuarios/${id}`, payload);
      notify('Usuário atualizado', { duration: 2500 });
      navigate('/users');
    } catch (err) {
      const isCurrentUser = String(getSessionUserId() || '') === String(id || '');
      const changedRestrictedFields = !!initialUser && (
        user.perfil !== initialUser.perfil
        || !!user.ativo !== !!initialUser.ativo
        || String(user.id_aluno || '') !== String(initialUser.id_aluno || '')
      );
      if (err?.code === 'OFFLINE_WRITE_BLOCKED' && isCurrentUser && !changedRestrictedFields) {
        const queued = queueOfflineWrite({
          url: '/usuarios/me',
          method: 'put',
          data: {
            login: user.login,
            ...(user.senha ? { senha: user.senha } : {}),
          },
          label: 'Meu usuário',
        });
        writeOfflineSnapshot('/usuarios/me', { ...user, senha: '' });
        notify(`Alteração salva localmente às ${new Date(queued.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`, { duration: 3500 });
        navigate('/users');
        return;
      }
      console.error('Erro atualizar usuário', err);
      notify(err?.response?.data?.detail || 'Erro ao atualizar usuário', { duration: 3500 });
    }
  };

  const handleDelete = async (capability = null) => {
    const confirmationMessage = capability?.confirmation_message || 'Remover usuário?';
    if (!window.confirm(confirmationMessage)) return;
    try {
      const response = await api.delete(`/usuarios/${id}`);
      notify(response?.data?.message || 'Usuário removido', { duration: 2500 });
      navigate('/users');
    } catch (err) {
      console.error('Erro remover usuário', err);
      notify(err?.response?.data?.detail || 'Erro ao remover usuário', { duration: 3500 });
    }
  };

  if (loading) return <div>Carregando...</div>;
  if (!user) return <div>Usuário não encontrado</div>;

  return (
    <div className="app-shell app-shell-tight">
      <h1 className="page-title">Editar Usuário</h1>
      <form onSubmit={handleSave} className="card">
        <div className="form-row">
          <div className="field">
            <label>E-mail</label>
            <input className="input" value={user.login || ''} onChange={e => setUser({...user, login: e.target.value})} required />
          </div>
          <div className="field">
            <label>Senha (deixe em branco para manter)</label>
            <input className="input" value={user.senha || ''} onChange={e => setUser({...user, senha: e.target.value})} />
          </div>
          <div className="field">
            <label>Perfil</label>
            <select className="select" value={user.perfil || 'aluno'} onChange={e => setUser({...user, perfil: e.target.value})}>
              <option value="aluno">aluno</option>
              <option value="admin">admin</option>
            </select>
          </div>
          {user.perfil === 'aluno' && (
            <div className="field">
              <label>IdAluno</label>
              <input
                className="input"
                placeholder="IdAluno"
                value={user.id_aluno || ''}
                onChange={e => setUser({ ...user, id_aluno: e.target.value })}
              />
            </div>
          )}
          <DeleteBehaviorField
            resourcePath="/usuarios"
            entityId={user.id}
            active={!!user.ativo}
            onActiveChange={value => setUser({ ...user, ativo: value })}
            onDelete={handleDelete}
          />
        </div>
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button className="btn" type="submit">Salvar</button>
          <DeleteBehaviorField placement="toolbar" resourcePath="/usuarios" entityId={user.id} active={!!user.ativo} onActiveChange={value => setUser({ ...user, ativo: value })} onDelete={handleDelete} />
          <button className="btn ghost" type="button" onClick={() => navigate('/users')}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
