import React, { useEffect, useState } from 'react';
import api from '../api/apiConfig';
import notify from '../utils/notify';
import { queueOfflineWrite, readOfflineResourceState, writeOfflineSnapshot } from '../utils/offlineManager';
import { buildLocalPhone, digitsOnly, parsePhoneParts } from '../utils/formatters';
import { DIAL_CODE_OPTIONS } from '../utils/dialCodes';

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export default function Profile() {
  const [aluno, setAluno] = useState(null);
  const [loading, setLoading] = useState(true);

  const normalizeProfileAluno = (rawAluno) => {
    const baseAluno = rawAluno || {};
    const phoneParts = parsePhoneParts(baseAluno.FoneCelular, baseAluno.FoneCelularDDI || '55');
    return {
      ...baseAluno,
      FoneCelularDDI: baseAluno.FoneCelularDDI || phoneParts.ddi,
      FoneCelularDDD: baseAluno.FoneCelularDDD || phoneParts.ddd,
      FoneCelularNumero: baseAluno.FoneCelularNumero || phoneParts.number,
    };
  };

  const fetchAluno = async () => {
    setLoading(true);
    try {
      const a = await api.get('/alunos/me');
      const { pendingMutation } = readOfflineResourceState('/alunos/me');
      setAluno(normalizeProfileAluno(pendingMutation ? { ...a.data, ...pendingMutation.data } : a.data));
    } catch (err) {
      const { pendingMutation, snapshot: cached } = readOfflineResourceState('/alunos/me');
      setAluno(normalizeProfileAluno(pendingMutation ? { ...(cached || {}), ...pendingMutation.data } : (cached || null)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAluno(); }, []);

  const handleSaveAluno = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...aluno,
        FoneCelularDDI: digitsOnly(aluno?.FoneCelularDDI).slice(0, 4),
        FoneCelularDDD: digitsOnly(aluno?.FoneCelularDDD).slice(0, 4),
        FoneCelularNumero: digitsOnly(aluno?.FoneCelularNumero).slice(0, 12),
      };
      payload.FoneCelular = buildLocalPhone({ ddd: payload.FoneCelularDDD, number: payload.FoneCelularNumero }) || null;
      const nullableIntFields = ['AnoIngresso', 'SemestreIngresso'];
      nullableIntFields.forEach((field) => {
        if (payload[field] === '') payload[field] = null;
      });
      await api.put('/alunos/me', payload);
      writeOfflineSnapshot('/alunos/me', payload);
      notify('Dados do aluno atualizados', { duration: 2500 });
    } catch (err) {
      if (err?.code === 'OFFLINE_WRITE_BLOCKED') {
        const queued = queueOfflineWrite({
          url: '/alunos/me',
          method: 'put',
          data: { ...aluno },
          label: 'Perfil do aluno',
        });
        writeOfflineSnapshot('/alunos/me', { ...aluno });
        notify(`Perfil salvo localmente às ${new Date(queued.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`, { duration: 3500 });
        return;
      }
      console.error(err);
      notify('Erro ao atualizar dados do aluno', { duration: 3500 });
    }
  };

  const renderField = (key, label, type = 'text') => (
    <div className="field" key={key}>
      <label>{label}</label>
      <input
        className="input"
        type={type}
        value={aluno?.[key] ?? ''}
        onChange={(e) => setAluno({ ...aluno, [key]: e.target.value })}
      />
    </div>
  );

  const renderUfField = (key, label) => (
    <div className="field" key={key}>
      <label>{label}</label>
      <select
        className="select"
        value={aluno?.[key] ?? ''}
        onChange={(e) => setAluno({ ...aluno, [key]: e.target.value })}
      >
        <option value="">Selecione</option>
        {UF_OPTIONS.map((uf) => (
          <option key={uf} value={uf}>{uf}</option>
        ))}
      </select>
    </div>
  );

  const updatePhoneField = (key, value) => {
    setAluno((previous) => {
      const next = { ...(previous || {}), [key]: digitsOnly(value) };
      next.FoneCelular = buildLocalPhone({ ddd: next.FoneCelularDDD, number: next.FoneCelularNumero });
      return next;
    });
  };

  if (loading) return <div>Carregando...</div>;
  return (
    <div className="app-shell">
      <h1 className="page-title">Meu Perfil</h1>
      {aluno ? (
        <form onSubmit={handleSaveAluno} className="card">
          <h2>Dados completos do Aluno</h2>
          <div className="form-row">
            {renderField('NomeAluno', 'Nome')}
            {renderField('Email', 'E-mail')}
            {renderField('RA', 'RA')}
            {renderField('CPF', 'CPF')}
            {renderField('RG', 'RG')}
            {renderField('DataNascimento', 'Data de Nascimento', 'date')}
            {renderField('Sexo', 'Sexo')}
            {renderField('Cor', 'Cor')}
            {renderField('Nacionalidade', 'Nacionalidade')}
            {renderField('Naturalidade', 'Naturalidade')}
            {renderField('CidadeNaturalidade', 'Cidade Naturalidade')}
            {renderUfField('EstadoNaturalidade', 'Estado Naturalidade')}
            <div className="field">
              <label>Fone Celular</label>
              <div className="form-row">
                <div className="field">
                  <label>DDI</label>
                  <select className="select" value={aluno?.FoneCelularDDI ?? '55'} onChange={(e) => updatePhoneField('FoneCelularDDI', e.target.value)}>
                    {DIAL_CODE_OPTIONS.map((option) => <option key={`${option.code}-${option.dialCode}`} value={option.dialCode}>{option.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>DDD</label>
                  <input className="input" value={aluno?.FoneCelularDDD ?? ''} onChange={(e) => updatePhoneField('FoneCelularDDD', e.target.value)} />
                </div>
                <div className="field">
                  <label>Número do celular</label>
                  <input className="input" value={aluno?.FoneCelularNumero ?? ''} onChange={(e) => updatePhoneField('FoneCelularNumero', e.target.value)} />
                </div>
              </div>
            </div>
            {renderField('FoneResidencial', 'Fone Residencial')}
            {renderField('FoneComercial', 'Fone Comercial')}
            {renderField('FoneRecado', 'Fone Recado')}
            {renderField('Endereco', 'Endereço')}
            {renderField('RuaResidencial', 'Rua')}
            {renderField('NumResidencial', 'Número')}
            {renderField('ComplementoResidencial', 'Complemento')}
            {renderField('BairroResidencial', 'Bairro')}
            {renderField('CidadeResidencial', 'Cidade')}
            {renderUfField('Estado', 'Estado')}
            {renderField('Pais', 'País')}
            {renderField('CepResidencial', 'CEP')}
            {renderField('Pai', 'Pai')}
            {renderField('Mae', 'Mãe')}
            {renderField('EscolaEnsinoMedio', 'Escola Ensino Médio')}
            {renderField('EscolaAtual', 'Escola Atual')}
            {renderField('Turno', 'Turno')}
            {renderField('Setor', 'Setor')}
            {renderField('DataIngresso', 'Data de Ingresso', 'date')}
            {renderField('AnoIngresso', 'Ano de Ingresso', 'number')}
            {renderField('SemestreIngresso', 'Semestre de Ingresso', 'number')}
            {renderField('DataConclusao', 'Data de Conclusão', 'date')}
            {renderField('Trabalho', 'Trabalho')}
            {renderField('Estagio', 'Estágio')}
            {renderField('Empresa', 'Empresa')}
            {renderField('Contente', 'Contente')}
            {renderField('Motivo', 'Motivo')}
            {renderField('Situacao', 'Situação')}
            <div className="toolbar">
              <button className="btn" type="submit">Salvar Meu Perfil</button>
            </div>
          </div>
        </form>
      ) : (
        <div className="card">Sem registro de aluno associado ao seu usuário.</div>
      )}
    </div>
  );
}
