// The same rules files the website bundles, read from the repository.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveSheet, indexRules, type CharacterDoc, type RuleEntry, type RulesFile, type RulesVersion, type Sheet } from '@dndf/engine';

const root = join(import.meta.dirname, '..', '..', 'data', 'rules');
const files: RulesFile[] = (readdirSync(root, { recursive: true }) as string[])
  .map(String)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(root, name), 'utf8')) as RulesFile);

const byVersion = new Map<RulesVersion, Map<string, RuleEntry>>();
export function rulesOf(version: RulesVersion): Map<string, RuleEntry> {
  let rules = byVersion.get(version);
  if (!rules) byVersion.set(version, (rules = indexRules(files, version)));
  return rules;
}

export const sheetOf = (doc: CharacterDoc): Sheet => deriveSheet(doc, rulesOf(doc.rulesVersion));
