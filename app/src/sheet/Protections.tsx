// Resistances, immunities and vulnerabilities: what the character has from features, items and
// conditions, and a list of the player's own to add to.
import { CONDITIONS, DAMAGE_TYPES, type DefenseKind, type OwnDefenses } from '@dndf/engine';
import { useState } from 'react';
import type { LiveCharacter } from '../lib/useCharacter';

const KINDS: { id: DefenseKind; name: string; verb: string }[] = [
  { id: 'resist', name: 'Resistant to', verb: 'Resistance to' },
  { id: 'immune', name: 'Immune to', verb: 'Immunity to' },
  { id: 'vulnerable', name: 'Vulnerable to', verb: 'Vulnerability to' },
  { id: 'conditions', name: 'Can’t be', verb: 'Immunity to being' },
];
const shown = (what: string) => (what === 'all' ? 'all damage' : what);

export function ProtectionsCard({ live }: { live: LiveCharacter }) {
  const { doc, sheet } = live;
  const [kind, setKind] = useState<DefenseKind>('resist');
  const [what, setWhat] = useState('');
  const own = doc.defenses ?? {};
  const set = (next: OwnDefenses, log: string) => {
    const tidy = Object.fromEntries(Object.entries(next).filter(([, list]) => list && list.length)) as OwnDefenses;
    live.setDoc({ ...doc, defenses: Object.keys(tidy).length ? tidy : undefined }, log);
  };
  const add = () => {
    const value = what.trim().toLowerCase();
    if (!value) return;
    set({ ...own, [kind]: [...new Set([...(own[kind] ?? []), value])] }, `${KINDS.find((k) => k.id === kind)!.verb} ${shown(value)} added`);
    setWhat('');
  };
  const remove = (from: DefenseKind, value: string) => set({ ...own, [from]: (own[from] ?? []).filter((x) => x !== value) }, `${KINDS.find((k) => k.id === from)!.verb} ${shown(value)} removed`);
  const any = KINDS.some((k) => sheet.protections[k.id].length > 0);
  const choices = kind === 'conditions' ? CONDITIONS.map((c) => c.toLowerCase()) : ['all', ...DAMAGE_TYPES];

  return (
    <section className="card">
      <h2>Resistances and immunities</h2>
      {!any && <p className="soft">None. Add one below, or give one to an item in “Make an item”.</p>}
      {KINDS.filter((k) => sheet.protections[k.id].length > 0).map((k) => (
        <div key={k.id} className="tracker">
          <div className="resource-name">{k.name}</div>
          <div className="chips">
            {sheet.protections[k.id].map((p) => (
              p.from === 'Your own'
                ? <button key={`${p.what}/${p.from}`} className="chip chip-btn chip-on" onClick={() => remove(k.id, p.what)} aria-label={`Remove ${k.verb.toLowerCase()} ${shown(p.what)}`}>{shown(p.what)} ×</button>
                : <span key={`${p.what}/${p.from}`} className="chip" title={`From ${p.from}`}>{shown(p.what)} <span className="page-ref">· {p.from}</span></span>
            ))}
          </div>
        </div>
      ))}
      <div className="grid-2">
        <label className="field">
          <span className="label">Add your own</span>
          <select value={kind} onChange={(e) => { setKind(e.target.value as DefenseKind); setWhat(''); }}>
            <option value="resist">Resistance to (half damage)</option>
            <option value="immune">Immunity to (no damage)</option>
            <option value="vulnerable">Vulnerability to (double damage)</option>
            <option value="conditions">Immunity to a condition</option>
          </select>
        </label>
        <label className="field">
          <span className="label">{kind === 'conditions' ? 'Which condition' : 'Which damage'}</span>
          <input value={what} onChange={(e) => setWhat(e.target.value)} list="protection-choices" placeholder={kind === 'conditions' ? 'poisoned' : 'fire'} maxLength={40} autoCapitalize="none" />
          <datalist id="protection-choices">{choices.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
      </div>
      <button className="btn" disabled={!what.trim()} onClick={add}>Add it</button>
      <p className="page-ref">
        Choose the damage type when you take damage and these are applied for you: resistance halves, vulnerability doubles, immunity takes none (5e SRD 5.1 p. 97).
        A condition you are immune to can still be marked, and does nothing. Tap one of your own to remove it; the others come from a feature, an item or a condition.
      </p>
    </section>
  );
}
