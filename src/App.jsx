
import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import DashboardPage from './pages/Dashboard';
import UsersPage from './pages/Users';
import UsersDetail from './pages/UsersDetail';
import RequireAdmin from './components/RequireAdmin';
import Profile from './pages/Profile';
import UserAccount from './pages/UserAccount';
import AdminMenu from './pages/AdminMenu';
import ImportarDados from './pages/ImportarDados';
import AlunosPage from './pages/Alunos';
import ProfessoresPage from './pages/Professores';
import TurmasPage from './pages/Turmas';
import AppLayout from './components/AppLayout';
import AvaliacoesPage from './pages/Avaliacoes';
import ChamadasPage from './pages/Chamadas';
import CursosPage from './pages/Cursos';
import InteressesPage from './pages/Interesses';
import TrilhasPage from './pages/Trilhas';
import AulasPage from './pages/Aulas';
import LoginPage from './pages/Login';
import { authApi } from './api/authApi';
import { clearSessionOfflineSnapshot } from './utils/offlineManager';
import { clearSessionHints, getSessionHint } from './utils/sessionStore';

function SessionGate({ loading }) {
  if (!loading) return null;
  return <div className="app-shell"><div className="card">Carregando sessão...</div></div>;
}

function RequireAuth({ children, session, sessionLoading }) {
  if (sessionLoading) {
    return <SessionGate loading />;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return children ? children : <Outlet />;
}

function RootRedirect({ session, sessionLoading }) {
  if (sessionLoading) {
    return <SessionGate loading />;
  }
  return <Navigate to={session ? '/dashboard' : '/login'} replace />;
}

function LoginRoute({ session, sessionLoading }) {
  if (sessionLoading) {
    return <SessionGate loading />;
  }
  if (session) {
    return <Navigate to="/dashboard" replace />;
  }
  return <LoginPage />;
}


function App() {
  const [session, setSession] = useState(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return getSessionHint();
    }
    return null;
  });
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const legacyHint = getSessionHint();

    const bootstrapSession = async () => {
      clearSessionOfflineSnapshot();
      try {
        const currentSession = await authApi.getSession();
        if (!isMounted) return;
        setSession(currentSession);
      } catch (error) {
        if (!isMounted) return;
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const offlineFallback = isOffline ? legacyHint : null;
        if (!isOffline) {
          clearSessionHints();
        }
        setSession(offlineFallback);
      } finally {
        if (isMounted) setSessionLoading(false);
      }
    };

    bootstrapSession();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncSessionFromCurrentStorage = () => {
      if (window.location.pathname.includes('/login')) {
        setSession(null);
        return;
      }

      const hint = getSessionHint();
      if (!hint) {
        setSession(null);
      }
    };

    const handlePageShow = () => {
      syncSessionFromCurrentStorage();
    };

    const handlePopState = () => {
      syncSessionFromCurrentStorage();
    };

    const handleStorage = (event) => {
      if (!event.key || event.key.startsWith('@FullEduca:')) {
        syncSessionFromCurrentStorage();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const authLayout = useMemo(() => <RequireAuth session={session} sessionLoading={sessionLoading}><AppLayout session={session} /></RequireAuth>, [session, sessionLoading]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<RootRedirect session={session} sessionLoading={sessionLoading} />} />
        <Route path="/login" element={<LoginRoute session={session} sessionLoading={sessionLoading} />} />
        <Route element={authLayout}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/admin" element={<RequireAdmin session={session}><DashboardPage /></RequireAdmin>} />
          <Route path="/users" element={<RequireAdmin session={session}><UsersPage /></RequireAdmin>} />
          <Route path="/users/:id" element={<RequireAdmin session={session}><UsersDetail /></RequireAdmin>} />
          <Route path="/alunos" element={<RequireAdmin session={session}><AlunosPage /></RequireAdmin>} />
          <Route path="/professores" element={<RequireAdmin session={session}><ProfessoresPage /></RequireAdmin>} />
          <Route path="/turmas" element={<RequireAdmin session={session}><TurmasPage /></RequireAdmin>} />
          <Route path="/interesses" element={<RequireAdmin session={session}><InteressesPage /></RequireAdmin>} />
          <Route path="/trilhas" element={<RequireAdmin session={session}><TrilhasPage /></RequireAdmin>} />
          <Route path="/avaliacoes" element={<RequireAdmin session={session}><AvaliacoesPage /></RequireAdmin>} />
          <Route path="/chamadas" element={<RequireAdmin session={session}><ChamadasPage /></RequireAdmin>} />
          <Route path="/aulas" element={<RequireAdmin session={session}><AulasPage /></RequireAdmin>} />
          <Route path="/cursos" element={<RequireAdmin session={session}><CursosPage /></RequireAdmin>} />
            <Route path="/importar-dados" element={<RequireAdmin session={session}><ImportarDados /></RequireAdmin>} />
          <Route path="/user" element={<UserAccount />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<RootRedirect session={session} sessionLoading={sessionLoading} />} />
      </Routes>
    </Router>
  );
}

export default App;
