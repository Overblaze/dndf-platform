// Short rest, long rest, dawn and level-up (docs/FORMULAS.md, "Rests"). Each returns
// the new state and the list of changes, so the sheet can preview before applying.
import type { CampaignSettings, CharacterDoc, CharacterState } from './character';
import { DEFAULT_SETTINGS } from './character';
import { applyHealing } from './hp';
import type { Sheet } from './sheet';

export interface RestResult {
  state: CharacterState;
  changes: string[];
}

export interface RestOptions {
  /** Resources that need a confirmation to refill (Fury: 30 minutes of training), by id. Unlisted = confirmed. */
  confirmed?: Record<string, boolean>;
}

function refill(state: CharacterState, sheet: Sheet, recharges: string[], options: RestOptions, changes: string[]): CharacterState {
  const spent = { ...state.spent };
  for (const res of sheet.resources) {
    if (!recharges.includes(res.recharge) || !spent[res.id]) continue;
    if (res.confirm && options.confirmed?.[res.id] === false) {
      changes.push(`${res.name} not refilled (${res.confirm.toLowerCase()}: no)`);
      continue;
    }
    changes.push(`${res.name} ${res.remaining} → ${res.max} of ${res.max}`);
    delete spent[res.id];
  }
  const counters = { ...state.counters };
  for (const counter of sheet.counters) {
    if (!recharges.includes(counter.reset) || !counters[counter.id]) continue;
    changes.push(`${counter.label} resets`);
    delete counters[counter.id];
  }
  const trackers = { ...state.trackers };
  for (const tracker of sheet.trackers) {
    if (!tracker.reset || !recharges.includes(tracker.reset) || tracker.value === tracker.min) continue;
    changes.push(`${tracker.name} ${tracker.value} → ${tracker.min}`);
    delete trackers[tracker.id];
  }
  const toggles = { ...state.toggles };
  for (const toggle of sheet.toggles) {
    if (!toggles[toggle.id]) continue;
    changes.push(`${toggle.label} ends`);
    delete toggles[toggle.id];
  }
  return { ...state, spent, counters, toggles, trackers };
}

/**
 * The sizes of the next hit dice to roll, largest first, for a character who has already spent
 * some. A single-class character always gets the same die; a multiclass one works down the pool.
 */
export function nextHitDice(sheet: Sheet, count: number, alreadyRolled = 0): number[] {
  const all = sheet.hitDice.pool.flatMap((p) => Array.from({ length: p.count }, () => p.die));
  const spent = sheet.hitDice.total - sheet.hitDice.remaining + alreadyRolled;
  return all.slice(spent, spent + count);
}

/** Spend hit dice (each roll + Con, at least 0); refill short-rest uses. */
export function shortRest(doc: CharacterDoc, sheet: Sheet, options: RestOptions & { hitDiceRolls?: number[] } = {}): RestResult {
  const changes: string[] = [];
  let state = doc.state;
  const rolls = (options.hitDiceRolls ?? []).slice(0, sheet.hitDice.remaining);
  if (rolls.length > 0) {
    const con = sheet.abilities.con.mod;
    const healed = rolls.reduce((total, roll) => total + Math.max(0, roll + con), 0);
    const before = state.hp;
    state = applyHealing({ ...state, hitDiceSpent: state.hitDiceSpent + rolls.length }, healed, sheet.maxHp.value);
    changes.push(`Spend ${rolls.length} hit ${rolls.length === 1 ? 'die' : 'dice'} (${rolls.join(', ')} + ${con} each): HP ${before} → ${state.hp}`);
  }
  state = refill(state, sheet, ['short'], options, changes);
  return { state, changes };
}

/** Full HP, no temp HP, hit dice back (all by table ruling), all uses, exhaustion −1. */
export function longRest(doc: CharacterDoc, sheet: Sheet, options: RestOptions = {}, settings: CampaignSettings = DEFAULT_SETTINGS): RestResult {
  const changes: string[] = [];
  let state = doc.state;
  const max = sheet.maxHp.value;
  // Hit points above the maximum happen when the maximum has dropped (exhaustion, an edit): a rest settles them.
  if (state.hp !== max) changes.push(`HP ${state.hp} → ${max}`);
  if (state.tempHp > 0) changes.push(`Temporary HP ${state.tempHp} → 0`);
  const back = settings.longRestHitDice === 'all' ? state.hitDiceSpent : Math.min(state.hitDiceSpent, Math.max(1, Math.floor(sheet.hitDice.total / 2)));
  if (back > 0) changes.push(`Hit dice ${sheet.hitDice.remaining} → ${sheet.hitDice.remaining + back} of ${sheet.hitDice.total}`);
  if (state.exhaustion > 0) changes.push(`Exhaustion ${state.exhaustion} → ${state.exhaustion - 1}`);
  state = {
    ...state,
    hp: max,
    tempHp: 0,
    hitDiceSpent: Math.max(0, state.hitDiceSpent - back),
    exhaustion: Math.max(0, state.exhaustion - 1),
    deathSaves: { successes: 0, failures: 0 },
  };
  state = refill(state, sheet, ['short', 'long'], options, changes);
  return { state, changes };
}

/** Dawn: Devil Fruit charges, Zoan Beast Form uses and other per-day features. */
export function dawn(doc: CharacterDoc, sheet: Sheet): RestResult {
  const changes: string[] = [];
  const spent = { ...doc.state.spent };
  for (const res of sheet.resources) {
    if (res.recharge !== 'dawn' || !spent[res.id]) continue;
    changes.push(`${res.name} ${res.remaining} → ${res.max} of ${res.max}`);
    delete spent[res.id];
  }
  return { state: { ...doc.state, spent }, changes };
}

/** Healing Surge (table ruling): spend hit dice, each + Con; once per short or long rest. */
export function healingSurge(doc: CharacterDoc, sheet: Sheet, rolls: number[]): RestResult {
  const used = rolls.slice(0, sheet.healingSurgeDice);
  const con = sheet.abilities.con.mod;
  const healed = used.reduce((total, roll) => total + Math.max(0, roll + con), 0);
  const before = doc.state.hp;
  const state = applyHealing(
    { ...doc.state, hitDiceSpent: doc.state.hitDiceSpent + used.length, spent: { ...doc.state.spent, healing_surge: 1 } },
    healed,
    sheet.maxHp.value,
  );
  return { state, changes: [`Healing Surge: ${used.length} hit ${used.length === 1 ? 'die' : 'dice'} (${used.join(', ')} + ${con} each): HP ${before} → ${state.hp}`] };
}

/** Gain a level in a class: Dream Points reset to the new level; everything else is recomputed from the doc. */
export function levelUp(doc: CharacterDoc, classIndex = 0, hpRoll: number | null = null): CharacterDoc {
  const classes = doc.classes.map((c, i) => {
    if (i !== classIndex) return c;
    const hpRolls = [...(c.hpRolls ?? [])];
    const laterLevels = i === 0 ? c.level - 1 : c.level;
    while (hpRolls.length < laterLevels) hpRolls.push(null);
    hpRolls.push(hpRoll);
    return { ...c, level: c.level + 1, hpRolls };
  });
  return { ...doc, classes, state: { ...doc.state, dreamPointsSpent: 0 } };
}
