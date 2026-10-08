import {
  ABILITIES, ABILITY_NAMES, NO_ASSIGNMENT, POINT_BUY, STANDARD_ARRAY, abilityMod, assign, assignedScores, cite, finalScores, pointBuy, rollScores, signed,
  type Ability, type AbilityScores, type ScoreMethod, type ScoreOrigin,
} from '@dndf/engine';
import { rng } from '../lib/rules';

const METHODS: { id: ScoreMethod; label: string; hint: string }[] = [
  { id: 'roll', label: 'Roll 4d6', hint: 'Roll four dice six times, drop the lowest die of each, then give each total to an ability.' },
  { id: 'array', label: 'Standard array', hint: 'Give each of 15, 14, 13, 12, 10 and 8 to an ability.' },
  { id: 'pointBuy', label: 'Point buy', hint: `Spend ${POINT_BUY.budget} points. Every score starts at ${POINT_BUY.min} and can go up to ${POINT_BUY.max}.` },
  { id: 'manual', label: 'Type them in', hint: 'Enter each final score yourself.' },
];
const ZERO: AbilityScores = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
const EIGHTS: AbilityScores = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? Math.round(n) : lo));

/** The origin a character has when it was made before the builder kept one: its scores, typed in. */
export const originOf = (scores: AbilityScores, origin?: ScoreOrigin): ScoreOrigin => origin ?? { method: 'manual', base: scores, bonus: ZERO };

/**
 * Starting ability scores by any of the handbook's methods or point buy, plus what race, improvements
 * and feats add. Nothing here blocks: a pool number left unassigned or points overspent is said, not refused.
 */
export function AbilityScoresField({ origin, book, onChange }: { origin: ScoreOrigin; book: string; onChange: (scores: AbilityScores, origin: ScoreOrigin) => void }) {
  const set = (next: ScoreOrigin) => onChange(finalScores(next.base, next.bonus), next);
  const pool = origin.pool ?? [];
  const assignment = origin.assignment ?? NO_ASSIGNMENT;
  const final = finalScores(origin.base, origin.bonus);
  const bought = pointBuy(origin.base);
  const pooled = origin.method === 'array' || origin.method === 'roll';

  const choose = (method: ScoreMethod) => {
    if (method === origin.method) return;
    if (method === 'manual') return set({ method, base: final, bonus: ZERO });
    // The final scores stand until the new method gives each ability a number.
    const bonus = origin.method === 'manual' ? ZERO : origin.bonus;
    if (method === 'array') return set({ method, base: origin.method === 'manual' ? final : origin.base, bonus, pool: [...STANDARD_ARRAY], assignment: NO_ASSIGNMENT });
    if (method === 'roll') return set({ method, base: origin.method === 'manual' ? final : origin.base, bonus, pool: [], assignment: NO_ASSIGNMENT, rolls: [] });
    return set({ method, base: EIGHTS, bonus });
  };
  const roll = () => {
    const rolls = rollScores(rng);
    set({ ...origin, rolls, pool: rolls.map((r) => r.total), assignment: NO_ASSIGNMENT });
  };
  const give = (ability: Ability, index: number | null) => {
    const next = assign(assignment, ability, index);
    set({ ...origin, assignment: next, base: assignedScores(pool, next, origin.base) });
  };
  const setBase = (ability: Ability, value: number) => set({ ...origin, base: { ...origin.base, [ability]: value } });
  const setBonus = (ability: Ability, value: number) => set({ ...origin, bonus: { ...origin.bonus, [ability]: value } });
  const unassigned = pooled && pool.length > 0 ? ABILITIES.filter((a) => assignment[a] === null) : [];

  return (
    <fieldset className="scores-field">
      <legend className="label">Ability scores · {cite(book, 10)}</legend>
      <div className="score-methods" role="radiogroup" aria-label="How to set ability scores">
        {METHODS.map((m) => (
          <button type="button" key={m.id} role="radio" aria-checked={origin.method === m.id} className={origin.method === m.id ? 'btn btn-primary' : 'btn'} onClick={() => choose(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="page-ref">{METHODS.find((m) => m.id === origin.method)!.hint}</p>

      {origin.method === 'roll' && (
        <div className="score-rolls">
          <button type="button" className="btn btn-primary" onClick={roll}>{pool.length ? 'Roll again' : 'Roll the six scores'}</button>
          {(origin.rolls ?? []).length > 0 && (
            <ol className="score-roll-list" aria-label="The six rolls">
              {origin.rolls!.map((r, i) => (
                <li key={i}>
                  <span className="num score-total">{r.total}</span>
                  <span className="page-ref">
                    {r.dice.map((d, j) => <span key={j} className={j === r.dropped ? 'die die-dropped' : 'die'}>{d}</span>)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {origin.method === 'pointBuy' && (
        <p className={bought.remaining < 0 ? 'notice' : 'page-ref'} aria-live="polite">
          {bought.spent} of {POINT_BUY.budget} points spent · {bought.remaining >= 0 ? `${bought.remaining} left` : `${-bought.remaining} over. It's your call.`}
        </p>
      )}
      {unassigned.length > 0 && <p className="notice">Not given a number yet: {unassigned.map((a) => ABILITY_NAMES[a]).join(', ')}. They keep the score they had.</p>}

      <div className="score-rows">
        {ABILITIES.map((a) => (
          <div key={a} className="score-row">
            <span className="label score-name" title={ABILITY_NAMES[a]}>{a}</span>
            {origin.method === 'manual' && (
              <input type="number" inputMode="numeric" value={origin.base[a]} onChange={(e) => setBase(a, clamp(Number(e.target.value), 1, 40))} aria-label={ABILITY_NAMES[a]} />
            )}
            {pooled && (
              <select value={assignment[a] ?? ''} onChange={(e) => give(a, e.target.value === '' ? null : Number(e.target.value))} aria-label={`${ABILITY_NAMES[a]}: which number`} disabled={pool.length === 0}>
                <option value="">{pool.length ? '—' : 'Roll first'}</option>
                {pool.map((n, i) => {
                  const holder = ABILITIES.find((other) => other !== a && assignment[other] === i);
                  return <option key={i} value={i}>{n}{holder ? ` (swap with ${holder.toUpperCase()})` : ''}</option>;
                })}
              </select>
            )}
            {origin.method === 'pointBuy' && (
              <span className="score-stepper">
                <button type="button" className="btn" onClick={() => setBase(a, origin.base[a] - 1)} disabled={origin.base[a] <= POINT_BUY.min} aria-label={`Lower ${ABILITY_NAMES[a]}`}>−</button>
                <span className="num score-base" aria-label={`${ABILITY_NAMES[a]} before bonuses`}>{origin.base[a]}</span>
                <button type="button" className="btn" onClick={() => setBase(a, origin.base[a] + 1)} disabled={origin.base[a] >= POINT_BUY.max} aria-label={`Raise ${ABILITY_NAMES[a]}`}>+</button>
              </span>
            )}
            {origin.method !== 'manual' && (
              <label className="score-bonus">
                <span className="page-ref">+</span>
                <input type="number" inputMode="numeric" value={origin.bonus[a]} onChange={(e) => setBonus(a, clamp(Number(e.target.value), -10, 20))} aria-label={`${ABILITY_NAMES[a]} bonus from race, improvements and feats`} />
              </label>
            )}
            <span className="score-final" aria-label={`${ABILITY_NAMES[a]} final score`}>
              <span className="num">{final[a]}</span> <span className="page-ref">({signed(abilityMod(final[a]))})</span>
            </span>
          </div>
        ))}
      </div>
      {origin.method !== 'manual' && <p className="page-ref">The “+” column is for what your race, ability score improvements and feats add. The last column is the score the sheet uses.</p>}
      {origin.method === 'manual' && <p className="page-ref">These are final scores, after race and improvements.</p>}
    </fieldset>
  );
}
