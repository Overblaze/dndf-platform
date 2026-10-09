import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN, USERNAME_RULE, cleanUsername, useAuth, validUsername } from '../lib/auth';
import { Dialog } from './Dialog';

/** Signing in: Discord, or a username and password for a player who has no Discord. */
export function SignInDialog({ onClose }: { onClose: () => void }) {
  const { signIn, signInWithPassword, join } = useAuth();
  const [mode, setMode] = useState<'in' | 'join'>('in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const joining = mode === 'join';
  const nameOk = validUsername(username);
  const warning = !joining ? null
    : username && !nameOk ? `A username is ${USERNAME_RULE}, starting with a letter or number.`
    : password && password.length < PASSWORD_MIN ? `A password is at least ${PASSWORD_MIN} characters.`
    : again && again !== password ? 'The two passwords are not the same.'
    : null;
  const ready = joining ? nameOk && password.length >= PASSWORD_MIN && again === password && code.trim() !== '' : username.trim() !== '' && password !== '';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setProblem(null);
    const failed = joining ? await join(username, password, code) : await signInWithPassword(username, password);
    setBusy(false);
    if (failed) setProblem(failed); else onClose();
  };

  return (
    <Dialog title="Sign in" onClose={onClose}>
      <button className="btn btn-primary" onClick={() => void signIn()}>Sign in with Discord</button>
      <p className="page-ref">The usual way. It also lets the Discord bot find your characters.</p>

      <form onSubmit={(e) => void submit(e)}>
        <fieldset>
          <legend className="label">{joining ? 'No Discord? Make an account' : 'No Discord? Use a username and password'}</legend>
          <label className="field">
            <span className="label">Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={24} />
          </label>
          {joining && nameOk && cleanUsername(username) !== username && <p className="page-ref">Saved as {cleanUsername(username)}.</p>}
          <label className="field">
            <span className="label">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={joining ? 'new-password' : 'current-password'} maxLength={72} />
          </label>
          {joining && (
            <>
              <label className="field">
                <span className="label">Password again</span>
                <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" maxLength={72} />
              </label>
              <label className="field">
                <span className="label">Table code (from your DM)</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={80} />
              </label>
            </>
          )}
          {warning && <p className="page-ref held-why">{warning}</p>}
          {problem && <p className="notice" role="alert">{problem}</p>}
          <div className="row wrap">
            <button type="submit" className="btn btn-primary" disabled={!ready || busy}>{busy ? 'One moment…' : joining ? 'Make the account' : 'Sign in'}</button>
            <button type="button" className="btn" onClick={() => { setMode(joining ? 'in' : 'join'); setProblem(null); }}>{joining ? 'I already have an account' : 'I’m new: make an account'}</button>
          </div>
          <p className="page-ref">
            {joining
              ? 'There is no email on these accounts, so a forgotten password can’t be reset by you: your DM sets a new one. Pick one you will remember, and not one you use anywhere else.'
              : 'Forgot your password? Ask your DM to set a new one.'}
          </p>
        </fieldset>
      </form>
    </Dialog>
  );
}

/** For a password account: choosing a new password while signed in. */
export function PasswordDialog({ onClose }: { onClose: () => void }) {
  const { changePassword, name } = useAuth();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const ready = password.length >= PASSWORD_MIN && again === password;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    const failed = await changePassword(password);
    setBusy(false);
    setProblem(failed);
    setDone(!failed);
  };
  return (
    <Dialog title="Your account" onClose={onClose}>
      <p>Signed in as <strong>{name}</strong>, with a username and password.</p>
      {done ? (
        <>
          <p className="notice" role="status">Your password is changed.</p>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <label className="field"><span className="label">New password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" maxLength={72} /></label>
          <label className="field"><span className="label">New password again</span><input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" maxLength={72} /></label>
          {password && password.length < PASSWORD_MIN && <p className="page-ref held-why">A password is at least {PASSWORD_MIN} characters.</p>}
          {again && again !== password && <p className="page-ref held-why">The two passwords are not the same.</p>}
          {problem && <p className="notice" role="alert">{problem}</p>}
          <button type="submit" className="btn btn-primary" disabled={!ready || busy}>{busy ? 'One moment…' : 'Change password'}</button>
        </form>
      )}
    </Dialog>
  );
}
