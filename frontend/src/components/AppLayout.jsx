import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, RefreshCcw, Wifi, WifiOff } from 'lucide-react';
import { authApi } from '../api/authApi';
import api from '../api/apiConfig';
import notify from '../utils/notify';
import { flushPendingOfflineWrites, getPendingOfflineCount, isOnline as getOnlineState } from '../utils/offlineManager';
import { getSessionProfile, getSessionUserDisplay, isAdminSessionProfile } from '../utils/sessionStore';

const MOBILE_MEDIA_QUERY = '(max-width: 900px), (max-height: 640px)';

const buildLinks = (perfil) => {
  if (isAdminSessionProfile(perfil)) {
    return [
      { to: '/dashboard', label: 'Dashboard', icon:  <span className="sidebar-icon fa-solid fa-chart-column" aria-hidden="true"></span> },
      { to: '/alunos', label: 'Alunos', icon:  <span className="sidebar-icon fa-solid fa-user-graduate" aria-hidden="true"></span> },
      { to: '/cursos', label: 'Matricular Cursos', icon: <span className="sidebar-icon fa-solid fa-user-gear" aria-hidden="true"></span>},
      { to: '/aulas', label: 'Aulas', icon: <span className="sidebar-icon fa-solid fa-calendar" aria-hidden="true"></span> },
      { to: '/professores', label: 'Professores', icon: <span className="sidebar-icon fa-solid fa-chalkboard-user" aria-hidden="true"></span> },
      { to: '/turmas', label: 'Turmas', icon: <span className="sidebar-icon fa-solid fa-people-roof" aria-hidden="true"></span> },
      { to: '/interesses', label: 'Interesses', icon: <span className="sidebar-icon fa-solid fa-timeline" aria-hidden="true"></span> },
      { to: '/trilhas', label: 'Trilhas', icon:  <span className="sidebar-icon fa-solid fa-list-ul" aria-hidden="true"></span>},
      { to: '/avaliacoes', label: 'Avaliações', icon: <span className="sidebar-icon fa-solid fa-users" aria-hidden="true"></span> },
      { to: '/chamadas', label: 'Frequência', icon: <span className="sidebar-icon fa-solid fa-list-check" aria-hidden="true"></span> },
      { to: '/users', label: 'Usuários', icon: <span className="sidebar-icon fa-solid fa-user-group" aria-hidden="true"></span> },
      { to: '/importar-dados', label: 'Importar Dados', icon: <span className="sidebar-icon fa-solid fa-download" aria-hidden="true"></span> },
    ];
  }
  return [
    { to: '/user', label: 'Usuário', icon: <span className="sidebar-icon fa-solid fa-user" aria-hidden="true"></span> },
    { to: '/profile', label: 'Meu Perfil', icon: '🎓' },
  ];
};

function getUserDisplay(session) {
  return String(session?.login || session?.user || '').trim() || getSessionUserDisplay();
}

function getInitials(value) {
  const source = (value || 'Usuário').trim();
  const parts = source.includes('@') ? source.split('@')[0].split(/[._-]+/) : source.split(/\s+/);
  const letters = parts.filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '');
  return (letters.join('') || 'U').slice(0, 2);
}

export default function AppLayout({ session = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef(null);
  const compactNavRef = useRef(null);
  const perfil = session?.perfil || getSessionProfile();
  const isAdmin = isAdminSessionProfile(perfil);
  const links = useMemo(() => buildLinks(perfil), [perfil]);
  const [collapsed, setCollapsed] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  });
  const [isOnline, setIsOnline] = useState(getOnlineState());
  const [pendingOfflineCount, setPendingOfflineCount] = useState(() => getPendingOfflineCount());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(max-width: 768px)').matches;
  });
  const userDisplay = getUserDisplay(session);
  const initials = getInitials(userDisplay);

  const refreshPendingOfflineCount = () => setPendingOfflineCount(getPendingOfflineCount());

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const submitElements = root.querySelectorAll('button[type="submit"], input[type="submit"]');
    submitElements.forEach((element) => {
      const htmlElement = element;
      if (!isOnline) {
        if (!htmlElement.hasAttribute('data-offline-prev-disabled')) {
          htmlElement.setAttribute('data-offline-prev-disabled', htmlElement.disabled ? 'true' : 'false');
        }
        htmlElement.disabled = true;
        htmlElement.setAttribute('aria-disabled', 'true');
        htmlElement.setAttribute('title', 'Modo offline: alterações e cadastros ficam em leitura até a conexão voltar.');
        htmlElement.classList.add('offline-readonly-control');
        return;
      }

      const previousDisabled = htmlElement.getAttribute('data-offline-prev-disabled');
      if (previousDisabled !== null) {
        htmlElement.disabled = previousDisabled === 'true';
        htmlElement.removeAttribute('data-offline-prev-disabled');
      }
      htmlElement.removeAttribute('aria-disabled');
      htmlElement.removeAttribute('title');
      htmlElement.classList.remove('offline-readonly-control');
    });
  }, [isOnline, location.pathname]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleViewportChange = (event) => {
      setIsCompactViewport(event.matches);
      if (event.matches) {
        setCollapsed(false);
      }
    };

    setIsCompactViewport(mediaQuery.matches);
    if (mediaQuery.matches) {
      setCollapsed(false);
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleViewportChange);
      return () => mediaQuery.removeEventListener('change', handleViewportChange);
    }

    mediaQuery.addListener(handleViewportChange);
    return () => mediaQuery.removeListener(handleViewportChange);
  }, []);

  // Mobile viewport detection
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mobileQuery = window.matchMedia('(max-width: 768px)');
    const handleMobileChange = (event) => {
      setIsMobileView(event.matches);
      if (!event.matches) {
        setMobileMenuOpen(false);
      }
    };

    setIsMobileView(mobileQuery.matches);

    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', handleMobileChange);
      return () => mobileQuery.removeEventListener('change', handleMobileChange);
    }

    mobileQuery.addListener(handleMobileChange);
    return () => mobileQuery.removeListener(handleMobileChange);
  }, []);

  useEffect(() => {
    if (isMobileView && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileView) return undefined;

    const previousOverflow = document.body.style.overflow;
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = previousOverflow || '';
    }

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onEsc);
    return () => {
      document.body.style.overflow = previousOverflow || '';
      window.removeEventListener('keydown', onEsc);
    };
  }, [isMobileView, mobileMenuOpen]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      refreshPendingOfflineCount();
      const queuedCount = getPendingOfflineCount();
      notify(
        queuedCount
          ? `Conexão restabelecida. Há ${queuedCount} alteração(ões) local(is) aguardando sincronização.`
          : 'Conexão restabelecida. Você já pode sincronizar.',
        { type: 'success', fallbackTargetId: 'app-feedback' }
      );
    };
    const handleOffline = () => {
      setIsOnline(false);
      notify('Modo offline ativado.', { type: 'error', fallbackTargetId: 'app-feedback' });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLogout = async () => {
    await authApi.logout();
  };

  const handleSync = async () => {
    if (!isOnline) {
      notify('Você está offline. A sincronização será habilitada quando a conexão voltar.', { type: 'error', fallbackTargetId: 'app-feedback' });
      return;
    }

    if (pendingOfflineCount) {
      notify(`Sincronizando ${pendingOfflineCount} alteração(ões) local(is)...`, { type: 'success', fallbackTargetId: 'app-feedback' });
      const result = await flushPendingOfflineWrites((entry) => api.request({
        url: entry.url,
        method: entry.method,
        data: entry.data,
      }));
      refreshPendingOfflineCount();
      if (result.failed.length) {
        notify(`${result.failed.length} alteração(ões) local(is) ainda não puderam ser sincronizadas.`, { type: 'error', fallbackTargetId: 'app-feedback' });
        return;
      }
      notify('Alterações locais sincronizadas com sucesso.', { type: 'success', fallbackTargetId: 'app-feedback' });
    } else {
      notify('Sincronizando dados...', { type: 'success', fallbackTargetId: 'app-feedback' });
    }

    window.location.reload();
  };

  const handleUserShortcut = () => {
    if (isAdmin) {
      navigate('/users?editMe=1');
      return;
    }
    navigate('/user');
  };

  const closeMobileMenu = () => {
    if (isMobileView) {
      setMobileMenuOpen(false);
    }
  };

  const scrollCompactMenu = (direction) => {
    const nav = compactNavRef.current;
    if (!nav) return;
    nav.scrollBy({ left: direction * 220, behavior: 'smooth' });
  };

  return (
    <div className="layout">
      <aside className={`sidebar${collapsed && !isCompactViewport ? ' sidebar-collapsed' : ''}${isMobileView && mobileMenuOpen ? ' mobile-expanded' : ''}`} data-collapsed={collapsed && !isCompactViewport ? 'true' : 'false'}>
        <div className="sidebar-header">
          <div className="sidebar-brand-row">
            <img src="/full-educa-icone.svg" alt="Ícone FullEduca" className="sidebar-brand-icon" />
            <div className="sidebar-brand-text">
              <div className="sidebar-title">FullEduca</div>
              <div className="sidebar-subtitle">
                {isAdmin ? 'Administrador' : 'Aluno'}
              </div>
            </div>
          </div>
          {!isCompactViewport ? (
            <button
              type="button"
              className="sidebar-toggle"
              aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              onClick={() => {
                setCollapsed((current) => !current);
              }}
            >
              <Menu size={18} />
            </button>
          ) : null}
        </div>
        {isCompactViewport ? <button type="button" className="sidebar-scroll-btn" aria-label="Rolar menu para a esquerda" onClick={() => scrollCompactMenu(-1)}>‹</button> : null}
        <nav ref={compactNavRef} className="sidebar-nav" data-testid="sidebar-menu">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              onClick={closeMobileMenu}
            >
              <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
              <span className="sidebar-text">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        {isCompactViewport ? <button type="button" className="sidebar-scroll-btn" aria-label="Rolar menu para a direita" onClick={() => scrollCompactMenu(1)}>›</button> : null}
        <div className="sidebar-footer">
          <button type="button" className="sidebar-link sidebar-button logout-btn" onClick={() => { handleLogout(); closeMobileMenu(); }}>
            <span className="sidebar-icon fa-solid fa-right-from-bracket" aria-hidden="true"></span>


            <span className="sidebar-text">Sair</span>
          </button>
        </div>
      </aside>
      {isMobileView && mobileMenuOpen ? <button type="button" className="mobile-menu-backdrop" aria-label="Fechar menu" onClick={closeMobileMenu} /> : null}
      <main ref={contentRef} className={`layout-content${isOnline ? '' : ' layout-content-offline'}`}>
        <header className="app-topbar">
          <div className="app-topbar-left app-topbar-branding">
            {isMobileView ? (
              <button
                type="button"
                className="topbar-icon-btn"
                aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <Menu size={20} />
              </button>
            ) : null}
            <img src="/full-educa-icone.svg" alt="Ícone FullEduca" className="topbar-brand-icon" />
            <div className="topbar-brand-copy">
              <strong>FullEduca</strong>
              <span>{isAdmin ? 'Operação administrativa' : 'Área do aluno'}</span>
            </div>
          </div>
          <div className="app-topbar-actions">
            <button type="button" className="topbar-icon-btn" aria-label="Sincronizar dados" onClick={handleSync}>
              <RefreshCcw size={17} />
            </button>
            <div className={`sync-pill${isOnline ? ' is-online' : ' is-offline'}`} aria-label={isOnline ? 'Online' : 'Offline'} title={isOnline ? 'Online' : 'Offline'}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            {pendingOfflineCount ? <div className="sync-pill is-pending" aria-label={`${pendingOfflineCount} alterações locais pendentes`}>{pendingOfflineCount} pend.</div> : null}
            <button type="button" className="user-chip user-chip-compact" aria-label="Abrir meu usuário" onClick={handleUserShortcut}>
              <span className="user-chip-avatar">{initials}</span>
            </button>
          </div>
        </header>
        {!isOnline ? (
          <div className="offline-readonly-banner" role="status" aria-live="polite">
            <strong>Modo offline em leitura</strong>
            <span>Você pode navegar pelos dados em cache, mas alterações, uploads e novos cadastros ficam bloqueados até a conexão voltar.</span>
          </div>
        ) : null}
        {isOnline && pendingOfflineCount ? (
          <div className="offline-readonly-banner offline-pending-banner" role="status" aria-live="polite">
            <strong>Alterações locais pendentes</strong>
            <span>Há {pendingOfflineCount} alteração(ões) salva(s) localmente aguardando sincronização. Use o botão de sincronizar para enviar ao servidor.</span>
          </div>
        ) : null}
        <div id="app-feedback" className="form-feedback" aria-live="polite" />
        <Outlet />
      </main>
    </div>
  );
}
