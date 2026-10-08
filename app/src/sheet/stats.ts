import { signed, type Sheet, type Stat } from '@dndf/engine';

export type StatKind = 'mod' | 'plain' | 'ft' | 'lb';

export function formatStat(value: number, kind: StatKind): string {
  if (kind === 'mod') return signed(value);
  if (kind === 'ft') return `${value} ft`;
  if (kind === 'lb') return `${value} lb`;
  return String(value);
}

/** Every overridable number on the sheet, so a dialog can follow one by its key as it changes. */
export function findStat(sheet: Sheet, key: string): Stat | undefined {
  const all: (Stat | null)[] = [
    sheet.prof, sheet.ac, sheet.speed, sheet.initiative, sheet.maxHp, sheet.carry, sheet.willpower, sheet.hakiSaveDc,
    sheet.hakiAttack, sheet.passivePerception, ...Object.values(sheet.saves), ...sheet.skills, ...sheet.attacks.map((a) => a.toHit), ...sheet.formulas, ...sheet.haki.colors.map((c) => c.count),
  ];
  return all.find((s) => s?.key === key) ?? undefined;
}
