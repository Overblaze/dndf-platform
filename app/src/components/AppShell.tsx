import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { sendWaiting, useWaiting } from '../lib/offline';
import { useOnline } from '../lib/online';
import { Compass } from './Compass';
import { ReportButton } from './ReportDialog';
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
  const waiting = useWaiting();
  const clashes = waiting.filter((w) => w.clash);
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
            {session ? 'Your account’s characters and ships that have been opened on this device work too: changes are kept here and sent when you are back online. Pictures, Devil Fruits and the Crew and DM pages need a connection.' : 'Signing in needs a connection.'}
          </p>
        )}
        {waiting.length > 0 && (
          <p className="notice" role="status">
            {waiting.length === 1 ? `A change to ${waiting[0]!.name} is` : `Changes to ${waiting.map((w) => w.name).join(', ')} are`} kept on this device and not on your account yet.{' '}
            {clashes.length > 0
              ? `${clashes.map((w) => w.name).join(', ')} ${clashes.length === 1 ? 'was' : 'were'} also changed somewhere else: open ${clashes.length === 1 ? 'it' : 'each'} to choose which version stays.`
              : online ? <button className="btn" onClick={() => void sendWaiting()}>Send now</button> : 'They will be sent when you are back online.'}
          </p>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <Outlet />
        <footer className="page-foot">
          <ReportButton />
          <span className="page-ref">Found a bug, or want something added? It goes straight to Matt.</span>
        </footer>
      </main>
    </div>
  );
}
