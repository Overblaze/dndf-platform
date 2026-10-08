import { deriveSheet, type CharacterDoc } from '@dndf/engine';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ruleSet, VERSION_NAMES } from '../lib/rules';
import { storeFor, type StoredCharacter } from '../lib/store';
import { CharacterForm } from '../sheet/CharacterForm';

/** Everything that changes what a character is: make a new one step by step, or level up and rebuild one you have. */
export function BuildPage() {
  const navigate = useNavigate();
  const { loading, session } = useAuth();
  const userId = session?.user.id ?? null;
  const store = useMemo(() => storeFor(userId), [userId]);
  const [characters, setCharacters] = useState<StoredCharacter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (loading) return;
    let current = true;
    setCharacters(null);
    store.list().then((list) => current && setCharacters(list), (e: Error) => current && setError(e.message));
    return () => { current = false; };
  }, [store, loading]);

  const create = async (doc: CharacterDoc) => {
    try {
      const stored = await store.create(doc);
      void store.log(stored.id, `Created ${doc.name}`);
      navigate(`/sheet/${stored.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) return <p>Checking who is aboard…</p>;
  if (creating) {
    return (
      <section className="card">
        <h1>New character</h1>
        <CharacterForm initial={null} onCancel={() => setCreating(false)} onSave={(doc) => void create(doc)} />
      </section>
    );
  }
  return (
    <>
      <section className="card">
        <h1>Build</h1>
        {error && <p className="notice" role="alert">{error}</p>}
        <p>Make a character step by step, the way the handbook's eleven steps go: race, class, ability scores (standard array, point buy or 4d6 drop the lowest), background, crew role, equipment. Every step can be skipped and come back to.</p>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>New character</button>
        </div>
        {store.local && <p className="page-ref">You are not signed in, so a new character is kept only in this browser.</p>}
      </section>

      <section className="card">
        <h2>Change a character you have</h2>
        {!characters && !error && <p>Checking the crew list…</p>}
        {characters?.length === 0 && <p className="soft">None yet.</p>}
        {characters?.map((character) => {
          const sheet = (() => { try { return deriveSheet(character.doc, ruleSet(character.doc.rulesVersion).rules); } catch { return null; } })();
          const to = (what: string) => `/sheet/${character.id}?${what}`;
          return (
            <div key={character.id} className="tracker">
              <div className="resource">
                <Link className="character-link" to={`/sheet/${character.id}`}>
                  <span className="resource-name">{sheet?.name ?? character.doc.name}</span>
                  <span className="page-ref">{sheet ? `${sheet.summary} · ${VERSION_NAMES[character.doc.rulesVersion]}` : 'This character could not be worked out. Open it to see why.'}</span>
                </Link>
              </div>
              <div className="row wrap">
                <Link className="btn btn-primary" to={to('do=level')}>Level up</Link>
                <Link className="btn" to={to('do=edit')}>Edit build</Link>
                <Link className="btn" to={to('do=surge')}>+ Spirit Surge</Link>
                <Link className="btn" to={to('tab=features')}>Features</Link>
                <Link className="btn" to={to('do=history')}>History</Link>
              </div>
            </div>
          );
        })}
        <p className="page-ref">
          <strong>Level up</strong> adds a level in a class you have or a new one. <strong>Edit build</strong> changes race, class, scores, skills, gear and your own classes.{' '}
          <strong>Features</strong> is where you add a feature of your own, borrow one from another class, take one off, and pick racial options. <strong>History</strong> brings back an earlier version.
        </p>
      </section>
    </>
  );
}
