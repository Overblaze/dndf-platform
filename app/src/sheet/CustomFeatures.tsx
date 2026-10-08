import { CUSTOM_BONUS_TYPES, parseDice, type BorrowedFeature, type CustomBonusType, type CustomFeature, type FeatureDef, type OptionDef, type RuleEntry } from '@dndf/engine';
import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { ruleSet } from '../lib/rules';
import type { LiveCharacter } from '../lib/useCharacter';

const BONUS_LABELS: Record<CustomBonusType, string> = { ac: 'Armor Class', speed: 'Speed (ft.)', initiative: 'Initiative', hp: 'Hit point maximum', attack: 'Attack rolls', damage: 'Damage rolls' };
const ROLL_KINDS = [['damage', 'Damage'], ['heal', 'Healing'], ['tempHp', 'Temporary hit points'], ['other', 'Something else']] as const;
type Roll = NonNullable<CustomFeature['rolls']>[number];
const blank = (): CustomFeature => ({ id: crypto.randomUUID(), name: '', text: '' });
const diceProblem = (dice: string): string | null => {
  try { parseDice(dice); return null; } catch { return `"${dice}" is not dice the app can roll. Write it like 2d6 + 3.`; }
};

/** Write or change one of the player's own features. */
export function CustomFeatureDialog({ initial, withLevel, onSave, onDelete, onClose }: { initial?: CustomFeature & { level?: number }; withLevel?: boolean; onSave: (feature: CustomFeature & { level?: number }) => void; onDelete?: () => void; onClose: () => void }) {
  const [f, setF] = useState<CustomFeature & { level?: number }>(initial ?? { ...blank(), ...(withLevel ? { level: 1 } : {}) });
  const bonus = (type: CustomBonusType) => f.bonuses?.find((b) => b.type === type)?.value ?? 0;
  const setBonus = (type: CustomBonusType, value: number) =>
    setF({ ...f, bonuses: [...(f.bonuses ?? []).filter((b) => b.type !== type), ...(value ? [{ type, value }] : [])] });
  const rolls = f.rolls ?? [];
  const setRoll = (i: number, patch: Partial<Roll>) => setF({ ...f, rolls: rolls.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const problems = rolls.map((r) => diceProblem(r.dice)).filter((p): p is string => p !== null);
  const hasNumbers = (f.bonuses ?? []).length > 0 || Boolean(f.note);
  const save = () => onSave({ ...f, name: f.name.trim() || 'Custom feature', rolls: rolls.filter((r) => r.dice.trim() && !diceProblem(r.dice)).map((r) => ({ ...r, label: r.label.trim() || r.dice })) });

  return (
    <Dialog title={initial ? 'Edit your feature' : 'Add your own feature'} onClose={onClose}>
      <label className="field">
        <span className="label">Name</span>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Sea Legs" />
      </label>
      {withLevel && (
        <label className="field">
          <span className="label">Gained at class level</span>
          <input type="number" inputMode="numeric" min={1} max={20} value={f.level ?? 1} onChange={(e) => setF({ ...f, level: Math.max(1, Math.min(20, Math.round(Number(e.target.value)) || 1)) })} />
        </label>
      )}
      <label className="field">
        <span className="label">What it does, in your words</span>
        <textarea rows={4} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
      </label>
      <label className="field">
        <span className="label">Where it comes from (optional)</span>
        <input value={f.origin ?? ''} onChange={(e) => setF({ ...f, origin: e.target.value || undefined })} placeholder="DM boon, session 12" />
      </label>
      <label className="field">
        <span className="label">Uses</span>
        <select value={f.action ?? ''} onChange={(e) => setF({ ...f, action: (e.target.value || undefined) as CustomFeature['action'] })} aria-label="What it takes to use">
          <option value="">No action, or always on</option>
          <option value="action">An action</option>
          <option value="bonus">A bonus action</option>
          <option value="reaction">A reaction</option>
        </select>
      </label>

      <fieldset>
        <legend className="label">Limited uses</legend>
        <div className="grid-2">
          <label className="field">
            <span className="label">How many (0 = no limit)</span>
            <input type="number" inputMode="numeric" min={0} max={99} value={f.uses?.max ?? 0}
              onChange={(e) => { const max = Math.max(0, Math.min(99, Math.round(Number(e.target.value)) || 0)); setF({ ...f, uses: max ? { max, recharge: f.uses?.recharge ?? 'long' } : undefined }); }} />
          </label>
          <label className="field">
            <span className="label">Back after</span>
            <select value={f.uses?.recharge ?? 'long'} disabled={!f.uses} onChange={(e) => f.uses && setF({ ...f, uses: { ...f.uses, recharge: e.target.value as 'short' | 'long' } })}>
              <option value="short">A short or long rest</option>
              <option value="long">A long rest</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Dice to roll</legend>
        {rolls.map((r, i) => (
          <div key={i} className="weapon-edit">
            <div className="grid-2">
              <label className="field"><span className="label">Button label</span><input value={r.label} onChange={(e) => setRoll(i, { label: e.target.value })} placeholder="Fire damage" /></label>
              <label className="field"><span className="label">Dice</span><input value={r.dice} onChange={(e) => setRoll(i, { dice: e.target.value })} placeholder="2d6 + 3" /></label>
            </div>
            <label className="field">
              <span className="label">It is</span>
              <select value={r.kind} onChange={(e) => setRoll(i, { kind: e.target.value as Roll['kind'] })}>{ROLL_KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
            </label>
            <button type="button" className="btn" onClick={() => setF({ ...f, rolls: rolls.filter((_, j) => j !== i) })}>Remove this roll</button>
          </div>
        ))}
        {problems.map((p) => <p key={p} className="notice">{p} It will be left out until it is.</p>)}
        <button type="button" className="btn" onClick={() => setF({ ...f, rolls: [...rolls, { label: '', dice: '', kind: 'damage' }] })}>Add a roll</button>
      </fieldset>

      <fieldset>
        <legend className="label">Numbers it changes</legend>
        <div className="grid-2">
          {CUSTOM_BONUS_TYPES.map((type) => (
            <label key={type} className="field">
              <span className="label">{BONUS_LABELS[type]}</span>
              <input type="number" inputMode="numeric" value={bonus(type)} onChange={(e) => setBonus(type, Math.round(Number(e.target.value)) || 0)} />
            </label>
          ))}
        </div>
        <label className="field">
          <span className="label">A standing line for “In effect” (optional)</span>
          <input value={f.note ?? ''} onChange={(e) => setF({ ...f, note: e.target.value || undefined })} placeholder="Resistance to cold damage" />
        </label>
        <label className="check">
          <input type="checkbox" checked={Boolean(f.switched)} disabled={!hasNumbers} onChange={(e) => setF({ ...f, switched: e.target.checked || undefined })} />
          <span>Only while switched on (adds a switch to the Combat tab)</span>
        </label>
        <p className="page-ref">Every number shows in its breakdown under this feature’s name, and can still be overridden.</p>
      </fieldset>

      <div className="row wrap dialog-actions">
        {onDelete && <button type="button" className="btn btn-damage" onClick={onDelete}>Delete</button>}
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save}>{initial ? 'Save' : 'Add feature'}</button>
      </div>
    </Dialog>
  );
}

/** Take a feature from anywhere in the handbook onto this character. */
export function BorrowFeatureDialog({ live, onClose }: { live: LiveCharacter; onClose: () => void }) {
  const { doc, sheet } = live;
  const { classes, subclassesOf, optionGroupsOf } = ruleSet(doc.rulesVersion);
  const [classId, setClassId] = useState(classes[0]!.id);
  const places: RuleEntry[] = [classes.find((c) => c.id === classId)!, ...subclassesOf(classId), ...optionGroupsOf(classId.slice(6))];
  const [entryId, setEntryId] = useState(classId);
  const entry = places.find((p) => p.id === entryId) ?? places[0]!;
  const list = ((entry.features ?? entry.options ?? []) as (FeatureDef | OptionDef)[]);
  const [name, setName] = useState('');
  const held = new Set(sheet.features.map((f) => f.key));
  const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const chosen = list.find((f) => f.name === name);
  const add = () => {
    const next: BorrowedFeature[] = [...(doc.borrowedFeatures ?? []), { entry: entry.id, name }];
    live.setDoc({ ...doc, borrowedFeatures: next }, `Borrowed ${name} from ${entry.name}`);
    onClose();
  };
  return (
    <Dialog title="Borrow a feature" onClose={onClose}>
      <p className="page-ref">Any feature in this handbook, whatever your class. It brings its own uses, and the pool it spends if you don’t have one. Numbers that grow by level read your whole character level.</p>
      <label className="field">
        <span className="label">Class</span>
        <select value={classId} onChange={(e) => { setClassId(e.target.value); setEntryId(e.target.value); setName(''); }}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="label">From</span>
        <select value={entry.id} onChange={(e) => { setEntryId(e.target.value); setName(''); }}>
          {places.map((p) => <option key={p.id} value={p.id}>{p.kind === 'class' ? `${p.name}: class features` : p.kind === 'subclass' ? `Subclass: ${p.name}` : `Options: ${p.name}`}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="label">Feature</span>
        <select value={name} onChange={(e) => setName(e.target.value)}>
          <option value="">Choose one…</option>
          {list.map((f) => {
            const mine = held.has(`${entry.id}/${slug(f.name)}`) || held.has(`${entry.id}/${(f as OptionDef).id}`);
            return <option key={f.name} value={f.name} disabled={mine}>{typeof f.level === 'number' ? `${f.level}: ` : ''}{f.name}{mine ? ' (you have it)' : ''}</option>;
          })}
        </select>
      </label>
      {chosen && <p className="feature-text">{chosen.text.length > 420 ? `${chosen.text.slice(0, 420)}…` : chosen.text}</p>}
      <div className="row wrap dialog-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={add} disabled={!chosen}>Borrow it</button>
      </div>
    </Dialog>
  );
}
