import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminMenu() {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <h1 className="page-title">Menu do Administrador</h1>
      <p className="muted">Escolha uma opção:</p>
      <div className="card">
        <div className="toolbar">
          <button className="btn" onClick={() => navigate('/dashboard')}>
            Dashboard (inicial)
          </button>
          <button className="btn secondary" onClick={() => navigate('/users')}>
            Listagem de usuários
          </button>
          <button className="btn ghost" onClick={() => navigate('/alunos')}>
            Alunos
          </button>
        </div>
      </div>
    </div>
  );
}
