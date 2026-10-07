// Loads every file under data/rules, as the app does, and indexes it for one rules version.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { indexRules, type RuleEntry, type RulesFile, type RulesVersion } from '../src';

const root = join(import.meta.dirname, '..', '..', '..', 'data', 'rules');

export const allFiles: RulesFile[] = readdirSync(root, { recursive: true })
  .map(String)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(root, name), 'utf8')) as RulesFile);

export function loadRules(version: RulesVersion): Map<string, RuleEntry> {
  return indexRules(allFiles, version);
}

/** Hit points a subclass adds for each level in its class (Germa's exoskeleton, the Battlehymn school), worked out without the engine. */
export function subclassHitPoints(rules: Map<string, RuleEntry>, subclass: string | undefined, level: number): number {
  const perLevel: Record<string, number> = { level: 1, 'level * 2': 2 };
  let total = 0;
  for (const feature of (subclass ? rules.get(subclass)?.features ?? [] : []) as { level: number; effects?: { type: string; expr?: string }[] }[]) {
    if (feature.level > level) continue;
    for (const effect of feature.effects ?? []) {
      if (effect.type !== 'hp') continue;
      if (!(effect.expr! in perLevel)) throw new Error(`teach subclassHitPoints about "${effect.expr}"`);
      total += perLevel[effect.expr!]! * level;
    }
  }
  return total;
}
