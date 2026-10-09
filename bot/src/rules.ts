// The same rules files the website bundles, read from the repository.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NO_CAMPAIGN_SETTINGS, NO_SECRETS, deriveSheet, indexRules, type CampaignSettings, type CharacterDoc, type Secrets, type RuleEntry, type RulesFile, type RulesVersion, type Sheet } from '@dndf/engine';

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

/** The sheet from the saved character alone, or with the private content it has been granted. */
/** The sheet, under the settings of the character's campaign (its DM's optional rules); in no campaign, those rules are off. */
export const sheetOf = (doc: CharacterDoc, secrets: Secrets = NO_SECRETS, settings: CampaignSettings = NO_CAMPAIGN_SETTINGS): Sheet => deriveSheet(doc, rulesOf(doc.rulesVersion), settings, secrets);
