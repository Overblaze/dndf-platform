import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useOnline } from '../lib/online';
import { Compass } from './Compass';
import { PasswordDialog, SignInDialog } from './SignInDialog';

const NAV = [
  { to: '/sheet', label: 'Sheet' },
  { to: '/build', label: 'Build' },
  { to: '/library', label: 'Library' },
  { to: '/ship', label: 'Ship' },
  { to: '/crew', label: 'Crew' },
  { to: '/dm', label: 'DM' },
];

function Account() {
  const { configured, loading, session, name, isDm, passwordAccount, signOut } = useAuth();
  const [dialog, setDialog] = useState<'in' | 'account' | null>(null);
  if (!configured || loading) return null;
  if (!session) {
    return (
      <>
        <button className="btn btn-primary" onClick={() => setDialog('in')}>
          Sign in
        </button>
        {dialog === 'in' && <SignInDialog onClose={() => setDialog(null)} />}
      </>
    );
  }
  return (
    <div className="account">
      {passwordAccount ? (
        <button className="btn account-name" onClick={() => setDialog('account')} aria-label={`Your account: ${name ?? 'signed in'}`}>
          {name ?? 'Signed in'}
        </button>
      ) : (
        <span className="account-name" title="Signed in with Discord">
          {name ?? 'Signed in'}
        </span>
      )}
      {dialog === 'account' && <PasswordDialog onClose={() => setDialog(null)} />}
      {isDm && <span className="badge">DM</span>}
      <button className="btn" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}

export function AppShell() {
  const { error, session } = useAuth();
  const online = useOnline();
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
        {!online && (
          <p className="notice" role="status">
            You are offline. The Library, and characters and ships kept in this browser, work as usual.{' '}
            {session ? 'Anything on your account (your characters, your crew’s ship, Devil Fruits, the DM page) needs a connection: what is already on screen stays, but changes are not saved until you are back online.' : 'Signing in needs a connection.'}
          </p>
        )}
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
