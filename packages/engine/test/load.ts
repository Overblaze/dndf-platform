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
