import React from 'react';

/**
 * Dashboard page used by authenticated users.
 *
 * Notes:
 * - This component demonstrates a simple data fetch on mount. In a
 *   production SPA consider adding loading states and error boundaries.
 */
const Dashboard = () => {
  return (
    <div className="app-shell">
      <h1 className="page-title">Painel FullEduca</h1>
      <div className="dashboard-grid">
        <div className="card chart-card">
          <div className="chart-title">Gráfico 1</div>
          <div className="chart-placeholder">Adicionar gráfico</div>
        </div>
        <div className="card chart-card">
          <div className="chart-title">Gráfico 2</div>
          <div className="chart-placeholder">Adicionar gráfico</div>
        </div>
        <div className="card chart-card">
          <div className="chart-title">Gráfico 3</div>
          <div className="chart-placeholder">Adicionar gráfico</div>
        </div>
        <div className="card chart-card">
          <div className="chart-title">Gráfico 4</div>
          <div className="chart-placeholder">Adicionar gráfico</div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
