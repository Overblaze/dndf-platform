import { useAuth } from '../lib/auth';

export function DmPage() {
  const { session, profile, isDm, name } = useAuth();
  return (
    <section className="card">
      <h1>DM</h1>
      {!session && <p>Sign in with Discord to see whether you are a DM.</p>}
      {session && !profile && <p>Checking your profile…</p>}
      {profile && isDm && (
        <p>
          You are signed in as a DM, {name}. Campaign tools, Devil Fruit grants and the party view arrive in later phases.
        </p>
      )}
      {profile && !isDm && (
        <p>
          You are signed in as a player. DM tools are only for the table's DM. If that is you, the bootstrap Discord username
          in the database does not match <strong>{profile.discord_username ?? 'your account'}</strong> yet; set it, then sign
          out and in again.
        </p>
      )}
    </section>
  );
}
