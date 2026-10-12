import { signed, type CustomBeast, type SheetInfusion } from '@dndf/engine';
import { useState } from 'react';
import { RuleText } from '../components/RuleText';
import { useRolls } from '../lib/rolls';
import type { LiveCharacter } from '../lib/useCharacter';

const blank: CustomBeast = { name: '', ac: 10, hp: 10, speed: '30 ft.', attacks: [{ name: '', toHit: 0, damage: '', type: '' }] };

/** The beast's numbers, typed in from the book the fruit names it in. */
function BeastForm({ start, onSave, onCancel }: { start: CustomBeast; onSave: (beast: CustomBeast) => void; onCancel: () => void }) {
  const [beast, setBeast] = useState<CustomBeast>({ ...start, attacks: start.attacks.length ? start.attacks : blank.attacks });
  const number = (value: string) => (value.trim() === '' || !Number.isFinite(Number(value)) ? 0 : Math.round(Number(value)));
  const setAttack = (i: number, patch: Partial<CustomBeast['attacks'][number]>) => setBeast({ ...beast, attacks: beast.attacks.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <fieldset>
      <legend className="label">The beast’s numbers</legend>
      <p className="page-ref">Copy them from the stat block the fruit names (your DM has the book). They are saved with this character.</p>
      <label className="field"><span className="label">Name</span><input value={beast.name} maxLength={60} onChange={(e) => setBeast({ ...beast, name: e.target.value })} placeholder="What kind of beast" /></label>
      <div className="grid-2">
        <label className="field"><span className="label">Armor Class</span><input type="number" inputMode="numeric" value={beast.ac} onChange={(e) => setBeast({ ...beast, ac: number(e.target.value) })} /></label>
        <label className="field"><span className="label">Hit points</span><input type="number" inputMode="numeric" value={beast.hp} onChange={(e) => setBeast({ ...beast, hp: number(e.target.value) })} /></label>
      </div>
      <label className="field"><span className="label">Speed</span><input value={beast.speed} maxLength={80} onChange={(e) => setBeast({ ...beast, speed: e.target.value })} placeholder="30 ft., swim 30 ft." /></label>
      {beast.attacks.map((attack, i) => (
        <fieldset key={i}>
          <legend className="label">Attack {i + 1}</legend>
          <label className="field"><span className="label">Name</span><input value={attack.name} maxLength={60} onChange={(e) => setAttack(i, { name: e.target.value })} placeholder="Gore, Bite, Claws…" /></label>
          <div className="grid-2">
            <label className="field"><span className="label">To hit</span><input type="number" inputMode="numeric" value={attack.toHit} onChange={(e) => setAttack(i, { toHit: number(e.target.value) })} /></label>
            <label className="field"><span className="label">Damage dice</span><input value={attack.damage} maxLength={30} onChange={(e) => setAttack(i, { damage: e.target.value })} placeholder="2d6 + 4" /></label>
          </div>
          <label className="field"><span className="label">Kind of damage</span><input value={attack.type} maxLength={30} onChange={(e) => setAttack(i, { type: e.target.value })} placeholder="piercing" /></label>
          {beast.attacks.length > 1 && <button type="button" className="btn" onClick={() => setBeast({ ...beast, attacks: beast.attacks.filter((_, j) => j !== i) })}>Remove this attack</button>}
        </fieldset>
      ))}
      <button type="button" className="btn" onClick={() => setBeast({ ...beast, attacks: [...beast.attacks, { name: '', toHit: 0, damage: '', type: '' }] })}>Add another attack</button>
      <label className="field"><span className="label">Traits and anything else (optional)</span><textarea rows={3} value={beast.notes ?? ''} maxLength={2000} onChange={(e) => setBeast({ ...beast, notes: e.target.value })} /></label>
      <div className="row wrap">
        <button type="button" className="btn btn-primary" disabled={!beast.name.trim()} onClick={() => onSave({ ...beast, attacks: beast.attacks.filter((a) => a.name.trim()) })}>Save the beast</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  );
}

/**
 * The beast an infused Zoan weapon turns into (Infused Animal Form): its own Armor Class, hit points and
 * attacks, apart from the character's. Read from the fruit's stat block, or typed in when the fruit names
 * a beast from another book.
 */
export function BeastCard({ live, infusion, onBeast }: { live: LiveCharacter; infusion: SheetInfusion; onBeast: (beast: CustomBeast | undefined, log: string) => void }) {
  const { doc } = live;
  const rolls = useRolls();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const beast = infusion.beast;
  const n = Math.max(0, Math.floor(Number(amount)));
  const ready = amount.trim() !== '' && Number.isFinite(n) && n > 0;

  if (!beast || editing) {
    const start: CustomBeast = beast
      ? { name: beast.name, ac: beast.ac ?? 10, hp: beast.hpMax, speed: beast.speed, attacks: beast.attacks.filter((a) => !a.name.includes('infused weapon')).map((a) => ({ name: a.name, toHit: a.toHit ?? 0, damage: a.damage[0]?.dice ?? '', type: a.damage[0]?.type ?? '' })), notes: beast.traits.map((t) => (t.name === 'Notes' ? t.text : `${t.name}. ${t.text}`)).join('\n') }
      : blank;
    return (
      <div className="beast">
        <h3>Beast companion</h3>
        {!beast && !editing && (
          <>
            <p className="feature-text">As a bonus action the weapon becomes the fruit’s beast, which acts on its own turn after yours. This fruit prints no stat block of its own: it names its beast from another book.</p>
            <button className="btn btn-primary" onClick={() => setEditing(true)}>Enter the beast’s numbers</button>
          </>
        )}
        {editing && <BeastForm start={start} onCancel={() => setEditing(false)} onSave={(typed) => { onBeast(typed, `Beast companion entered: ${typed.name}`); setEditing(false); }} />}
      </div>
    );
  }

  const taken = doc.state.counters[beast.id] ?? 0;
  const hurt = (by: number, log: string) => live.setState({ ...doc.state, counters: { ...doc.state.counters, [beast.id]: Math.min(beast.hpMax, Math.max(0, taken + by)) } }, log);
  const act = (what: 'damage' | 'heal') => {
    const after = what === 'damage' ? Math.max(0, beast.hp - n) : Math.min(beast.hpMax, beast.hp + n);
    hurt(what === 'damage' ? n : -n, `${beast.name} ${what === 'damage' ? 'takes' : 'regains'} ${n}: ${beast.hp} → ${after} hit points`);
    setAmount('');
  };
  const out = () => live.setState({ ...doc.state, toggles: { ...doc.state.toggles, [beast.id]: !beast.out } }, beast.out ? `${beast.name} is a weapon again` : `${infusion.weapon ?? 'The weapon'} becomes ${beast.name} (bonus action)`);

  return (
    <div className="beast">
      <h3>{beast.name} <span className="chip">{beast.out ? 'Out as a beast' : 'In weapon form'}</span></h3>
      <p className="page-ref">
        The weapon’s beast form. It has its own turn straight after yours and listens to whoever it sees as its wielder.
        {beast.typed ? ' These are numbers you typed in.' : ' Read from the fruit’s own stat block.'}
      </p>
      <div className="row wrap">
        <button className={beast.out ? 'btn' : 'btn btn-primary'} onClick={out}>{beast.out ? 'Back to a weapon' : 'Morph into the beast (bonus action)'}</button>
      </div>
      <div className="tiles">
        <div className="tile"><span className="label">AC</span><span className="big num">{beast.ac ?? '—'}</span></div>
        <div className="tile"><span className="label">Hit points</span><span className="big num">{beast.hp}<span className="soft"> / {beast.hpMax}</span></span>{beast.hpDice && <span className="page-ref">{beast.hpDice}</span>}</div>
        <div className="tile"><span className="label">Speed</span><span className="num">{beast.speed || '—'}</span></div>
      </div>
      <div className="row hp-controls">
        <input type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" aria-label={`Amount of damage or healing for ${beast.name}`} />
        <button className="btn btn-damage" disabled={!ready} onClick={() => act('damage')}>Damage</button>
        <button className="btn btn-heal" disabled={!ready} onClick={() => act('heal')}>Heal</button>
        {taken > 0 && <button className="btn" onClick={() => hurt(-taken, `${beast.name} is back to full hit points`)}>Full</button>}
      </div>
      {beast.hp === 0 && <p className="notice">{beast.name} is at 0 hit points.</p>}
      {beast.abilities && (
        <p className="feature-text">{(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => `${a.toUpperCase()} ${beast.abilities![a]} (${signed(Math.floor((beast.abilities![a] - 10) / 2))})`).join(' · ')}</p>
      )}
      {beast.facts.map((fact, i) => <p key={i} className="page-ref"><strong>{fact.name}</strong> {fact.text}</p>)}
      <h4>Attacks</h4>
      {beast.damageType && <p className="page-ref">Its bludgeoning, piercing and slashing damage is {beast.damageType}, the infused weapon’s kind. Elemental damage stays as it is.</p>}
      {beast.attacks.length === 0 && <p className="soft">No attacks listed.</p>}
      {beast.attacks.map((attack, i) => (
        <div key={i} className="resource">
          <div>
            <div className="resource-name">{attack.name}</div>
            <div className="page-ref">
              {[attack.toHit !== null ? `${signed(attack.toHit)} to hit` : 'attack bonus not given', ...attack.damage.map((d) => `${d.dice} ${d.type}`)].join(' · ')}
              {attack.name.includes('infused weapon') ? ' · the book gives the beast this attack and no bonus for it: its own best attack bonus is used' : ''}
            </div>
            {attack.text && <RuleText text={attack.text} book="" />}
          </div>
          <div className="row">
            {attack.toHit !== null && <button className="btn btn-roll" onClick={() => rolls.d20(`${beast.name}: ${attack.name}`, attack.toHit!)} aria-label={`Roll ${attack.name} to hit`}>Hit</button>}
            {attack.damage.map((d, j) => <button key={j} className="btn btn-roll" onClick={() => rolls.dice(`${beast.name}: ${attack.name} (${d.type})`, d.dice)} aria-label={`Roll ${attack.name} ${d.type} damage, ${d.dice}`}>{d.dice}</button>)}
          </div>
        </div>
      ))}
      {beast.traits.map((trait, i) => (
        <details key={i} className="feature">
          <summary><span className="resource-name">{trait.name}</span></summary>
          <RuleText text={trait.text} book="" />
        </details>
      ))}
      <div className="row wrap">
        <button className="btn" onClick={() => setEditing(true)}>{beast.typed ? 'Change the beast’s numbers' : 'Use my own numbers'}</button>
        {beast.typed && <button className="btn" onClick={() => onBeast(undefined, 'Beast companion: the typed numbers are removed')}>Remove my numbers</button>}
      </div>
    </div>
  );
}
