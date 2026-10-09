import { cite, CONDITIONS, DREAM_POINT_DIE, healingSurge, iWontAbandonMyDreams, nextHitDice, rescueDeathSave, rollDie, spendResource, ABANDON_DREAMS_DC } from '@dndf/engine';
import { useState } from 'react';
import { Pips } from '../components/Pips';
import { RuleText } from '../components/RuleText';
import { useRolls } from '../lib/rolls';
import { rng } from '../lib/rules';
import type { LiveCharacter } from '../lib/useCharacter';
import { BountyCard } from './Bounty';
import type { OpenStat } from './Vitals';

/** The book's own wording for a universal rule, when the general rules are loaded. */
function BookText({ sheet, name, note }: { sheet: LiveCharacter['sheet']; name: string; note?: string }) {
  const rule = sheet.generalRules[name];
  if (!rule) return null;
  return (
    <details className="rule-text">
      <summary>Rules text · {cite(sheet.book, rule.page)}</summary>
      <RuleText text={rule.text} tables={rule.tables} book={sheet.book} />
      {note && <p className="page-ref">{note}</p>}
    </details>
  );
}

export function StatusTab({ live, onOpen }: { live: LiveCharacter; onOpen: OpenStat }) {
  const rolls = useRolls();
  const { doc, sheet } = live;
  const state = doc.state;
  const { successes, failures } = state.deathSaves;
  const surge = sheet.resources.find((r) => r.id === 'healing_surge')!;
  const [surgeDice, setSurgeDice] = useState(1);
  const dice = Math.min(surgeDice, sheet.healingSurgeDice);

  const deathSave = () => {
    const result = rolls.d20('Death save', 0);
    if (result.natural20) return live.setState({ ...state, hp: 1, deathSaves: { successes: 0, failures: 0 } }, 'Death save: natural 20, back up at 1 HP');
    const next = result.die >= 10 ? { successes: Math.min(3, successes + 1), failures } : { successes, failures: Math.min(3, failures + (result.natural1 ? 2 : 1)) };
    live.setState({ ...state, deathSaves: next }, `Death save ${result.die}: ${next.successes} successes, ${next.failures} failures`);
  };
  const abandon = () => {
    const result = rolls.d20("I Won't Abandon My Dreams", 0);
    const outcome = iWontAbandonMyDreams(state, result.die);
    live.setState(outcome.state, `I Won't Abandon My Dreams: rolled ${result.die}, ${outcome.survived ? 'back at 1 HP' : 'not enough'}`);
  };
  const doSurge = () => {
    const result = healingSurge(doc, sheet, nextHitDice(sheet, dice).map((die) => rollDie(die, rng)));
    live.setState(result.state, result.changes.join('; '));
  };
  const dream = (amount: number) => {
    const spent = Math.min(sheet.dreamPoints.max, Math.max(0, state.dreamPointsSpent + amount));
    live.setState({ ...state, dreamPointsSpent: spent }, `Dream Points ${sheet.dreamPoints.remaining} → ${sheet.dreamPoints.max - spent}`);
  };
  const [own, setOwn] = useState('');
  const addOwn = () => {
    const name = own.trim().slice(0, 40);
    // A condition the rules define is switched on by its own name, however it was typed.
    const known = CONDITIONS.find((c) => c.toLowerCase() === name.toLowerCase());
    if (name && !state.conditions.some((c) => c.toLowerCase() === name.toLowerCase())) live.setState({ ...state, conditions: [...state.conditions, known ?? name] }, `${known ?? name} added`);
    setOwn('');
  };
  const SRD = '5e SRD 5.1';
  const conditionText = ((live.rules.get('rule.srd_conditions')?.sections ?? []) as { name: string; text: string; page: number }[]);
  const toggleCondition = (name: string) => {
    const has = state.conditions.includes(name);
    live.setState({ ...state, conditions: has ? state.conditions.filter((c) => c !== name) : [...state.conditions, name] }, `${name} ${has ? 'removed' : 'added'}`);
  };
  const exhaust = (by: number) => {
    const next = Math.min(6, Math.max(0, state.exhaustion + by));
    live.setState({ ...state, exhaustion: next }, `Exhaustion ${state.exhaustion} → ${next}`);
  };

  return (
    <>
      <section className="card">
        <h2>Dream Points</h2>
        <div className="resource">
          <div>
            <div className="resource-name">{sheet.dreamPoints.remaining} of {sheet.dreamPoints.max}</div>
            <div className="page-ref">+{DREAM_POINT_DIE} after an attack, check or save · reset on level-up · {cite(sheet.book, 11)}</div>
          </div>
          <Pips remaining={sheet.dreamPoints.remaining} max={sheet.dreamPoints.max} label="Dream Points" />
          <div className="row">
            <button className="btn" onClick={() => dream(1)} disabled={sheet.dreamPoints.remaining === 0} aria-label="Spend a Dream Point">−</button>
            <button className="btn" onClick={() => dream(-1)} disabled={state.dreamPointsSpent === 0} aria-label="Regain a Dream Point">+</button>
          </div>
        </div>
        <p className="page-ref">Pirate Prestige maximum: {sheet.prestigeMax} · {cite(sheet.book, 12)}</p>
        <BookText sheet={sheet} name="Dream Points" />
      </section>

      <section className="card">
        <h2>Hit dice and Healing Surge</h2>
        <div className="resource">
          <div>
            <div className="resource-name">Hit dice: {sheet.hitDice.remaining} of {sheet.hitDice.pool.map((p) => `${p.count}d${p.die}`).join(' + ')}</div>
            <div className="page-ref">spend them in a short rest, or with a Healing Surge</div>
          </div>
        </div>
        <div className="resource">
          <div>
            <div className="resource-name">Healing Surge</div>
            <div className="page-ref">up to {sheet.healingSurgeDice} dice, each + Con · once per rest · table ruling · {cite(sheet.book, 11)}</div>
          </div>
          <Pips remaining={surge.remaining} max={1} label="Healing Surge" />
        </div>
        <div className="row">
          <label className="field-inline">
            <span className="label">Dice</span>
            <select value={dice} onChange={(e) => setSurgeDice(Number(e.target.value))} disabled={sheet.healingSurgeDice === 0}>
              {Array.from({ length: Math.max(1, sheet.healingSurgeDice) }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
            </select>
          </label>
          <button className="btn btn-heal" onClick={doSurge} disabled={sheet.healingSurgeDice === 0}>
            Use Healing Surge
          </button>
          {surge.remaining === 0 && (
            <button className="btn" onClick={() => live.setState(spendResource(state, sheet, 'healing_surge', -1).state)}>Mark unused</button>
          )}
        </div>
        {surge.remaining === 0 && <p className="notice">Already used since the last rest. You can still use it; this is only a reminder.</p>}
        <BookText sheet={sheet} name="Healing Surge" note="Table ruling: a long rest returns all spent hit dice, and a surge can spend up to half your hit dice." />
      </section>

      <section className="card">
        <h2>Death saves</h2>
        <div className="resource">
          <div className="resource-name">Successes</div>
          <Pips remaining={successes} max={3} label="Death save successes" />
        </div>
        <div className="resource">
          <div className="resource-name">Failures</div>
          <Pips remaining={failures} max={3} label="Death save failures" />
        </div>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={deathSave}>Roll death save</button>
          <button className="btn" disabled={failures === 0 || sheet.dreamPoints.remaining === 0} onClick={() => live.setState(rescueDeathSave(state, sheet.dreamPoints.max), 'Dream Point: a failed death save becomes a success')}>
            Dream Point rescue
          </button>
          <button className="btn" onClick={abandon}>I Won't Abandon My Dreams (d20, {ABANDON_DREAMS_DC}+)</button>
          <button className="btn" disabled={successes + failures === 0} onClick={() => live.setState({ ...state, deathSaves: { successes: 0, failures: 0 } }, 'Death saves cleared')}>Clear</button>
        </div>
        <p className="page-ref">A Dream Point turns a failed death save into a success. On death, a d20 of {ABANDON_DREAMS_DC} or more leaves you at 1 HP · {cite(sheet.book, 11)}</p>
        <BookText sheet={sheet} name="I Won’t Abandon My Dreams" />
      </section>

      <section className="card">
        <h2>Exhaustion and conditions</h2>
        <div className="resource">
          <div className="resource-name">Exhaustion</div>
          <span className="big num">{state.exhaustion}</span>
          <div className="row">
            <button className="btn" onClick={() => exhaust(-1)} disabled={state.exhaustion === 0} aria-label="Lower exhaustion">−</button>
            <button className="btn" onClick={() => exhaust(1)} disabled={state.exhaustion === 6} aria-label="Raise exhaustion">+</button>
          </div>
        </div>
        <p className="page-ref">Tap a condition to put it on or take it off. Its effects are applied for you: disadvantage on the rolls it names, speed 0, saves that fail.</p>
        <div className="chips">
          {CONDITIONS.map((name) => (
            <button key={name} className={state.conditions.includes(name) ? 'chip chip-btn chip-on' : 'chip chip-btn'} aria-pressed={state.conditions.includes(name)} onClick={() => toggleCondition(name)}>
              {name}
            </button>
          ))}
          {state.conditions.filter((name) => !(CONDITIONS as readonly string[]).includes(name)).map((name) => (
            <button key={name} className="chip chip-btn chip-on" aria-pressed onClick={() => toggleCondition(name)} aria-label={`${name}: remove`}>{name} ×</button>
          ))}
        </div>
        <div className="row wrap">
          <input value={own} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addOwn(); }} placeholder="Something else: Soaked, Seasick…" aria-label="A condition of your own" maxLength={40} />
          <button className="btn" disabled={!own.trim()} onClick={addOwn}>Note it</button>
        </div>
        <p className="page-ref">One you type in is kept as a note under “In effect” and changes nothing on the sheet.</p>
        {sheet.conditions.map((c) => {
          const book = conditionText.find((s) => s.name === c.name);
          return (
            <div key={c.name} className="tracker">
              <div className="resource-name">{c.name}{c.immune ? ` — immune (${c.immune}), so it does nothing` : ''}</div>
              {!c.immune && c.effects.length > 0 && <ul className="notes">{c.effects.map((line) => <li key={line}>{line}</li>)}</ul>}
              {!c.known && <div className="page-ref">Your own note.</div>}
              {book && (
                <details className="rule-text">
                  <summary>The rule · {cite(SRD, book.page)}</summary>
                  <p className="feature-text">{book.text}</p>
                  <p className="page-ref">From the System Reference Document 5.1 by Wizards of the Coast LLC, CC-BY-4.0.</p>
                </details>
              )}
            </div>
          );
        })}
      </section>

      <BountyCard live={live} onOpen={onOpen} />

      <section className="card">
        <h2>Notes</h2>
        <textarea rows={6} value={doc.notes} onChange={(e) => live.setDoc({ ...doc, notes: e.target.value })} aria-label="Notes" />
      </section>
    </>
  );
}
