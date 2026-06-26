import React, { useState } from 'react';
import axios from 'axios';

export default function ImportarDados() {
  const [file, setFile] = useState(null);
  const [tableName, setTableName] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setShowConfirm(true);
  };

  const handleImport = async () => {
    if (!file || !tableName) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('table', tableName);
    formData.append('overwrite', 'true');
    try {
      setStatus('Importando...');
      const res = await axios.post('/api/importar-csv', formData);
      setStatus(res.data.message || 'Importação concluída!');
    } catch (err) {
      setStatus('Erro ao importar: ' + (err.response?.data?.detail || err.response?.data?.message || err.message));
    }
    setShowConfirm(false);
  };

  return (
    <div className="page-shell">
      <h1 className="page-title">Importar Dados de Arquivo CSV</h1>
      <form className="import-form">
        <label>
          Tabela destino:
          <input type="text" value={tableName} onChange={e => setTableName(e.target.value)} required />
          <small className="help-text">
            <b>Como preencher:</b> Informe o nome da tabela do banco para onde os dados serão importados.<br />
            Exemplo: alunos, professores, turmas, etc.<br />
            Consulte o administrador ou o arquivo Tabelas.sql para nomes válidos.
          </small>
        </label>
        <label>
          Arquivo CSV:
          <input type="file" accept=".csv" onChange={handleFileChange} required />
          <small className="help-text">
            <b>Como preparar:</b> Exporte cada aba da planilha como arquivo CSV.<br />
            O cabeçalho do CSV deve corresponder aos nomes das colunas da tabela.<br />
            Use ponto e vírgula (;) ou vírgula (,) como separador.<br />
            Consulte o administrador para o formato correto.
          </small>
        </label>
      </form>
      {showConfirm && (
        <div className="modal">
          <div className="modal-content">
            <p>Deseja importar os dados sobrescrevendo os anteriores?</p>
            <button className="btn" onClick={handleImport}>Sim, importar</button>
            <button className="btn secondary" onClick={() => setShowConfirm(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {status && <div className="status-msg">{status}</div>}
    </div>
  );
}
