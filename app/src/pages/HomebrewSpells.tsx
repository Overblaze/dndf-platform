import { ordinal, type CustomSpell } from '@dndf/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { campaignApi, type Campaign } from '../lib/campaigns';
import { spellLibraryFor, type LibrarySpell } from '../lib/homebrew';
import { supabase } from '../lib/supabase';
import { SpellEditor } from '../sheet/SpellEditor';

/** The spells you have written, and the ones your table has shared: add, change, share, delete. */
export function HomebrewSpells() {
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const library = useMemo(() => spellLibraryFor(userId), [userId]);
  const [spells, setSpells] = useState<LibrarySpell[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<LibrarySpell | 'new' | null>(null);
  const [shareWith, setShareWith] = useState<string>('');

  const load = useCallback(async () => {
    try {
      setSpells(await library.list());
      setProblem(null);
    } catch (e) {
      setSpells([]);
      setProblem((e as Error).message);
    }
  }, [library]);
  useEffect(() => { if (!loading) void load(); }, [load, loading]);
  useEffect(() => {
    if (!userId || !supabase) { setCampaigns([]); return; }
    campaignApi(supabase).myCampaigns(userId).then(setCampaigns, () => setCampaigns([]));
  }, [userId]);

  const open = (spell: LibrarySpell | 'new') => { setShareWith(spell === 'new' ? '' : spell.campaignId ?? ''); setEditing(spell); };
  const save = (spell: CustomSpell) => library.save(spell, shareWith || null).then(() => { setEditing(null); return load(); }, (e: Error) => setProblem(e.message));
  const remove = (spell: LibrarySpell) => library.remove(spell.id).then(() => { setEditing(null); return load(); }, (e: Error) => setProblem(e.message));
  const campaignName = (id: string | null) => campaigns.find((c) => c.id === id)?.name ?? 'your campaign';

  return (
    <>
      <p className="page-ref">
        {library.local
          ? 'Spells you write here are kept in this browser. Sign in to keep them on your account and share them with your campaign.'
          : 'Spells you write are yours. Share one with a campaign and everyone in it can read it and add it to their characters.'}
      </p>
      {problem && <p className="notice" role="alert">{problem}</p>}
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => open('new')}>Write a spell</button>
      </div>
      {spells?.length === 0 && !problem && <p className="soft">None yet.</p>}
      {spells?.map((spell) => (
        <details key={spell.id} className="feature">
          <summary>
            <span className="resource-name">{spell.name}</span>
            <span className="page-ref">
              {[spell.level === 0 ? 'cantrip' : `${ordinal(spell.level)} level`, spell.school, spell.mine ? (spell.campaignId ? `shared with ${campaignName(spell.campaignId)}` : library.local ? 'this browser' : 'only you') : 'shared by a crewmate'].filter(Boolean).join(' · ')}
            </span>
          </summary>
          <p className="page-ref">{[spell.castingTime, spell.range, spell.components, spell.duration, spell.ritual ? 'ritual' : ''].filter(Boolean).join(' · ')}</p>
          <p className="feature-text">{spell.text || 'No text written yet.'}</p>
          {spell.mine && <button className="btn" onClick={() => open(spell)}>Change, share or delete</button>}
        </details>
      ))}
      <p className="page-ref">To put one on a character: the character’s Spells tab → Add spells → “Your spells”.</p>
      {editing && (
        <SpellEditor
          initial={editing === 'new' ? undefined : editing}
          onSave={save}
          onDelete={editing === 'new' ? undefined : () => remove(editing)}
          onClose={() => setEditing(null)}
          extra={!library.local && (
            <label className="field">
              <span className="label">Who can see it</span>
              <select value={shareWith} onChange={(e) => setShareWith(e.target.value)}>
                <option value="">Only you</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>Everyone in {c.name}</option>)}
              </select>
            </label>
          )}
        />
      )}
    </>
  );
}
