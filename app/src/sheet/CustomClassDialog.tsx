import { ABILITIES, ABILITY_NAMES, STANDARD_ASI_LEVELS, type Ability, type CustomClass, type CustomClassFeature } from '@dndf/engine';
import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { CustomFeatureDialog } from './CustomFeatures';

const ARMOR = [['light', 'Light armor'], ['medium', 'Medium armor'], ['heavy', 'Heavy armor'], ['shields', 'Shields']] as const;
const WEAPON_GROUPS = [['simple', 'Simple weapons'], ['martial', 'Martial weapons']] as const;
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const list = (text: string) => text.split(',').map((part) => part.trim()).filter(Boolean);
export const blankClass = (): CustomClass => ({ id: crypto.randomUUID().slice(0, 8), name: '', hitDie: 8, savingThrows: [], armor: [], weapons: ['simple'], tools: [], asiLevels: [...STANDARD_ASI_LEVELS], features: [] });

/** Write a class of your own: what it is good at, and what it gains at each level. */
export function CustomClassDialog({ initial, inUse, onSave, onDelete, onClose }: { initial?: CustomClass; inUse: boolean; onSave: (cls: CustomClass) => void; onDelete?: () => void; onClose: () => void }) {
  const [c, setC] = useState<CustomClass>(initial ?? blankClass());
  const [editing, setEditing] = useState<CustomClassFeature | 'new' | null>(null);
  const [otherWeapons, setOtherWeapons] = useState(c.weapons.filter((w) => w !== 'simple' && w !== 'martial').map((w) => w.replace(/_/g, ' ')).join(', '));
  const [tools, setTools] = useState(c.tools.join(', '));
  const [asi, setAsi] = useState(c.asiLevels.join(', '));
  const flip = <T extends string>(values: T[], value: T): T[] => (values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  const groups = c.weapons.filter((w) => w === 'simple' || w === 'martial');
  const features = [...c.features].sort((a, b) => a.level - b.level);
  const saveFeature = (feature: CustomClassFeature) => {
    const exists = c.features.some((f) => f.id === feature.id);
    setC({ ...c, features: exists ? c.features.map((f) => (f.id === feature.id ? feature : f)) : [...c.features, feature] });
    setEditing(null);
  };
  const save = () => onSave({
    ...c,
    name: c.name.trim() || 'Custom class',
    weapons: [...groups, ...list(otherWeapons).map(slug)],
    tools: list(tools),
    asiLevels: [...new Set(list(asi).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 20))].sort((a, b) => a - b),
  });

  return (
    <Dialog title={initial ? 'Edit your class' : 'Write a custom class'} onClose={onClose}>
      <div className="grid-2">
        <label className="field">
          <span className="label">Class name</span>
          <input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Navigator" />
        </label>
        <label className="field">
          <span className="label">Hit die</span>
          <select value={c.hitDie} onChange={(e) => setC({ ...c, hitDie: Number(e.target.value) as CustomClass['hitDie'] })}>
            {[6, 8, 10, 12].map((d) => <option key={d} value={d}>d{d} (average {d / 2 + 1} a level)</option>)}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="label">Saving throw proficiencies: {c.savingThrows.length}</legend>
        <div className="grid-checks">
          {ABILITIES.map((a) => (
            <label key={a} className="check">
              <input type="checkbox" checked={c.savingThrows.includes(a)} onChange={() => setC({ ...c, savingThrows: flip<Ability>(c.savingThrows, a) })} />
              <span>{ABILITY_NAMES[a]}</span>
            </label>
          ))}
        </div>
        {c.savingThrows.length !== 2 && <p className="page-ref">Handbook classes have two. It's your call.</p>}
      </fieldset>
      <fieldset>
        <legend className="label">Armor and weapons</legend>
        <div className="grid-checks">
          {ARMOR.map(([id, label]) => (
            <label key={id} className="check">
              <input type="checkbox" checked={c.armor.includes(id)} onChange={() => setC({ ...c, armor: flip(c.armor, id) })} />
              <span>{label}</span>
            </label>
          ))}
          {WEAPON_GROUPS.map(([id, label]) => (
            <label key={id} className="check">
              <input type="checkbox" checked={groups.includes(id)} onChange={() => setC({ ...c, weapons: flip(c.weapons, id) })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <label className="field">
          <span className="label">Other weapons, by name (commas between)</span>
          <input value={otherWeapons} onChange={(e) => setOtherWeapons(e.target.value)} placeholder="rapier, cutlass" />
        </label>
        <label className="field">
          <span className="label">Tools (commas between)</span>
          <input value={tools} onChange={(e) => setTools(e.target.value)} placeholder="Navigator’s tools" />
        </label>
      </fieldset>
      <label className="field">
        <span className="label">Levels that give an Ability Score Improvement</span>
        <input value={asi} onChange={(e) => setAsi(e.target.value)} inputMode="numeric" />
      </label>

      <fieldset>
        <legend className="label">Features by level: {features.length}</legend>
        {features.length === 0 && <p className="page-ref">Nothing yet. A class can be saved empty and filled in as you level.</p>}
        {features.map((f) => (
          <div key={f.id} className="resource">
            <div>
              <div className="resource-name">{f.name || 'Unnamed feature'}</div>
              <div className="page-ref">Level {f.level}{f.uses ? ` · ${f.uses.max} per ${f.uses.recharge} rest` : ''}{f.rolls?.length ? ` · ${f.rolls.map((r) => r.dice).join(', ')}` : ''}</div>
            </div>
            <button type="button" className="btn" onClick={() => setEditing(f)}>Edit</button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setEditing('new')}>Add a feature</button>
      </fieldset>

      {inUse && onDelete && <p className="page-ref">This character has levels in this class, so it can't be deleted here. Take the levels out in the form first.</p>}
      <div className="row wrap dialog-actions">
        {onDelete && <button type="button" className="btn btn-damage" onClick={onDelete} disabled={inUse}>Delete</button>}
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save}>{initial ? 'Save class' : 'Add class'}</button>
      </div>

      {editing && (
        <CustomFeatureDialog
          withLevel
          initial={editing === 'new' ? undefined : editing}
          onSave={(feature) => saveFeature({ ...feature, level: (feature as CustomClassFeature).level ?? 1 })}
          onDelete={editing === 'new' ? undefined : () => { setC({ ...c, features: c.features.filter((f) => f.id !== editing.id) }); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </Dialog>
  );
}
