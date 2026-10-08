import { ordinal, parseDice, type CustomSpell } from '@dndf/engine';
import { useState, type ReactNode } from 'react';
import { Dialog } from '../components/Dialog';

const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const SCHOOLS = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation'];
const DICE = /\b\d{1,2}d(?:4|6|8|10|12|100)\b/g;

/** Write or change a spell of your own. Dice named in the text become roll buttons on the sheet. */
export function SpellEditor({ initial, title, extra, onSave, onDelete, onClose }: {
  initial?: CustomSpell;
  title?: string;
  /** Anything to show above the buttons (where it is kept, who it is shared with). */
  extra?: ReactNode;
  onSave: (spell: CustomSpell) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [spell, setSpell] = useState<CustomSpell>(initial ?? { id: crypto.randomUUID(), name: '', level: 1, text: '' });
  const set = (patch: Partial<CustomSpell>) => setSpell({ ...spell, ...patch });
  const text = (key: 'castingTime' | 'range' | 'components' | 'duration', label: string, placeholder: string) => (
    <label className="field">
      <span className="label">{label}</span>
      <input value={spell[key] ?? ''} onChange={(e) => set({ [key]: e.target.value || undefined })} placeholder={placeholder} maxLength={200} />
    </label>
  );
  const dice = [...new Set((spell.text.match(DICE) ?? []).filter((d) => { try { parseDice(d); return true; } catch { return false; } }))].slice(0, 4);
  return (
    <Dialog title={title ?? (initial ? 'Change spell' : 'Write a spell')} onClose={onClose}>
      <label className="field">
        <span className="label">Name</span>
        <input value={spell.name} onChange={(e) => set({ name: e.target.value })} placeholder="Storm Lance" maxLength={120} />
      </label>
      <div className="grid-2">
        <label className="field">
          <span className="label">Level</span>
          <select value={spell.level} onChange={(e) => set({ level: Number(e.target.value) })}>
            {LEVELS.map((l) => <option key={l} value={l}>{l === 0 ? 'Cantrip' : ordinal(l)}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">School (optional)</span>
          <select value={spell.school ?? ''} onChange={(e) => set({ school: e.target.value || undefined })}>
            <option value="">None</option>
            {SCHOOLS.map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
            {spell.school && !SCHOOLS.includes(spell.school) && <option value={spell.school}>{spell.school}</option>}
          </select>
        </label>
      </div>
      <div className="grid-2">
        {text('castingTime', 'Casting time', '1 action')}
        {text('range', 'Range', '60 feet')}
        {text('components', 'Components', 'V, S, M (a pinch of salt)')}
        {text('duration', 'Duration', 'Concentration, up to 1 minute')}
      </div>
      <label className="check">
        <input type="checkbox" checked={spell.ritual === true} onChange={(e) => set({ ritual: e.target.checked || undefined })} />
        <span>Can be cast as a ritual</span>
      </label>
      <label className="field">
        <span className="label">What it does</span>
        <textarea rows={8} value={spell.text} onChange={(e) => set({ text: e.target.value })} placeholder="Write the spell’s effect. Dice such as 3d8 get a roll button." />
      </label>
      <p className="page-ref">{dice.length ? `Roll buttons on the sheet: ${dice.join(', ')}` : 'No dice in the text yet, so no roll button.'}</p>
      {extra}
      {!spell.name.trim() && <p className="page-ref held-why">Give it a name to save it.</p>}
      <div className="row wrap">
        <button className="btn btn-primary" disabled={!spell.name.trim()} onClick={() => onSave({ ...spell, name: spell.name.trim() })}>Save</button>
        <button className="btn" onClick={onClose}>Cancel</button>
        {onDelete && <button className="btn btn-damage" onClick={onDelete}>Delete</button>}
      </div>
    </Dialog>
  );
}
