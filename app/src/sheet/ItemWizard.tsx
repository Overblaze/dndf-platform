// Making an item of your own, one question at a time, so that it works on the sheet: a weapon you
// can attack with, armor that sets your Armor Class, or something with powers and charges.
import {
  ABILITIES, ABILITY_NAMES, CUSTOM_BONUS_TYPES, ITEM_KINDS, ITEM_RARITIES, SKILLS, armorFromItem, bookMagicItems, cite, cleanCustomItem, exactBerries, itemSummary, parseDice, parseWeight, weaponFromItem,
  type Ability, type CustomBonusType, type CustomItem, type InventoryItem, type ItemKind, type RuleEntry,
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

export function ItemWizard({ initial, armory, rules, purse, onSave, onClose }: {
  initial?: InventoryItem; armory: RuleEntry[]; rules: Map<string, RuleEntry>; purse: number;
  /** `pay` is how many berries to take from the purse for it. */
  onSave: (item: InventoryItem, pay: number) => void; onClose: () => void;
}) {
  const [item, setItem] = useState<InventoryItem>(initial ?? { id: crypto.randomUUID(), name: '', qty: 1 });
  const [custom, setCustom] = useState<CustomItem>(initial?.custom ?? { kind: 'weapon' });
  const [step, setStep] = useState<Step>(initial ? 'review' : 'kind');
  const [from, setFrom] = useState('');
  const [bookItem, setBookItem] = useState('');
  const [spell, setSpell] = useState({ name: '', level: 1 });
  const [pay, setPay] = useState(false);
  const [one, setOne] = useState({ what: '', value: '' });
  const magic = useMemo(() => bookMagicItems(rules), [rules]);
  const spellEntries = useMemo(() => [...rules.values()].filter((e) => e.kind === 'spell').sort((a, b) => a.name.localeCompare(b.name)), [rules]);
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
  /** One of the book's magic items as the start: its words and page, rarity, cost and attunement. The numbers are the player's to add. */
  const startFromBook = (id: string) => {
    setBookItem(id);
    const found = magic.find((m) => m.id === id);
    if (!found) return;
    const base = found.kind === 'weapon' && found.base ? armory.find((e) => e.name.toLowerCase() === found.base!.toLowerCase()) : undefined;
    const w = base ? weaponFromItem(base) : null;
    setItem({ ...item, name: found.name, weight: (base ? parseWeight(base.weight) : undefined) ?? item.weight });
    setCustom({
      kind: found.kind, rarity: found.rarity, value: found.value, text: found.text, attune: found.attune || undefined, source: { book: found.book, page: found.page },
      weapon: found.kind === 'weapon' ? (w ? { damage: w.damage, damageType: w.damageType, category: w.category, ranged: w.ranged, finesse: w.finesse, twoHanded: w.twoHanded, heavy: w.heavy } : weapon) : undefined,
      armor: found.kind === 'armor' ? armor : undefined,
    });
  };
  const abilityRows = custom.abilities ?? [];
  const setAbility = (ability: Ability, patch: { set?: number; bonus?: number }) => {
    const now = { ...(abilityRows.find((a) => a.ability === ability) ?? { ability }), ...patch };
    setCustom({ ...custom, abilities: [...abilityRows.filter((a) => a.ability !== ability), ...(now.set !== undefined || now.bonus ? [now] : [])].sort((a, b) => ABILITIES.indexOf(a.ability) - ABILITIES.indexOf(b.ability)) });
  };
  const saveRows = custom.saves ?? [];
  const setSave = (ability: Ability | undefined, value: number) => setCustom({ ...custom, saves: [...saveRows.filter((v) => v.ability !== ability), ...(value ? [{ ...(ability ? { ability } : {}), value }] : [])] });
  const skillRows = custom.skills ?? [];
  const setSkill = (skill: string | undefined, value: number) => setCustom({ ...custom, skills: [...skillRows.filter((v) => v.skill !== skill), ...(value ? [{ ...(skill ? { skill } : {}), value }] : [])] });
  const addSpell = () => {
    const name = spell.name.trim();
    if (!name) return;
    const entry = spellEntries.find((e) => e.name.toLowerCase() === name.toLowerCase());
    setCustom({ ...custom, spells: [...(custom.spells ?? []), { name: entry?.name ?? name, level: entry && typeof entry.level === 'number' ? entry.level : spell.level, ...(entry ? { entry: entry.id } : {}) }] });
    setSpell({ name: '', level: 1 });
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
  const finish = (useNow: boolean) => onSave({ ...item, name, custom: built, equipped: useNow ? true : item.equipped }, pay && built.value ? built.value : 0);
  const usable = kind !== 'gear';

  return (
    <Dialog title={initial ? `Change ${initial.name}` : 'Make an item'} onClose={onClose}>
      <p className="page-ref" aria-live="polite">Step {at + 1} of {steps.length} · {STEP_NAMES[step]}</p>

      {step === 'kind' && magic.length > 0 && !initial && (
        <label className="field">
          <span className="label">Start from a magic item in the book (optional)</span>
          <select value={bookItem} onChange={(e) => startFromBook(e.target.value)}>
            <option value="">No, something of my own</option>
            {[...new Set(magic.map((m) => m.chapter))].map((chapter) => (
              <optgroup key={chapter} label={chapter}>
                {magic.filter((m) => m.chapter === chapter).map((m) => <option key={m.id} value={m.id}>{m.name} ({[m.rarity, m.attune ? 'attunement' : ''].filter(Boolean).join(', ')})</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {step === 'kind' && bookItem && <p className="page-ref">The book’s words for it are filled in, with its rarity, cost and page. The book gives its powers as text, so add the numbers it should change on the next steps.</p>}
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
          <label className="field"><span className="label">{custom.source ? `What it is and does · ${cite(custom.source.book, custom.source.page)}` : 'What it is and does, in your words'}</span><textarea rows={custom.source ? 8 : 4} value={custom.text ?? ''} onChange={(e) => setCustom({ ...custom, text: e.target.value || undefined })} maxLength={6000} /></label>
          {kind !== 'gear' && <label className="check"><input type="checkbox" checked={custom.attune === true} onChange={(e) => setCustom({ ...custom, attune: e.target.checked || undefined })} /> It requires attunement (it only works once you have attuned to it)</label>}
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
            <legend className="label">Ability scores it changes while you use it</legend>
            {ABILITIES.map((a) => {
              const row = abilityRows.find((r) => r.ability === a);
              return (
                <div key={a} className="grid-3">
                  <span className="label ability-row">{ABILITY_NAMES[a]}</span>
                  <label className="field"><span className="label">Becomes</span><input type="number" inputMode="numeric" min={1} max={30} value={row?.set ?? ''} placeholder="—" aria-label={`${ABILITY_NAMES[a]} becomes`} onChange={(e) => setAbility(a, { set: whole(e.target.value) })} /></label>
                  <label className="field"><span className="label">Or goes up by</span><input type="number" inputMode="numeric" min={-20} max={20} value={row?.bonus || ''} placeholder="0" aria-label={`${ABILITY_NAMES[a]} goes up by`} onChange={(e) => setAbility(a, { bonus: whole(e.target.value) || undefined })} /></label>
                </div>
              );
            })}
            <p className="page-ref">“Becomes 19” does nothing for a score already 19 or higher, like a Headband of Intellect. “Goes up by” stops at 30.</p>
          </fieldset>
          <fieldset>
            <legend className="label">Saving throws and skills</legend>
            <div className="grid-2">
              <label className="field"><span className="label">Every saving throw</span><input type="number" inputMode="numeric" value={saveRows.find((v) => !v.ability)?.value || ''} placeholder="0" onChange={(e) => setSave(undefined, whole(e.target.value) ?? 0)} /></label>
              <label className="field"><span className="label">Every skill check</span><input type="number" inputMode="numeric" value={skillRows.find((v) => !v.skill)?.value || ''} placeholder="0" onChange={(e) => setSkill(undefined, whole(e.target.value) ?? 0)} /></label>
            </div>
            {saveRows.filter((v) => v.ability).map((v) => (
              <div key={v.ability} className="row wrap"><span>{ABILITY_NAMES[v.ability!]} saves {v.value >= 0 ? '+' : ''}{v.value}</span><button className="btn" onClick={() => setSave(v.ability, 0)} aria-label={`Remove the ${ABILITY_NAMES[v.ability!]} save bonus`}>Remove</button></div>
            ))}
            {skillRows.filter((v) => v.skill).map((v) => (
              <div key={v.skill} className="row wrap"><span>{SKILLS.find((k) => k.id === v.skill)?.name} {v.value >= 0 ? '+' : ''}{v.value}</span><button className="btn" onClick={() => setSkill(v.skill, 0)} aria-label={`Remove the ${SKILLS.find((k) => k.id === v.skill)?.name} bonus`}>Remove</button></div>
            ))}
            <div className="grid-2">
              <label className="field">
                <span className="label">One saving throw or skill</span>
                <select value={one.what} onChange={(e) => setOne({ ...one, what: e.target.value })}>
                  <option value="">Choose…</option>
                  <optgroup label="Saving throws">{ABILITIES.map((a) => <option key={a} value={`save:${a}`}>{ABILITY_NAMES[a]} save</option>)}</optgroup>
                  <optgroup label="Skills">{SKILLS.map((k) => <option key={k.id} value={`skill:${k.id}`}>{k.name}</option>)}</optgroup>
                </select>
              </label>
              <label className="field"><span className="label">Bonus</span><input type="number" inputMode="numeric" value={one.value} onChange={(e) => setOne({ ...one, value: e.target.value })} placeholder="2" /></label>
            </div>
            <button className="btn" disabled={!one.what || !whole(one.value)} onClick={() => { const [what, id] = one.what.split(':'); if (what === 'save') setSave(id as Ability, whole(one.value) ?? 0); else setSkill(id, whole(one.value) ?? 0); setOne({ what: '', value: '' }); }}>Add that bonus</button>
          </fieldset>
          <fieldset>
            <legend className="label">Spells it lets you cast</legend>
            {(custom.spells ?? []).map((x, i) => (
              <div key={i} className="row wrap"><span>{x.name} ({x.level === 0 ? 'cantrip' : `level ${x.level}`}){x.entry ? '' : ' · your own'}</span><button className="btn" onClick={() => setCustom({ ...custom, spells: custom.spells!.filter((_, j) => j !== i) })} aria-label={`Remove the spell ${x.name}`}>Remove</button></div>
            ))}
            <div className="grid-2">
              <label className="field">
                <span className="label">Spell</span>
                <input value={spell.name} onChange={(e) => setSpell({ ...spell, name: e.target.value })} list="item-spells" placeholder="Fireball" maxLength={80} />
                <datalist id="item-spells">{spellEntries.map((e) => <option key={e.id} value={e.name} />)}</datalist>
              </label>
              <label className="field">
                <span className="label">Level (0 = cantrip)</span>
                <input type="number" inputMode="numeric" min={0} max={9} value={spell.level} onChange={(e) => setSpell({ ...spell, level: Math.max(0, Math.min(9, whole(e.target.value) ?? 0)) })} />
              </label>
            </div>
            <button className="btn" disabled={!spell.name.trim() || (custom.spells?.length ?? 0) >= 20} onClick={addSpell}>Add the spell</button>
            <p className="page-ref">They show on the Spells tab while the item is in use, and count against no class. A spell in the Library brings its text and level; anything else is listed by name. If casting costs charges, spend them on the item’s tracker.</p>
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
            {built.attune && <li>It requires attunement: it does nothing until it is both in use and attuned. Attuning takes one of your attunement slots.</li>}
            {built.abilities?.map((a) => <li key={a.ability}>In use, your {ABILITY_NAMES[a.ability]} {[a.bonus ? `goes up by ${a.bonus}` : '', a.set !== undefined ? `becomes ${a.set} if it is lower` : ''].filter(Boolean).join(', then ')}; the modifier, saves, skills and everything else that uses it follow.</li>)}
            {built.bonuses?.length || built.saves?.length || built.skills?.length ? <li>In use, its numbers are added to your totals, each with a line in the breakdown.</li> : null}
            {built.spells?.length ? <li>In use, {built.spells.map((x) => x.name).join(', ')} {built.spells.length === 1 ? 'is' : 'are'} on your Spells tab.</li> : null}
            {built.uses && <li>It gets a tracker of {built.uses.max} charge{built.uses.max === 1 ? '' : 's'} on the Features tab, back on a {built.uses.recharge} rest.</li>}
            {built.rolls?.length ? <li>It gets a roll button for each of its dice on the Features tab.</li> : null}
            {kind === 'consumable' && <li>When you use one up, tap − on the Gear tab to take it off the count.</li>}
            {!usable && <li>Plain gear: it is carried and weighed, and does nothing else.</li>}
            {built.value && initial ? <li>Worth {exactBerries(built.value)}.</li> : null}
          </ul>
          {built.source && <p className="page-ref">Started from {name} · {cite(built.source.book, built.source.page)}. The numbers above are yours.</p>}
          {built.value && !initial ? (
            <label className="check">
              <input type="checkbox" checked={pay} onChange={(e) => setPay(e.target.checked)} /> Take its worth, {exactBerries(built.value)}, from my berries (I have {exactBerries(purse)}){pay && built.value > purse ? ' — more than you have; you can still do it' : ''}
            </label>
          ) : null}
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
