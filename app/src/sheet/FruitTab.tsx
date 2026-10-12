import { cite, spendResource, type FruitInfusion, type SheetFruit, type SheetInfusion } from '@dndf/engine';
import { useRolls } from '../lib/rolls';
import { RuleText } from '../components/RuleText';
import type { LiveCharacter } from '../lib/useCharacter';
import { Tile, type OpenStat } from './Vitals';

/** Short book name and page, for books that have no abbreviation of their own. */
const ref = (book: string, page: number) => (page > 0 ? `${book}, ${cite(book, page).replace(/^.*?p\./, 'p.')}` : book);

function FruitText({ fruit }: { fruit: SheetFruit }) {
  return (
    <>
      <p className="page-ref">{[fruit.rarity, fruit.type, ref(fruit.book, fruit.page)].filter(Boolean).join(' · ')}</p>
      {fruit.description && <p className="feature-text">{fruit.description}</p>}
      {fruit.appearance && <p className="feature-text"><strong>Appearance.</strong> {fruit.appearance}</p>}
      {fruit.seaWeakness && <p className="feature-text"><strong>Weakness.</strong> {fruit.seaWeakness}</p>}
      {fruit.parts.map((part, i) => (
        <details key={i} className="feature">
          <summary>
            <span className="resource-name">{part.name}</span>
            <span className="page-ref">{part.page > 0 ? `p.${part.page}` : ''}</span>
          </summary>
          <RuleText text={part.text} book={fruit.book} />
        </details>
      ))}
      {fruit.statBlock.length > 0 && (
        <details className="feature">
          <summary><span className="resource-name">Beast stat block</span></summary>
          <p className="feature-text">{fruit.statBlock.join('\n')}</p>
        </details>
      )}
    </>
  );
}

/** The Devil Fruit this character holds, with its charges, and any fruit they have learned about. Only shown when the DM has granted one. */
export function FruitTab({ live, onOpen }: { live: LiveCharacter; onOpen: OpenStat }) {
  const { doc, sheet } = live;
  const spend = (id: string, by: number) => {
    const result = spendResource(doc.state, sheet, id, by);
    live.setState(result.state, result.warning ? `${result.summary} (${result.warning})` : result.summary);
  };
  const rolls = useRolls();
  // How a fruit is held is the player's to say: eaten, or (a Devilforged) infused into a weapon. The record names the grant, never the fruit.
  const infusions = doc.infusions ?? [];
  const infuse = (fruit: SheetFruit) => live.setDoc({ ...doc, infusions: [...infusions, { grant: fruit.grant! }] }, 'A Devil Fruit is infused into a weapon instead of eaten');
  const eat = (infusion: SheetInfusion) => live.setDoc({ ...doc, infusions: infusions.filter((i) => i.grant !== infusion.grant) }, 'A Devil Fruit counts as eaten, not infused');
  const change = (infusion: SheetInfusion, patch: Partial<FruitInfusion>, log: string) =>
    live.setDoc({ ...doc, infusions: infusions.map((i) => (i.grant === infusion.grant ? Object.fromEntries(Object.entries({ ...i, ...patch }).filter(([, v]) => v !== undefined && v !== '')) as unknown as FruitInfusion : i)) }, log);
  const infuser = sheet.infuser;
  return (
    <>
      {sheet.infused.map((infusion) => {
        const { fruit } = infusion;
        const pool = sheet.resources.find((r) => r.id === infusion.resource);
        return (
          <section key={infusion.grant} className="card">
            <h2>{fruit.name} <span className="chip">Infused</span> <span className="chip">{fruit.revealed ? 'The table knows' : 'Secret'}</span></h2>
            <p className="page-ref">
              Infused into {infusion.weapon ? <strong>{infusion.weapon}</strong> : 'a weapon you have yet to choose'}, not eaten: the weapon has what the infusion gives, and none of the fruit’s own features are on your sheet.
              {fruit.revealed ? ' Your DM has revealed this fruit to the table.' : ' Only you and your DM can see which fruit it is.'}
            </p>
            {infuser && !infuser.ready && <p className="notice">Infuse Devil Fruit arrives at Devilforged level {infuser.from}; this character is level {infuser.level}. It is your and your DM’s call.</p>}
            {!infuser && <p className="notice">Infusing a Devil Fruit is a Devilforged feature, and this character has no Devilforged levels. It is your and your DM’s call.</p>}
            <label className="field">
              <span className="label">The weapon it is infused into</span>
              <select value={infusion.weaponId ?? ''} onChange={(e) => change(infusion, { weaponId: e.target.value || undefined }, `Infused weapon: ${doc.weapons.find((w) => w.id === e.target.value)?.name ?? 'none chosen'}`)}>
                <option value="">Not chosen yet</option>
                {doc.weapons.map((weapon) => <option key={weapon.id} value={weapon.id}>{weapon.name} ({weapon.damage} {weapon.damageType})</option>)}
              </select>
            </label>
            {doc.weapons.length === 0 && <p className="notice">This character has no weapons yet. Add one under Edit, then choose it here.</p>}
            <label className="field">
              <span className="label">Kind of infusion (from the fruit’s type: {fruit.type || 'not given'})</span>
              <select value={infusion.type ?? ''} onChange={(e) => change(infusion, { as: e.target.value && e.target.value !== infusion.typeRead ? e.target.value : undefined }, `Kind of infusion: ${e.target.value || 'as the fruit’s type says'}`)}>
                {!infusion.typeRead && <option value="">The book has none for this type: choose with your DM</option>}
                {infusion.types.map((type) => <option key={type} value={type}>{type}{type === infusion.typeRead ? ' (this fruit’s)' : ''}</option>)}
              </select>
            </label>
            {infusion.effectOptions.length > 0 && (
              <label className="field">
                <span className="label">{infusion.numbers?.effectBenefit}: the one feature of the fruit the weapon gains (with your DM’s help)</span>
                <select value={infusion.effect?.name ?? ''} onChange={(e) => change(infusion, { effect: e.target.value || undefined }, `Infused weapon’s fruit feature ${e.target.value ? 'chosen' : 'cleared'}`)}>
                  <option value="">Not chosen yet</option>
                  {infusion.effectOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
            )}
            {infusion.numbers?.elemental && (
              <label className="field">
                <span className="label">Kind of elemental damage (closest to the fruit’s element)</span>
                <input defaultValue={infusion.element ?? ''} maxLength={30} placeholder="fire, cold, lightning…" onBlur={(e) => { if (e.target.value.trim() !== (infusion.element ?? '')) change(infusion, { element: e.target.value.trim() || undefined }, 'Infused weapon’s elemental damage set'); }} />
              </label>
            )}
            {pool && (
              <div className="resource">
                <div>
                  <div className="resource-name">{pool.name}</div>
                  <div className="page-ref">back on a short rest · a spell costs its level in charges · {cite(pool.book, pool.page ?? 0)}</div>
                </div>
                <span className="big num">{pool.remaining}<span className="soft"> / {pool.max}</span></span>
                <div className="row">
                  <button className="btn" onClick={() => spend(pool.id, 1)} disabled={pool.remaining <= 0} aria-label="Spend one Devil Fruit Infusion charge">−</button>
                  <button className="btn" onClick={() => spend(pool.id, -1)} disabled={pool.remaining >= pool.max} aria-label="Give back one Devil Fruit Infusion charge">+</button>
                </div>
              </div>
            )}
            {infusion.rolls.length > 0 && (
              <div className="row wrap">
                {infusion.rolls.map((roll, i) => <button key={i} className="btn btn-roll" onClick={() => rolls.dice(`Infused ${infusion.weapon ?? 'weapon'}: ${roll.label}`, roll.dice)}>{roll.label} {roll.dice}</button>)}
              </div>
            )}
            {infusion.rule && !infusion.numbers && <p className="notice">This handbook words its infusions differently, so the sheet adds nothing to the weapon’s attack for you: the section below is what it gains, and the numbers are yours to apply (a custom feature or an item bonus will carry them).</p>}
            {infusion.rule ? (
              <details className="feature" open>
                <summary>
                  <span className="resource-name">What the weapon gains: {infusion.rule.name}</span>
                  <span className="page-ref">{cite(infusion.rule.book, infusion.rule.page)}</span>
                </summary>
                <RuleText text={infusion.rule.text} book={infusion.rule.book} />
                {infusion.weapon && infusion.numbers && (infusion.numbers.dieStep || infusion.numbers.strikes > 0) && <p className="page-ref">Already in {infusion.weapon}’s attack on the Combat tab: {[infusion.numbers.dieStep ? 'the larger damage die' : '', infusion.numbers.strikes ? `+${infusion.numbers.strikes} to attack and damage` : ''].filter(Boolean).join(' and ')}.</p>}
              </details>
            ) : <p className="notice">This handbook prints no infusion for a {fruit.type || 'fruit of this type'}. Choose the closest kind above with your DM; until then nothing is applied to the weapon.</p>}
            {infusion.effect && (
              <details className="feature" open>
                <summary>
                  <span className="resource-name">{infusion.effect.name}</span>
                  <span className="page-ref">from the fruit{infusion.effect.page > 0 ? ` · p.${infusion.effect.page}` : ''}</span>
                </summary>
                <RuleText text={infusion.effect.text} book={fruit.book} />
              </details>
            )}
            <details className="feature">
              <summary><span className="resource-name">The fruit itself, to read</span></summary>
              <FruitText fruit={fruit} />
            </details>
            <div className="row wrap">
              <button className="btn" onClick={() => eat(infusion)}>It was eaten instead</button>
            </div>
          </section>
        );
      })}
      {sheet.fruits.map((fruit) => {
        const pools = sheet.resources.filter((r) => fruit.resources.includes(r.id));
        return (
          <section key={fruit.key} className="card">
            <h2>{fruit.name} <span className="chip">{fruit.revealed ? 'The table knows' : 'Secret'}</span></h2>
            <p className="page-ref">{fruit.revealed ? 'Your DM has revealed this fruit to the table.' : 'Only you and your DM can see this. The rest of the table sees only that you have a Devil Fruit.'}</p>
            <div className="tiles">
              {sheet.fruitSaveDc && <Tile stat={sheet.fruitSaveDc} kind="plain" label="Fruit DC" onOpen={onOpen} />}
              {sheet.fruitAttack && <Tile stat={sheet.fruitAttack} kind="mod" label="Fruit attack" onOpen={onOpen} rollable />}
            </div>
            {pools.map((res) => (
              <div key={res.id} className="resource">
                <div>
                  <div className="resource-name">{res.name}</div>
                  <div className="page-ref">
                    back at dawn{res.name === 'Devil Fruit charges' && fruit.highestSpellLevel ? ` · a spell costs its level in charges · highest spell level ${fruit.highestSpellLevel}` : ''}
                  </div>
                </div>
                <span className="big num">{res.remaining}<span className="soft"> / {res.max}</span></span>
                <div className="row">
                  <button className="btn" onClick={() => spend(res.id, 1)} disabled={res.remaining <= 0} aria-label={`Spend one of ${res.name}`}>−</button>
                  <button className="btn" onClick={() => spend(res.id, -1)} disabled={res.remaining >= res.max} aria-label={`Give back one of ${res.name}`}>+</button>
                </div>
              </div>
            ))}
            {infuser && fruit.grant && (
              <div className="resource">
                <div>
                  <div className="resource-name">Eaten, or infused into a weapon?</div>
                  <div className="page-ref">
                    As a Devilforged you can infuse this fruit into a weapon instead of eating it (Infuse Devil Fruit, level {infuser.from} · {cite(infuser.book, infuser.page)}). The sheet has it as eaten.
                    {!infuser.ready ? ` You are Devilforged level ${infuser.level}; the feature arrives at ${infuser.from}.` : ''}
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => infuse(fruit)}>Infuse it into a weapon</button>
              </div>
            )}
            {fruit.category === 'other' && <p className="notice">This fruit’s type could not be read from the book, so its charges are not counted for you.</p>}
            <FruitText fruit={fruit} />
            <p className="page-ref">Features with dice have roll buttons on the Combat tab. “+ Spirit Surge” has a Devil Fruit tab for its advancements.</p>
          </section>
        );
      })}
      {sheet.knownFruits.length > 0 && (
        <section className="card">
          <h2>Devil Fruits you know about</h2>
          {sheet.knownFruits.map((fruit) => (
            <details key={fruit.key} className="feature">
              <summary>
                <span className="resource-name">{fruit.name}</span>
                <span className="page-ref">{[fruit.rarity, fruit.type].filter(Boolean).join(' · ')}</span>
              </summary>
              <FruitText fruit={fruit} />
            </details>
          ))}
        </section>
      )}
    </>
  );
}
