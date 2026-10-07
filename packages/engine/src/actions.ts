// Things a player does on the sheet: spend a use, flip a toggle, use a feature.
// Each returns the new state plus a line for the log. Nothing here ever blocks:
// running out produces a warning and the action still goes through.
import type { CharacterState } from './character';
import { evaluateNumber } from './expr';
import type { Sheet, SheetFeature } from './sheet';

export interface ActionResult {
  state: CharacterState;
  summary: string;
  warning?: string;
}

function resource(sheet: Sheet, id: string) {
  return sheet.resources.find((r) => r.id === id);
}

/** Positive amounts spend, negative amounts give back. Stays within 0..max. */
export function spendResource(state: CharacterState, sheet: Sheet, id: string, amount = 1): ActionResult {
  const res = resource(sheet, id);
  if (!res) return { state, summary: '', warning: `No "${id}" on this sheet.` };
  const before = Math.min(res.max, state.spent[id] ?? 0);
  const after = Math.min(res.max, Math.max(0, before + amount));
  const warning = amount > 0 && before + amount > res.max ? `No ${res.name} left.` : undefined;
  return {
    state: { ...state, spent: { ...state.spent, [id]: after } },
    summary: `${res.name} ${res.max - before} → ${res.max - after} of ${res.max}`,
    warning,
  };
}

/** Moves a tracker by an amount within its range. Paying more than is held warns and stops at the minimum. */
export function moveTracker(state: CharacterState, sheet: Sheet, id: string, by: number): ActionResult {
  const tracker = sheet.trackers.find((t) => t.id === id);
  if (!tracker) return { state, summary: '', warning: `No "${id}" on this sheet.` };
  const before = Math.min(tracker.max, Math.max(tracker.min, state.trackers[id] ?? tracker.min));
  const after = Math.min(tracker.max, Math.max(tracker.min, before + by));
  return {
    state: { ...state, trackers: { ...state.trackers, [id]: after } },
    summary: `${tracker.name} ${before} → ${after}`,
    warning: before + by < tracker.min ? `Not enough ${tracker.name}.` : undefined,
  };
}

function chain(state: CharacterState, steps: ((s: CharacterState) => ActionResult)[]): ActionResult {
  const summaries: string[] = [];
  const warnings: string[] = [];
  for (const step of steps) {
    const result = step(state);
    state = result.state;
    if (result.summary) summaries.push(result.summary);
    if (result.warning) warnings.push(result.warning);
  }
  return { state, summary: summaries.join('; '), warning: warnings.join(' ') || undefined };
}

/** Uses a feature: pays its cost, spends one of its uses, applies what it refills. */
export function activateFeature(state: CharacterState, sheet: Sheet, feature: SheetFeature): ActionResult {
  const steps: ((s: CharacterState) => ActionResult)[] = [];
  // A cost is paid from a pool (Fury, Ki) or, failing that, from a tracker of the same id (Hybrid Points).
  for (const [id, amount] of Object.entries(feature.cost ?? {})) {
    steps.push((s) => (resource(sheet, id) || !sheet.trackers.some((t) => t.id === id) ? spendResource(s, sheet, id, amount) : moveTracker(s, sheet, id, -amount)));
  }
  if (feature.resource) steps.push((s) => spendResource(s, sheet, feature.resource!, 1));
  for (const effect of feature.onUse) {
    if (effect.type === 'addTracker') {
      steps.push((s) => moveTracker(s, sheet, effect.tracker ?? '', evaluateNumber(effect.value ?? 1)));
      continue;
    }
    const id = effect.resource ?? '';
    const max = resource(sheet, id)?.max ?? 0;
    const back = effect.type === 'refill' ? max : evaluateNumber(effect.value ?? 1);
    steps.push((s) => spendResource(s, sheet, id, -back));
  }
  if (feature.counter) {
    const id = feature.counter;
    steps.push((s) => ({ state: { ...s, counters: { ...s.counters, [id]: (s.counters[id] ?? 0) + 1 } }, summary: '' }));
  }
  const result = chain(state, steps);
  return { ...result, summary: `${feature.name}${result.summary ? `: ${result.summary}` : ''}` };
}

/** Switching a toggle on spends a use of its feature and applies anything it regains (Frenzied Rush). */
export function setToggle(state: CharacterState, sheet: Sheet, id: string, on: boolean): ActionResult {
  const toggle = sheet.toggles.find((t) => t.id === id);
  if (!toggle) return { state, summary: '', warning: `No "${id}" toggle on this sheet.` };
  const flipped = { ...state, toggles: { ...state.toggles, [id]: on } };
  if (!on || toggle.on) return { state: flipped, summary: `${toggle.label} ${on ? 'on' : 'off'}` };
  const steps: ((s: CharacterState) => ActionResult)[] = [];
  if (toggle.resource) steps.push((s) => spendResource(s, sheet, toggle.resource!, 1));
  for (const gain of toggle.regain) steps.push((s) => spendResource(s, sheet, gain.resource, -gain.value));
  const result = chain(flipped, steps);
  return { ...result, summary: `${toggle.label} on${result.summary ? `: ${result.summary}` : ''}` };
}

export function setTracker(state: CharacterState, sheet: Sheet, id: string, value: number): CharacterState {
  const tracker = sheet.trackers.find((t) => t.id === id);
  if (!tracker) return state;
  return { ...state, trackers: { ...state.trackers, [id]: Math.min(tracker.max, Math.max(tracker.min, value)) } };
}
