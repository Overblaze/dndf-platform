import { deriveSheet, kaito, type CharacterDoc } from '@dndf/engine';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Dialog } from '../components/Dialog';
import { ruleSet, VERSION_NAMES } from '../lib/rules';
import type { CharacterStore, StoredCharacter } from '../lib/store';
import { CharacterForm } from './CharacterForm';

export function CharacterList({ store }: { store: CharacterStore }) {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<StoredCharacter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<StoredCharacter | null>(null);

  const load = useCallback(() => {
    setCharacters(null);
    store.list().then(setCharacters, (e: Error) => setError(e.message));
  }, [store]);
  useEffect(load, [load]);

  const create = async (doc: CharacterDoc) => {
    try {
      const stored = await store.create(doc);
      void store.log(stored.id, `Created ${doc.name}`);
      navigate(`/sheet/${stored.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async (character: StoredCharacter) => {
    setDeleting(null);
    try {
      await store.remove(character.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <section className="card">
        <h1>My characters</h1>
        {store.local && (
          <p className="notice">You are not signed in, so characters here are kept only in this browser. Sign in with Discord to keep them on your account.</p>
        )}
        {error && <p className="notice" role="alert">{error}</p>}
        {!characters && !error && <p>Checking the crew list…</p>}
        {characters?.length === 0 && <p>No characters yet. Create one, or add the sample character to look around.</p>}
        {characters?.map((character) => {
          const sheet = deriveSheet(character.doc, ruleSet(character.doc.rulesVersion).rules);
          return (
            <div key={character.id} className="resource">
              <Link className="character-link" to={`/sheet/${character.id}`}>
                <span className="resource-name">{sheet.name}</span>
                <span className="page-ref">{sheet.summary} · {VERSION_NAMES[character.doc.rulesVersion]} · HP {character.doc.state.hp} / {sheet.maxHp.value}</span>
              </Link>
              <button className="btn" onClick={() => setDeleting(character)}>Delete</button>
            </div>
          );
        })}
        <div className="row wrap">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>New character</button>
          <button className="btn" onClick={() => create(kaito(ruleSet('dndf-10').rules))}>Add the sample: Kaito, Bruiser 7</button>
        </div>
        <p className="page-ref">Classes, races, backgrounds, crew roles and feats from both handbooks (v10 and v8.8) are available. The step-by-step builder comes later, so ability scores are typed in as final values.</p>
      </section>

      {creating && (
        <Dialog title="New character" onClose={() => setCreating(false)}>
          <CharacterForm initial={null} onCancel={() => setCreating(false)} onSave={(doc) => { setCreating(false); void create(doc); }} />
        </Dialog>
      )}
      {deleting && (
        <Dialog title={`Delete ${deleting.doc.name}?`} onClose={() => setDeleting(null)}>
          <p>This removes the character and its history for good.</p>
          <div className="row">
            <button className="btn btn-damage" onClick={() => remove(deleting)}>Delete</button>
            <button className="btn" onClick={() => setDeleting(null)}>Keep</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
