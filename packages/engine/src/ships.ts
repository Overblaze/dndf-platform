// Ship rows of docs/FORMULAS.md (DM Guide, PDF pages). Warnings never block.
import { abilityMod } from './core';

/** As characters; a score of 0 automatically fails — DMG p11. */
export function shipAbilityMod(score: number): { mod: number; autoFail: boolean } {
  return { mod: abilityMod(score), autoFail: score === 0 };
}

/** Damage at or above the component's threshold is taken in full; below it, none — DMG p13. */
export function componentDamage(damage: number, threshold: number): number {
  return damage >= threshold ? damage : 0;
}

/** Sails lose 5 ft of speed for every full 25 damage taken — DMG p15. */
export function sailSpeed(baseSpeed: number, damageTaken: number): number {
  return Math.max(0, baseSpeed - 5 * Math.floor(damageTaken / 25));
}

/** With half the crew or fewer: half speed and only half the weapons (rounded down) — DMG p15. */
export function shortHanded(crew: number, crewMax: number, speed: number, weapons: number) {
  const short = crew <= crewMax / 2;
  return { shortHanded: short, speed: short ? Math.floor(speed / 2) : speed, usableWeapons: short ? Math.floor(weapons / 2) : weapons };
}

export type ShipSize = 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan';

/** Crew needed by size: Medium or smaller 1, Large 4, Huge 9, Gargantuan 20 or more — DMG p11. */
export function crewNeeded(size: ShipSize): number {
  if (size === 'Large') return 4;
  if (size === 'Huge') return 9;
  return size === 'Gargantuan' ? 20 : 1;
}

/** More people aboard than crew maximum + passengers: movement on deck is halved — DMG p11. */
export function isCramped(aboard: number, crewMax: number, passengers: number): boolean {
  return aboard > crewMax + passengers;
}

/** Over cargo capacity: half speed, disadvantage on maneuvering, may capsize — DMG p11. */
export function isOverCargo(cargoTons: number, capacityTons: number): boolean {
  return cargoTons > capacityTons;
}

/** Installed upgrade slots against the ship's slots. Going over is a warning, not a block — DMG p18–30. */
export function upgradeSlots(installed: number[], shipSlots: number) {
  const used = installed.reduce((sum, n) => sum + n, 0);
  return { used, total: shipSlots, over: used > shipSlots };
}

/** Days = miles ÷ (pace in mph × 24) — DMG p15. */
export function travelDays(miles: number, paceMph: number): number {
  return miles / (paceMph * 24);
}

/** Days of food = rations ÷ people aboard. */
export function rationDays(rations: number, peopleAboard: number): number {
  return peopleAboard > 0 ? rations / peopleAboard : Infinity;
}

/** The crew roll's DC: 10 for Large and Huge ships, 15 for Gargantuan — DMG p11. */
export function shipSoulDc(size: ShipSize): number {
  return size === 'Gargantuan' ? 15 : 10;
}

/** One voyage: if more than half the crew succeed, the ship gains 1 soul point; at 3 it is sentient — DMG p11. */
export function shipSoulAfterVoyage(points: number, successes: number, crewRolling: number) {
  const gained = successes > crewRolling / 2 ? 1 : 0;
  const total = Math.min(3, points + gained);
  return { points: total, gained, sentient: total >= 3 };
}
