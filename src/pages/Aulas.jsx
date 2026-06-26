import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import api from '../api/apiConfig';
import notify from '../utils/notify';

const TURMA_COLORS = [
  '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#1e88e5',
  '#00897b', '#d81b60', '#6d4c41', '#546e7a', '#fdd835',
];

function getTurmaColor(turmaId, turmaMap) {
  const keys = Object.keys(turmaMap);
  const idx = keys.indexOf(turmaId);
  return TURMA_COLORS[idx >= 0 ? idx % TURMA_COLORS.length : 0];
}

export default function AulasPage() {
  const [events, setEvents] = useState([]);
  const [turmaMap, setTurmaMap] = useState({});
  const [selectedAula, setSelectedAula] = useState(null);
  const [panelMode, setPanelMode] = useState(null); // 'view' | 'edit' | 'create'
  const [formData, setFormData] = useState({});
  const [turmaOptions, setTurmaOptions] = useState([]);
  const [chamadas, setChamadas] = useState([]);
  const [showChamadaForm, setShowChamadaForm] = useState(false);
  const [newChamada, setNewChamada] = useState({ Data: '', IdAluno: '', Presenca: 'Presente', IdMatricula: '' });
  const [chamadaFormOptions, setChamadaFormOptions] = useState({ alunos: [], matriculas: [] });
  const [chamadaExpanded, setChamadaExpanded] = useState(false);
  const [showChamadaSelection, setShowChamadaSelection] = useState(false);
  const [selectedChamadaIds, setSelectedChamadaIds] = useState([]);
  const calendarRef = React.useRef(null);

  const fetchAulas = useCallback(async (start, end) => {
    try {
      const params = {};
      if (start) params.start = start;
      if (end) params.end = end;
      const response = await api.get('/aulas/', { params });
      const items = response.data?.items || [];
      const tMap = {};
      const calendarEvents = items.map((item) => {
        if (item.IdTurma && item.NomeTurma) tMap[item.IdTurma] = item.NomeTurma;
        return {
          id: item.IdAula,
          title: `${item.NomeAula || 'Aula'}${item.NomeTurma ? ` - ${item.NomeTurma}` : ''}`,
          start: item.HoraInicio,
          end: item.HoraFim,
          extendedProps: item,
          backgroundColor: getTurmaColor(item.IdTurma, tMap),
          borderColor: getTurmaColor(item.IdTurma, tMap),
        };
      });
      setTurmaMap(tMap);
      setEvents(calendarEvents);
    } catch (error) {
      console.error(error);
      notify('Erro ao carregar aulas', { duration: 3000 });
    }
  }, []);

  const fetchTurmaOptions = useCallback(async () => {
    try {
      const r = await api.get('/turmas/', { params: { page: 1, per_page: 500 } });
      setTurmaOptions((r.data?.items || []).map((t) => ({ id: t.id_turma, nome: t.nome })));
    } catch (_) { setTurmaOptions([]); }
  }, []);

  useEffect(() => { fetchAulas(); fetchTurmaOptions(); }, [fetchAulas, fetchTurmaOptions]);

  const handleDatesSet = useCallback((info) => {
    fetchAulas(info.startStr, info.endStr);
  }, [fetchAulas]);

  const handleEventClick = useCallback(async (info) => {
    const id = info.event.id;
    try {
      const r = await api.get(`/aulas/${id}`);
      setSelectedAula(r.data?.item || info.event.extendedProps);
      setChamadas(r.data?.item?.chamadas || []);
      setPanelMode('view');
      setShowChamadaForm(false);
    } catch (_) {
      setSelectedAula(info.event.extendedProps);
      setPanelMode('view');
    }
  }, []);

  const handleDateClick = useCallback((info) => {
    setFormData({ NomeAula: '', HoraInicio: `${info.dateStr}T08:00`, HoraFim: `${info.dateStr}T09:00`, IdTurma: '' });
    setPanelMode('create');
    setSelectedAula(null);
  }, []);

  const closePanel = () => { setPanelMode(null); setSelectedAula(null); setShowChamadaForm(false); };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (panelMode === 'create') {
        await api.post('/aulas/', formData);
        notify('Aula criada', { duration: 2500 });
      } else {
        await api.put(`/aulas/${selectedAula.IdAula}`, formData);
        notify('Aula atualizada', { duration: 2500 });
      }
      closePanel();
      const calApi = calendarRef.current?.getApi();
      if (calApi) fetchAulas(calApi.view.activeStart.toISOString(), calApi.view.activeEnd.toISOString());
      else fetchAulas();
    } catch (err) {
      notify(err?.response?.data?.detail || 'Erro ao salvar aula', { duration: 3500 });
    }
  };

  const handleDelete = async () => {
    if (!selectedAula?.IdAula || !window.confirm('Remover esta aula?')) return;
    try {
      await api.delete(`/aulas/${selectedAula.IdAula}`);
      notify('Aula removida', { duration: 2500 });
      closePanel();
      fetchAulas();
    } catch (err) {
      notify(err?.response?.data?.detail || 'Erro ao remover aula', { duration: 3500 });
    }
  };

  const handleDeleteSelectedChamadas = async () => {
    if (!selectedChamadaIds.length || !window.confirm(`Remover ${selectedChamadaIds.length} chamada(s)?`)) return;
    try {
      await Promise.all(selectedChamadaIds.map((id) => api.delete(`/chamadas/${id}`)));
      notify(`${selectedChamadaIds.length} chamada(s) removida(s)`, { duration: 2500 });
      setSelectedChamadaIds([]);
      const r = await api.get(`/aulas/${selectedAula.IdAula}`);
      setChamadas(r.data?.item?.chamadas || []);
    } catch (err) {
      notify(err?.response?.data?.detail || 'Erro ao remover chamadas', { duration: 3500 });
    }
  };

  const openChamadaForm = async () => {
    setShowChamadaForm(true);
    try {
      const r = await api.get('/chamadas/form-options');
      setChamadaFormOptions({
        alunos: r.data?.alunos || [],
        matriculas: r.data?.matriculas || [],
      });
    } catch (_) { setChamadaFormOptions({ alunos: [], matriculas: [] }); }
  };

  const filteredMatriculas = useMemo(() => {
    if (!newChamada.IdAluno) return chamadaFormOptions.matriculas;
    return chamadaFormOptions.matriculas.filter((m) => m.id_aluno === newChamada.IdAluno);
  }, [newChamada.IdAluno, chamadaFormOptions.matriculas]);

  const handleSaveChamada = async (e) => {
    e.preventDefault();
    try {
      await api.post('/chamadas/', { ...newChamada, Aula: selectedAula?.IdAula });
      notify('Chamada registrada', { duration: 2500 });
      setNewChamada({ Data: '', IdAluno: '', Presenca: 'Presente', IdMatricula: '' });
      setShowChamadaForm(false);
      // Refresh chamadas
      const r = await api.get(`/aulas/${selectedAula.IdAula}`);
      setChamadas(r.data?.item?.chamadas || []);
    } catch (err) {
      notify(err?.response?.data?.detail || 'Erro ao registrar chamada', { duration: 3500 });
    }
  };

  const startEdit = () => {
    setFormData({
      NomeAula: selectedAula?.NomeAula || '',
      HoraInicio: selectedAula?.HoraInicio || '',
      HoraFim: selectedAula?.HoraFim || '',
      IdTurma: selectedAula?.IdTurma || '',
      StatusChamada: selectedAula?.StatusChamada || '',
    });
    setPanelMode('edit');
  };

  const duracao = selectedAula?.DuracaoMinutos != null
    ? `${Math.floor(selectedAula.DuracaoMinutos / 60)}h${String(selectedAula.DuracaoMinutos % 60).padStart(2, '0')}min`
    : null;

  return (
    <div className="app-shell app-shell-tight entity-page">
      {/* Vista expandida de chamadas — ocupa tela inteira */}
      {chamadaExpanded && selectedAula ? (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <section className="entity-header" style={{ padding: '12px 16px' }}>
            <div className="entity-header-copy">
              <nav style={{ fontSize: '0.85rem', color: '#888' }}>
                <button type="button" className="btn ghost" style={{ fontSize: '0.85rem', padding: 0 }} onClick={() => { setChamadaExpanded(false); setSelectedChamadaIds([]); setShowChamadaSelection(false); }}>Aulas</button>
                <span> › </span>
                <button type="button" className="btn ghost" style={{ fontSize: '0.85rem', padding: 0 }} onClick={() => { setChamadaExpanded(false); setSelectedChamadaIds([]); setShowChamadaSelection(false); }}>{selectedAula.NomeAula}</button>
                <span> › </span>
                <strong style={{ color: '#333' }}>Chamadas</strong>
              </nav>
              {selectedChamadaIds.length > 0 && <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>{selectedChamadaIds.length} selecionado(s)</p>}
            </div>
            <div className="entity-actions">
              {selectedChamadaIds.length > 0 && (
                <button type="button" className="btn" style={{ background: '#e91e63', color: '#fff' }} onClick={handleDeleteSelectedChamadas}>Remover</button>
              )}
              <button type="button" className="btn" style={{ background: '#e91e63', color: '#fff' }} onClick={openChamadaForm}>+ Adicionar</button>
              <button type="button" className="icon-action-btn" aria-label="Alternar seleção" onClick={() => { setShowChamadaSelection(!showChamadaSelection); setSelectedChamadaIds([]); }}>
                {showChamadaSelection ? '☑' : '☐'}
              </button>
            </div>
          </section>

          <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
            {showChamadaForm && (
              <form onSubmit={handleSaveChamada} style={{ marginBottom: 16, padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, background: '#fafafa' }}>
                <strong>Nova Chamada</strong>
                <div className="form-row" style={{ marginTop: 8 }}>
                  <div className="field"><label>Data</label><input className="input" type="date" required value={newChamada.Data} onChange={(e) => setNewChamada({ ...newChamada, Data: e.target.value })} /></div>
                  <div className="field"><label>Aluno</label><select className="select" required value={newChamada.IdAluno} onChange={(e) => setNewChamada({ ...newChamada, IdAluno: e.target.value, IdMatricula: '' })}><option value="">Selecione</option>{chamadaFormOptions.alunos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></div>
                  <div className="field"><label>Presença</label><select className="select" value={newChamada.Presenca} onChange={(e) => setNewChamada({ ...newChamada, Presenca: e.target.value })}><option>Presente</option><option>Ausente</option></select></div>
                  <div className="field"><label>Matrícula</label><select className="select" value={newChamada.IdMatricula} onChange={(e) => setNewChamada({ ...newChamada, IdMatricula: e.target.value })}><option value="">Selecione</option>{filteredMatriculas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
                </div>
                <div className="toolbar" style={{ marginTop: 8 }}><button className="btn" type="submit">Salvar</button><button className="btn ghost" type="button" onClick={() => setShowChamadaForm(false)}>Cancelar</button></div>
              </form>
            )}

            <table className="table-wrap" style={{ width: '100%', fontSize: '0.9rem' }}>
              <thead><tr>{showChamadaSelection && <th style={{ width: 36 }}></th>}<th style={{ textAlign: 'left' }}>Aluno</th><th style={{ textAlign: 'left' }}>Data</th><th style={{ textAlign: 'left' }}>Presença</th></tr></thead>
              <tbody>
                {chamadas.map((c) => (
                  <tr key={c.IdChamada} style={{ background: selectedChamadaIds.includes(c.IdChamada) ? '#fce4ec' : undefined, cursor: showChamadaSelection ? 'pointer' : undefined }} onClick={showChamadaSelection ? () => setSelectedChamadaIds((prev) => prev.includes(c.IdChamada) ? prev.filter((id) => id !== c.IdChamada) : [...prev, c.IdChamada]) : undefined}>
                    {showChamadaSelection && <td><input type="checkbox" checked={selectedChamadaIds.includes(c.IdChamada)} readOnly /></td>}
                    <td>{c.NomeAluno || c.IdAluno}</td>
                    <td>{c.Data}</td>
                    <td>{c.Presenca}</td>
                  </tr>
                ))}
                {chamadas.length === 0 && <tr><td colSpan={showChamadaSelection ? 4 : 3} style={{ color: '#888' }}>Nenhuma chamada registrada.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      /* Layout normal — calendário + painel */
      <>
      <section className="entity-header">
        <div className="entity-header-copy">
          <div className="entity-header-topline">
            <h1 style={{ fontSize: '1.1rem', margin: 0 }}>Aulas</h1>
          </div>
        </div>
        <div className="entity-actions">
          <button type="button" className="btn" style={{ background: '#e91e63', color: '#fff' }} onClick={() => { setFormData({ NomeAula: '', HoraInicio: '', HoraFim: '', IdTurma: '' }); setPanelMode('create'); setSelectedAula(null); setChamadaExpanded(false); }}>
            + Adicionar
          </button>
        </div>
      </section>

      <div className="aulas-layout" style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>
        <div className="aulas-calendar" style={{ flex: 1, minWidth: 0 }}>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            locale={ptBrLocale}
            headerToolbar={{
              left: 'timeGridDay,timeGridWeek,dayGridMonth',
              center: 'title',
              right: 'today prev,next',
            }}
            buttonText={{ today: 'Hoje', day: 'Dia', week: 'Semana', month: 'Mês' }}
            events={events}
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            dateClick={handleDateClick}
            allDaySlot={false}
            slotMinTime="05:00:00"
            slotMaxTime="23:00:00"
            height="auto"
            nowIndicator
            editable={false}
            selectable
          />
        </div>

        {panelMode && (
          <aside className="aulas-panel" style={{ width: 380, minWidth: 320, maxWidth: '100%', background: '#fff', borderLeft: '1px solid #e0e0e0', padding: 16, overflowY: 'auto' }}>
            {panelMode === 'view' && selectedAula && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong style={{ fontSize: '1.1rem' }}>{selectedAula.NomeAula}</strong>
                  <button type="button" className="icon-action-btn" onClick={closePanel} aria-label="Fechar">✕</button>
                </div>
                <p><b>Turma:</b> {selectedAula.NomeTurma || '-'}</p>
                <p><b>Início:</b> {selectedAula.HoraInicio ? new Date(selectedAula.HoraInicio).toLocaleString('pt-BR') : '-'}</p>
                <p><b>Duração:</b> {duracao || '-'}</p>
                <p><b>Status:</b> {selectedAula.StatusChamada || '-'}</p>
                {selectedAula.Observacao && <p><b>Obs:</b> {selectedAula.Observacao}</p>}

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn" onClick={startEdit}>Editar</button>
                  <button type="button" className="btn" style={{ background: '#e91e63', color: '#fff' }} onClick={openChamadaForm}>Efetuar Chamada</button>
                  <button type="button" className="btn ghost" onClick={handleDelete}>Remover</button>
                </div>

                {showChamadaForm && (
                  <form onSubmit={handleSaveChamada} style={{ marginTop: 16, padding: 12, border: '1px solid #e0e0e0', borderRadius: 8 }}>
                    <strong>Nova Chamada</strong>
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <div className="field"><label>Data</label><input className="input" type="date" required value={newChamada.Data} onChange={(e) => setNewChamada({ ...newChamada, Data: e.target.value })} /></div>
                    </div>
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <div className="field">
                        <label>Aluno</label>
                        <select className="select" required value={newChamada.IdAluno} onChange={(e) => setNewChamada({ ...newChamada, IdAluno: e.target.value, IdMatricula: '' })}>
                          <option value="">Selecione o aluno</option>
                          {chamadaFormOptions.alunos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <div className="field">
                        <label>Presença</label>
                        <select className="select" value={newChamada.Presenca} onChange={(e) => setNewChamada({ ...newChamada, Presenca: e.target.value })}>
                          <option>Presente</option>
                          <option>Ausente</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <div className="field">
                        <label>Matrícula</label>
                        <select className="select" value={newChamada.IdMatricula} onChange={(e) => setNewChamada({ ...newChamada, IdMatricula: e.target.value })}>
                          <option value="">Selecione a matrícula</option>
                          {filteredMatriculas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="toolbar" style={{ marginTop: 12 }}><button className="btn" type="submit">Salvar</button><button className="btn ghost" type="button" onClick={() => setShowChamadaForm(false)}>Cancelar</button></div>
                  </form>
                )}

                {chamadas.length > 0 && !chamadaExpanded && (
                  <div style={{ marginTop: 16, borderTop: '1px solid #e0e0e0', paddingTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>Chamadas Relacionadas ({chamadas.length})</strong>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn ghost" style={{ fontSize: '0.8rem' }} onClick={() => setChamadaExpanded(true)}>Expandir</button>
                        <button type="button" className="btn ghost" style={{ fontSize: '0.8rem' }} onClick={openChamadaForm}>Adicionar</button>
                      </div>
                    </div>
                    <table style={{ width: '100%', marginTop: 8, fontSize: '0.85rem' }}>
                      <thead><tr><th style={{ textAlign: 'left' }}>Aluno</th><th style={{ textAlign: 'left' }}>Data</th></tr></thead>
                      <tbody>
                        {chamadas.slice(0, 5).map((c) => (
                          <tr key={c.IdChamada}><td>{c.NomeAluno || c.IdAluno}</td><td>{c.Data}</td></tr>
                        ))}
                        {chamadas.length > 5 && <tr><td colSpan={2} style={{ color: '#888' }}>...e mais {chamadas.length - 5}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}

                {chamadas.length === 0 && !showChamadaForm && (
                  <div style={{ marginTop: 16, borderTop: '1px solid #e0e0e0', paddingTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>Chamadas Relacionadas (0)</strong>
                      <button type="button" className="btn ghost" style={{ fontSize: '0.8rem' }} onClick={openChamadaForm}>Adicionar</button>
                    </div>
                    <p style={{ color: '#888', fontSize: '0.85rem' }}>Nenhuma chamada registrada.</p>
                  </div>
                )}

              </div>
            )}

            {(panelMode === 'edit' || panelMode === 'create') && (
              <form onSubmit={handleSave}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong>{panelMode === 'create' ? 'Nova Aula' : 'Editar Aula'}</strong>
                  <button type="button" className="icon-action-btn" onClick={closePanel} aria-label="Fechar">✕</button>
                </div>
                <div className="form-row">
                  <div className="field"><label htmlFor="aula-nome">Nome da Aula</label><input id="aula-nome" className="input" required value={formData.NomeAula || ''} onChange={(e) => setFormData({ ...formData, NomeAula: e.target.value })} /></div>
                </div>
                <div className="form-row">
                  <div className="field"><label htmlFor="aula-inicio">Início</label><input id="aula-inicio" className="input" type="datetime-local" required value={formData.HoraInicio || ''} onChange={(e) => setFormData({ ...formData, HoraInicio: e.target.value })} /></div>
                  <div className="field"><label htmlFor="aula-fim">Fim</label><input id="aula-fim" className="input" type="datetime-local" required value={formData.HoraFim || ''} onChange={(e) => setFormData({ ...formData, HoraFim: e.target.value })} /></div>
                </div>
                <div className="form-row">
                  <div className="field">
                    <label>Turma</label>
                    <select className="select" value={formData.IdTurma || ''} onChange={(e) => setFormData({ ...formData, IdTurma: e.target.value })}>
                      <option value="">Selecione</option>
                      {turmaOptions.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>
                  </div>
                </div>
                <div className="toolbar" style={{ marginTop: 12 }}>
                  <button className="btn" type="submit">Salvar</button>
                  <button className="btn ghost" type="button" onClick={closePanel}>Cancelar</button>
                </div>
              </form>
            )}
          </aside>
        )}
      </div>
      </>
      )}
    </div>
  );
}
