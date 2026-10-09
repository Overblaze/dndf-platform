// Making an item of your own, one question at a time, so that it works on the sheet: a weapon you
// can attack with, armor that sets your Armor Class, or something with powers and charges.
import {
  CUSTOM_BONUS_TYPES, ITEM_KINDS, ITEM_RARITIES, armorFromItem, cleanCustomItem, exactBerries, itemSummary, parseDice, parseWeight, weaponFromItem,
  type CustomBonusType, type CustomItem, type InventoryItem, type ItemKind, type RuleEntry,
} from '@dndf/engine';
import { useMemo, useState } from 'react';
import { Dialog } from '../components/Dialog';

const KINDS: Record<ItemKind, { name: string; what: string }> = {
  weapon: { name: 'A weapon', what: 'Shows under Attacks with its own to-hit and damage.' },
  armor: { name: 'Armor', what: 'Sets your Armor Class while you wear it.' },
  shield: { name: 'A shield', what: '+2 Armor Class while you carry it.' },
  wondrous: { name: 'Something with powers', what: 'A ring, a cloak, a Dial: bonuses, charges, dice to roll.' },
  consumable: { name: 'Something you use up', what: 'A potion, a Rumble Ball: dice to roll, then one fewer.' },
  gear: { name: 'Plain gear', what: 'Just a thing you carry. Name, count, weight.' },
};
const BONUS_LABELS: Record<CustomBonusType, string> = { ac: 'Armor Class', speed: 'Speed (ft.)', initiative: 'Initiative', hp: 'Hit point maximum', attack: 'Every attack roll', damage: 'Every damage roll' };
const ROLL_KINDS = [['damage', 'Damage'], ['heal', 'Healing'], ['tempHp', 'Temporary hit points'], ['other', 'Something else']] as const;
const DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'necrotic', 'radiant', 'psychic', 'force'];
type Roll = NonNullable<CustomItem['rolls']>[number];
const STEPS = ['kind', 'basics', 'stats', 'powers', 'review'] as const;
type Step = (typeof STEPS)[number];
const STEP_NAMES: Record<Step, string> = { kind: 'What is it?', basics: 'The basics', stats: 'How it fights or protects', powers: 'Its powers', review: 'Check it over' };

const whole = (raw: string) => { const n = Math.round(Number(raw)); return raw.trim() !== '' && Number.isFinite(n) ? n : undefined; };
const diceProblem = (dice: string): string | null => { try { parseDice(dice); return null; } catch { return `“${dice}” is not dice the app can roll. Write it like 2d6 + 3.`; } };

export function ItemWizard({ initial, armory, onSave, onClose }: { initial?: InventoryItem; armory: RuleEntry[]; onSave: (item: InventoryItem, useNow: boolean) => void; onClose: () => void }) {
  const [item, setItem] = useState<InventoryItem>(initial ?? { id: crypto.randomUUID(), name: '', qty: 1 });
  const [custom, setCustom] = useState<CustomItem>(initial?.custom ?? { kind: 'weapon' });
  const [step, setStep] = useState<Step>(initial ? 'review' : 'kind');
  const [from, setFrom] = useState('');
  const kind = custom.kind;
  // Plain gear has nothing to fight with and no powers; everything else may have powers.
  const steps = STEPS.filter((s) => (s === 'stats' ? kind === 'weapon' || kind === 'armor' : s === 'powers' ? kind !== 'gear' : true));
  const at = steps.indexOf(step);
  const weapon = custom.weapon ?? { damage: '1d6', damageType: 'slashing', category: 'simple' as const };
  const armor = custom.armor ?? { base: 11, dexCap: null };
  const rolls = custom.rolls ?? [];
  const bookItems = useMemo(() => armory.filter((e) => (kind === 'weapon' ? weaponFromItem(e) : kind === 'armor' ? armorFromItem(e) : null)).sort((a, b) => a.name.localeCompare(b.name)), [armory, kind]);

  const bonus = (type: CustomBonusType) => custom.bonuses?.find((b) => b.type === type)?.value ?? 0;
  const setBonus = (type: CustomBonusType, value: number) => setCustom({ ...custom, bonuses: [...(custom.bonuses ?? []).filter((b) => b.type !== type), ...(value ? [{ type, value }] : [])] });
  const setRoll = (i: number, patch: Partial<Roll>) => setCustom({ ...custom, rolls: rolls.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const pickKind = (next: ItemKind) => {
    setFrom('');
    setCustom({ ...custom, kind: next, weapon: next === 'weapon' ? weapon : undefined, armor: next === 'armor' ? armor : undefined });
  };
  const startFrom = (id: string) => {
    setFrom(id);
    const entry = armory.find((e) => e.id === id);
    if (!entry) return;
    const w = weaponFromItem(entry);
    const a = armorFromItem(entry);
    setItem({ ...item, name: item.name.trim() ? item.name : entry.name, weight: parseWeight(entry.weight) ?? item.weight });
    if (w) setCustom({ ...custom, weapon: { damage: w.damage, damageType: w.damageType, category: w.category, ranged: w.ranged, finesse: w.finesse, twoHanded: w.twoHanded, heavy: w.heavy, bonus: custom.weapon?.bonus } });
    if (a) setCustom({ ...custom, armor: { base: a.base, dexCap: a.dexCap ?? null } });
  };

  const damageBad = kind === 'weapon' && !/^\d*d\d+$/.test(weapon.damage.trim());
  const rollProblems = rolls.filter((r) => r.dice.trim()).map((r) => diceProblem(r.dice)).filter((p): p is string => p !== null);
  // What will be saved: checked by the same rules as everything read back from a save.
  const built = cleanCustomItem({ ...custom, weapon: kind === 'weapon' ? weapon : undefined, armor: kind === 'armor' ? armor : undefined, rolls: rolls.filter((r) => r.dice.trim()) }) ?? { kind };
  const name = item.name.trim() || KINDS[kind].name.replace(/^An? /, '').replace(/^\w/, (c) => c.toUpperCase());
  const finish = (useNow: boolean) => onSave({ ...item, name, custom: built, equipped: useNow ? true : item.equipped }, useNow);
  const usable = kind !== 'gear';

  return (
    <Dialog title={initial ? `Change ${initial.name}` : 'Make an item'} onClose={onClose}>
      <p className="page-ref" aria-live="polite">Step {at + 1} of {steps.length} · {STEP_NAMES[step]}</p>

      {step === 'kind' && (
        <div className="choice-list" role="radiogroup" aria-label="What kind of item">
          {ITEM_KINDS.map((k) => (
            <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'btn btn-primary choice' : 'btn choice'} onClick={() => pickKind(k)}>
              <span className="resource-name">{KINDS[k].name}</span>
              <span className="page-ref">{KINDS[k].what}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'basics' && (
        <>
          <label className="field"><span className="label">Name</span><input value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} placeholder={kind === 'weapon' ? 'Wado Ichimonji' : kind === 'armor' ? 'Sea-king hide coat' : 'Tone Dial'} maxLength={80} /></label>
          <div className="grid-2">
            <label className="field"><span className="label">How many</span><input type="number" inputMode="numeric" min={0} value={item.qty} onChange={(e) => setItem({ ...item, qty: Math.max(0, whole(e.target.value) ?? 0) })} /></label>
            <label className="field"><span className="label">Weight of one (lb)</span><input type="number" inputMode="decimal" min={0} step="any" value={item.weight ?? ''} onChange={(e) => setItem({ ...item, weight: e.target.value.trim() === '' || !(Number(e.target.value) >= 0) ? undefined : Number(e.target.value) })} /></label>
            <label className="field">
              <span className="label">Rarity (optional)</span>
              <select value={custom.rarity ?? ''} onChange={(e) => setCustom({ ...custom, rarity: e.target.value || undefined })}>
                <option value="">Not said</option>
                {ITEM_RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Worth (฿, optional)</span><input type="number" inputMode="numeric" min={0} value={custom.value ?? ''} onChange={(e) => setCustom({ ...custom, value: whole(e.target.value) })} /></label>
          </div>
          <label className="field"><span className="label">What it is and does, in your words</span><textarea rows={4} value={custom.text ?? ''} onChange={(e) => setCustom({ ...custom, text: e.target.value || undefined })} maxLength={6000} /></label>
        </>
      )}

      {step === 'stats' && kind === 'weapon' && (
        <>
          <label className="field">
            <span className="label">Start from a weapon in the book (optional)</span>
            <select value={from} onChange={(e) => startFrom(e.target.value)}>
              <option value="">No, I’ll fill it in</option>
              {bookItems.map((e) => <option key={e.id} value={e.id}>{e.name} ({String(e.damage)} {String(e.damageType ?? '')})</option>)}
            </select>
          </label>
          <div className="grid-2">
            <label className="field"><span className="label">Damage dice</span><input value={weapon.damage} onChange={(e) => setCustom({ ...custom, weapon: { ...weapon, damage: e.target.value } })} placeholder="1d8" maxLength={8} autoCapitalize="none" /></label>
            <label className="field">
              <span className="label">Damage type</span>
              <input value={weapon.damageType} onChange={(e) => setCustom({ ...custom, weapon: { ...weapon, damageType: e.target.value } })} list="damage-types" maxLength={30} autoCapitalize="none" />
              <datalist id="damage-types">{DAMAGE_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
            </label>
            <label className="field">
              <span className="label">Kind of weapon</span>
              <select value={weapon.category} onChange={(e) => setCustom({ ...custom, weapon: { ...weapon, category: e.target.value as 'simple' | 'martial' } })}>
                <option value="simple">Simple</option>
                <option value="martial">Martial</option>
              </select>
            </label>
            <label className="field"><span className="label">Its own bonus to hit and damage</span><input type="number" inputMode="numeric" min={-10} max={10} value={weapon.bonus ?? 0} onChange={(e) => setCustom({ ...custom, weapon: { ...weapon, bonus: whole(e.target.value) || undefined } })} /></label>
          </div>
          {damageBad && <p className="page-ref held-why">Damage dice are written like 1d8 or 2d6. Your Strength or Dexterity is added for you.</p>}
          <fieldset>
            <legend className="label">It is…</legend>
            {([['ranged', 'Ranged (uses Dexterity)'], ['finesse', 'Finesse (Strength or Dexterity, whichever is better)'], ['twoHanded', 'Two-handed'], ['heavy', 'Heavy']] as const).map(([key, label]) => (
              <label key={key} className="check"><input type="checkbox" checked={weapon[key] === true} onChange={(e) => setCustom({ ...custom, weapon: { ...weapon, [key]: e.target.checked || undefined } })} /> {label}</label>
            ))}
          </fieldset>
        </>
      )}

      {step === 'stats' && kind === 'armor' && (
        <>
          <label className="field">
            <span className="label">Start from armor in the book (optional)</span>
            <select value={from} onChange={(e) => startFrom(e.target.value)}>
              <option value="">No, I’ll fill it in</option>
              {bookItems.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <div className="grid-2">
            <label className="field"><span className="label">Base Armor Class</span><input type="number" inputMode="numeric" min={0} max={40} value={armor.base} onChange={(e) => setCustom({ ...custom, armor: { ...armor, base: whole(e.target.value) ?? 0 } })} /></label>
            <label className="field">
              <span className="label">Dexterity added</span>
              <select value={armor.dexCap === null || armor.dexCap === undefined ? 'full' : armor.dexCap === 0 ? 'none' : 'max2'} onChange={(e) => setCustom({ ...custom, armor: { ...armor, dexCap: e.target.value === 'full' ? null : e.target.value === 'none' ? 0 : 2 } })}>
                <option value="full">All of it (light armor)</option>
                <option value="max2">Up to +2 (medium armor)</option>
                <option value="none">None (heavy armor)</option>
              </select>
            </label>
          </div>
          <p className="page-ref">A magic +1 goes on the next step, under “Armor Class”.</p>
        </>
      )}

      {step === 'powers' && (
        <>
          <p className="page-ref">All optional. Leave everything empty for {kind === 'weapon' ? 'an ordinary weapon' : kind === 'armor' ? 'ordinary armor' : kind === 'shield' ? 'an ordinary shield' : 'something that only has a description'}.</p>
          <fieldset>
            <legend className="label">Numbers it adds while you use it</legend>
            <div className="grid-2">
              {CUSTOM_BONUS_TYPES.map((type) => (
                <label key={type} className="field"><span className="label">{BONUS_LABELS[type]}</span><input type="number" inputMode="numeric" value={bonus(type) || ''} placeholder="0" onChange={(e) => setBonus(type, whole(e.target.value) ?? 0)} /></label>
              ))}
            </div>
            {kind === 'shield' && <p className="page-ref">The shield’s own +2 is already counted. Put only what it adds beyond that.</p>}
          </fieldset>
          <fieldset>
            <legend className="label">Charges</legend>
            <div className="grid-2">
              <label className="field"><span className="label">How many (blank = none)</span><input type="number" inputMode="numeric" min={0} value={custom.uses?.max ?? ''} onChange={(e) => { const max = whole(e.target.value); setCustom({ ...custom, uses: max && max > 0 ? { max, recharge: custom.uses?.recharge ?? 'long' } : undefined }); }} /></label>
              <label className="field">
                <span className="label">They come back on a</span>
                <select value={custom.uses?.recharge ?? 'long'} disabled={!custom.uses} onChange={(e) => custom.uses && setCustom({ ...custom, uses: { ...custom.uses, recharge: e.target.value as 'short' | 'long' } })}>
                  <option value="long">Long rest</option>
                  <option value="short">Short rest</option>
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">Dice it rolls</legend>
            {rolls.map((r, i) => (
              <div key={i} className="grid-3">
                <label className="field"><span className="label">Called</span><input value={r.label} onChange={(e) => setRoll(i, { label: e.target.value })} placeholder="Tidal lash" maxLength={60} /></label>
                <label className="field"><span className="label">Dice</span><input value={r.dice} onChange={(e) => setRoll(i, { dice: e.target.value })} placeholder="2d6 + 3" maxLength={30} autoCapitalize="none" /></label>
                <label className="field">
                  <span className="label">It is</span>
                  <select value={r.kind} onChange={(e) => setRoll(i, { kind: e.target.value as Roll['kind'] })}>{ROLL_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                </label>
                <button className="btn" onClick={() => setCustom({ ...custom, rolls: rolls.filter((_, j) => j !== i) })} aria-label={`Remove the roll ${r.label || i + 1}`}>Remove</button>
              </div>
            ))}
            {rollProblems.map((p) => <p key={p} className="page-ref held-why">{p}</p>)}
            {rolls.length < 8 && <button className="btn" onClick={() => setCustom({ ...custom, rolls: [...rolls, { label: '', dice: '', kind: kind === 'consumable' ? 'heal' : 'damage' }] })}>Add a roll</button>}
          </fieldset>
          <label className="field">
            <span className="label">Using it takes</span>
            <select value={custom.action ?? ''} onChange={(e) => setCustom({ ...custom, action: (e.target.value || undefined) as CustomItem['action'] })}>
              <option value="">No action, or it is always on</option>
              <option value="action">An action</option>
              <option value="bonus">A bonus action</option>
              <option value="reaction">A reaction</option>
            </select>
          </label>
          <label className="field"><span className="label">A standing effect to list under “In effect” (optional)</span><input value={custom.note ?? ''} onChange={(e) => setCustom({ ...custom, note: e.target.value || undefined })} placeholder="Resistance to cold damage" maxLength={200} /></label>
        </>
      )}

      {step === 'review' && (
        <>
          <div className="tracker">
            <div className="resource-name">{name}{item.qty !== 1 ? ` × ${item.qty}` : ''}</div>
            <div className="page-ref">{[itemSummary(built), item.weight !== undefined ? `${item.weight} lb each` : ''].filter(Boolean).join(' · ')}</div>
            {built.text && <p className="feature-text">{built.text}</p>}
          </div>
          <ul className="notes">
            {built.weapon && <li>In use, it is listed under Attacks. Your ability modifier and proficiency are worked out for you.</li>}
            {kind === 'weapon' && !built.weapon && <li className="held-why">Its damage dice can’t be read, so it will not show under Attacks. Go back and write them like 1d8.</li>}
            {built.armor && <li>In use, it sets your Armor Class (replacing other armor on the sheet while it is on).</li>}
            {kind === 'shield' && <li>In use, it adds 2 to your Armor Class{built.bonuses?.some((b) => b.type === 'ac') ? ', and its own bonus on top' : ''}.</li>}
            {built.bonuses?.length ? <li>In use, its numbers are added to your totals, each with a line in the breakdown.</li> : null}
            {built.uses && <li>It gets a tracker of {built.uses.max} charge{built.uses.max === 1 ? '' : 's'} on the Features tab, back on a {built.uses.recharge} rest.</li>}
            {built.rolls?.length ? <li>It gets a roll button for each of its dice on the Features tab.</li> : null}
            {kind === 'consumable' && <li>When you use one up, tap − on the Gear tab to take it off the count.</li>}
            {!usable && <li>Plain gear: it is carried and weighed, and does nothing else.</li>}
            {built.value ? <li>Worth {exactBerries(built.value)}. Adding it does not take berries from your purse.</li> : null}
          </ul>
        </>
      )}

      <div className="row wrap">
        {at > 0 && <button className="btn" onClick={() => setStep(steps[at - 1]!)}>Back</button>}
        {step !== 'review' && <button className="btn btn-primary" onClick={() => setStep(steps[at + 1]!)}>Next</button>}
        {step === 'review' && (
          <>
            <button className="btn btn-primary" onClick={() => finish(false)}>{initial ? 'Save' : 'Add it'}</button>
            {usable && !initial && <button className="btn" onClick={() => finish(true)}>Add it and use it now</button>}
          </>
        )}
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}
