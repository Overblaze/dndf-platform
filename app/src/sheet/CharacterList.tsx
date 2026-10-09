import { deriveSheet, kaito, TEST_CHARACTERS, type CharacterDoc } from '@dndf/engine';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Backup } from '../components/Backup';
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
          <p className="notice">You are not signed in, so characters here are kept only in this browser. Sign in to keep them on your account.</p>
        )}
        {error && <p className="notice" role="alert">{error}</p>}
        {!characters && !error && <p>Checking the crew list…</p>}
        {characters?.length === 0 && <p>No characters yet. Create one, or add the sample character to look around.</p>}
        {characters?.map((character) => {
          // A character whose numbers can't be worked out still gets its row, so it can be opened or deleted.
          const sheet = (() => { try { return deriveSheet(character.doc, ruleSet(character.doc.rulesVersion).rules); } catch { return null; } })();
          return (
            <div key={character.id} className="resource">
              <Link className="character-link" to={`/sheet/${character.id}`}>
                <span className="resource-name">{sheet?.name ?? character.doc.name}</span>
                <span className="page-ref">
                  {sheet
                    ? `${sheet.summary} · ${VERSION_NAMES[character.doc.rulesVersion]} · HP ${character.doc.state.hp} / ${sheet.maxHp.value}${character.unsent ? ' · changed on this device, not sent yet' : ''}`
                    : 'This character could not be worked out. Open it to see why, or delete it.'}
                </span>
              </Link>
              <button className="btn" onClick={() => setDeleting(character)}>Delete</button>
            </div>
          );
        })}
        <div className="row wrap">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>New character</button>
          <button className="btn" onClick={() => create(kaito(ruleSet('dndf-10').rules))}>Add the sample: Kaito, Bruiser 7</button>
        </div>
        <details className="rule-text">
          <summary>Test characters</summary>
          <p className="soft">Made-up characters whose numbers were worked out by hand from the books. The automated tests check every one; add one here to look at it.</p>
          <select value="" onChange={(e) => { const picked = TEST_CHARACTERS.find((c) => c.id === e.target.value); if (picked) void create(picked.build(ruleSet(picked.version).rules)); }} aria-label="Add a test character">
            <option value="">Add a test character…</option>
            {TEST_CHARACTERS.map((c) => <option key={c.id} value={c.id}>{c.name} ({VERSION_NAMES[c.version]}): {c.checks}</option>)}
          </select>
        </details>
        <p className="page-ref">Classes, races, backgrounds, crew roles and feats from both handbooks (v10 and v8.8) are available. “New character” opens the step-by-step builder; the Build page has it too, with level up and editing for the characters you have.</p>
      </section>

      <Backup
        kind="characters"
        mine={(characters ?? []).map((c) => c.doc)}
        add={async (doc: CharacterDoc) => { const stored = await store.create(doc); void store.log(stored.id, `Imported ${doc.name} from a file`); }}
        onDone={load}
      />

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
