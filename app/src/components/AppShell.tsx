import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Compass } from './Compass';

const NAV = [
  { to: '/sheet', label: 'Sheet' },
  { to: '/build', label: 'Build' },
  { to: '/library', label: 'Library' },
  { to: '/ship', label: 'Ship' },
  { to: '/crew', label: 'Crew' },
  { to: '/dm', label: 'DM' },
];

function Account() {
  const { configured, loading, session, name, isDm, signIn, signOut } = useAuth();
  if (!configured || loading) return null;
  if (!session) {
    return (
      <button className="btn btn-primary" onClick={signIn}>
        Sign in with Discord
      </button>
    );
  }
  return (
    <div className="account">
      <span className="account-name" title="Signed in with Discord">
        {name ?? 'Signed in'}
      </span>
      {isDm && <span className="badge">DM</span>}
      <button className="btn" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}

export function AppShell() {
  const { error } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="logo" aria-label="DnDF home">
          <Compass />
          <span>DnDF</span>
        </NavLink>
        <nav className="nav" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Account />
      </header>
      <main className="page">
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <Outlet />
      </main>
    </div>
  );
}
