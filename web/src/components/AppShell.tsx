import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { visibleNav } from '../lib/permissions';
import type { Me } from '../lib/types';

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function Sidebar({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const items = visibleNav(me);
  const groups = ['Workspace', 'Admin'] as const;
  return (
    <aside className="side" data-testid="sidebar">
      <div className="brand">
        <div className="mark">P</div>
        <div>
          <div className="bn">PPG Pulse</div>
          <div className="bs">VAYUZ People Group</div>
        </div>
      </div>
      <nav className="nav">
        {groups.map((group) => {
          const groupItems = items.filter((i) => i.group === group);
          if (!groupItems.length) return null;
          return (
            <div key={group}>
              <div className="nav-g">{group}</div>
              {groupItems.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => `nav-i ${isActive ? 'on' : ''}`}
                >
                  <span className="ic">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="userbox">
        <div className="ub-row">
          <div className="ub-av">{initials(me.name)}</div>
          <div>
            <div className="ub-n">{me.name}</div>
            <div className="ub-r">{me.role.label}</div>
          </div>
        </div>
        <div className="ub-switch">
          <button className="btn btn-gho btn-sm" style={{ width: '100%' }} onClick={onLogout}>
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app">
      <Sidebar me={me} onLogout={handleLogout} />
      <div className="main">
        <div className="topbar">
          <div className="tb-title">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="tb-right">
            <div className="pchip">{me.role.sub}</div>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
