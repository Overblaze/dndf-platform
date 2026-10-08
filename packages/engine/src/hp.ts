// Hit points, temporary hit points and dying (docs/FORMULAS.md: Temp HP, Dream Points,
// I Won't Abandon My Dreams).
import type { CharacterState } from './character';

/** Damage hits temporary hit points first; hit points never go below 0. */
export function applyDamage(state: CharacterState, amount: number): CharacterState {
  const damage = Math.max(0, Math.floor(amount));
  const absorbed = Math.min(state.tempHp, damage);
  return { ...state, tempHp: state.tempHp - absorbed, hp: Math.max(0, state.hp - (damage - absorbed)) };
}

/** Healing never goes above the maximum; any healing ends dying. */
export function applyHealing(state: CharacterState, amount: number, maxHp: number): CharacterState {
  const healed = Math.max(0, Math.floor(amount));
  if (healed === 0) return state;
  // Hit points below zero can only come from a damaged save: healing starts from 0.
  const from = Math.max(0, state.hp);
  const hp = Math.min(Math.max(maxHp, from), from + healed);
  return { ...state, hp, deathSaves: { successes: 0, failures: 0 } };
}

/** Temporary hit points don't stack: keep the higher amount. */
export function gainTempHp(state: CharacterState, amount: number): CharacterState {
  return { ...state, tempHp: Math.max(state.tempHp, Math.max(0, Math.floor(amount))) };
}

export const ABANDON_DREAMS_DC = 12;

/** "I Won't Abandon My Dreams": on death, a d20 of 12 or more leaves you at 1 hit point — v10 p11. */
export function iWontAbandonMyDreams(state: CharacterState, d20: number): { survived: boolean; state: CharacterState } {
  if (d20 < ABANDON_DREAMS_DC) return { survived: false, state };
  return {
    survived: true,
    state: {
      ...state,
      hp: 1,
      deathSaves: { successes: 0, failures: 0 },
      // A death from a sixth level of exhaustion leaves you at exhaustion 5.
      exhaustion: Math.min(state.exhaustion, 5),
    },
  };
}

/** A Dream Point turns a failed death save into a success — v10 p11. */
export function rescueDeathSave(state: CharacterState, dreamPointsMax: number): CharacterState {
  if (state.deathSaves.failures < 1 || state.dreamPointsSpent >= dreamPointsMax) return state;
  return {
    ...state,
    dreamPointsSpent: state.dreamPointsSpent + 1,
    deathSaves: { successes: Math.min(3, state.deathSaves.successes + 1), failures: state.deathSaves.failures - 1 },
  };
}
