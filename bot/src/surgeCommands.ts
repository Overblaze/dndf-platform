// What /surge says and does, with no Discord and no database in it: the Spirit Surge advancements a
// character has, and adding one. The options, what holds one back and what it changes on the sheet all
// come from the same engine as the website's "+ Spirit Surge" dialog.
import {
  ABILITIES, ABILITY_NAMES, RARITIES, SKILLS, cite, newSurgeId, rarityRank, sheetChanges, surgeAsks, surgeOptions,
  type Ability, type CharacterDoc, type Rarity, type RuleEntry, type Sheet, type SurgeOption, type SurgePick, type SurgeRecord,
} from '@dndf/engine';
import type { Outcome } from './commands';

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isRarity = (value: unknown): value is Rarity => (RARITIES as readonly unknown[]).includes(value);

/**
 * The advancements a surge of this rarity opens to this character. Devil Fruit advancements are private
 * content and are never offered or named by the bot: they are added on the website.
 */
export function surgeChoices(doc: CharacterDoc, sheet: Sheet, rules: Map<string, RuleEntry>, rarity: Rarity): SurgeOption[] {
  const tiers = Object.fromEntries(sheet.haki.colors.map((c) => [c.id, c.tier])) as Record<'armament' | 'observation' | 'supremeKing', number>;
  return surgeOptions(doc, rules, rarity, { tiers, spellcaster: sheet.resources.some((r) => /^slots\d$/.test(r.id)) }).filter((o) => o.entry.kind !== 'fruitAdvancement');
}

/** For the autocomplete: what fits what was typed, the ones the rules offer now first. */
export function surgeMatches(options: SurgeOption[], typed: string): { name: string; value: string }[] {
  const want = norm(typed);
  return options.filter((o) => norm(o.entry.name).includes(want))
    .sort((a, b) => a.blocked.length - b.blocked.length || rarityRank(b.entry.rarity) - rarityRank(a.entry.rarity) || a.entry.name.localeCompare(b.entry.name))
    .slice(0, 25)
    .map((o) => ({ name: `${o.entry.name} · ${String(o.entry.rarity ?? '')}${o.blocked.length ? ' · held back' : ''}`.slice(0, 100), value: o.entry.id }));
}

/** /surge list: Haki by Color and every advancement on the character. */
export function surgeList(sheet: Sheet): Outcome {
  const lines = [`✨ **${sheet.name}** — Willpower ${sheet.willpower.value} · Haki save DC ${sheet.hakiSaveDc.value}`];
  for (const color of sheet.haki.colors) {
    if (color.count.value === 0) continue;
    lines.push(`**${color.name}** — Tier ${color.tier} (${color.count.value} feature${color.count.value === 1 ? '' : 's'}${color.tier < 2 ? '; Tier 2 at 4' : color.tier < 3 ? '; Tier 3 at 6' : ''})`);
  }
  if (sheet.haki.surges.length === 0) lines.push('No Spirit Surge advancements yet. `/surge add` records one.');
  for (const s of sheet.haki.surges) {
    const pick = s.record.pick;
    const chose = [pick?.willpower ? 'Willpower' : pick?.ability ? ABILITY_NAMES[pick.ability] : '', pick?.skill ? SKILLS.find((k) => k.id === pick.skill)?.name ?? pick.skill : '', pick?.note ?? ''].filter(Boolean).join(', ');
    lines.push(`• **${s.name}**${chose ? ` (${chose})` : ''} — ${[s.rarity, s.record.reason, s.record.session, cite(s.book, s.page)].filter(Boolean).join(' · ')}`);
  }
  const purist = sheet.haki.purist;
  if (purist.earned > 0 || purist.picks.length > 0) lines.push(`Haki Purist: ${purist.picks.length} of ${purist.earned} pick${purist.earned === 1 ? '' : 's'} made (on the website’s Haki tab).`);
  return { reply: lines.join('\n') };
}

export interface SurgeInput { rarity: string; advancement: string; choice?: string | null; skill?: string | null; note?: string | null; reason?: string | null; session?: string | null }

/**
 * /surge add: one advancement from a Spirit Surge of the rarity given. An advancement the rules would hold
 * back is still added, with the reasons said: the choice is the player's and the DM's. One that leaves a
 * choice open (which ability, which skill) asks for it before anything is saved.
 */
export function surgeAdd(doc: CharacterDoc, sheet: Sheet, rules: Map<string, RuleEntry>, input: SurgeInput, today: string, resheet: (next: CharacterDoc) => Sheet): Outcome {
  if (!isRarity(input.rarity)) return { reply: `"${input.rarity}" is not a Spirit Surge rarity. Use ${RARITIES.join(', ')}.` };
  const options = surgeChoices(doc, sheet, rules, input.rarity);
  const want = norm(input.advancement);
  const exact = options.filter((o) => o.entry.id === input.advancement || norm(o.entry.name) === want);
  const close = exact.length ? exact : options.filter((o) => norm(o.entry.name).includes(want));
  if (/^fruitadvancement/i.test(input.advancement.replace(/[^a-z]/gi, ''))) return { reply: 'Devil Fruit advancements are added on the website (Fruit tab), where only you and your DM see them.' };
  if (close.length === 0) return { reply: `No advancement in ${sheet.book} is called "${input.advancement}". Start typing in the \`advancement\` box and pick from the list.` };
  if (close.length > 1) return { reply: `"${input.advancement}" could be: ${close.slice(0, 10).map((o) => o.entry.name).join(', ')}. Which one?` };
  const option = close[0]!;
  const entry = option.entry;

  const pick: SurgePick = {};
  const need: string[] = [];
  for (const ask of surgeAsks(entry, doc.rulesVersion)) {
    if (ask === 'abilityOrWillpower' || ask === 'ability') {
      const chosen = (input.choice ?? '').toLowerCase();
      if (ask === 'abilityOrWillpower' && chosen === 'willpower') pick.willpower = true;
      else if ((ABILITIES as readonly string[]).includes(chosen)) pick.ability = chosen as Ability;
      else need.push(`\`choice\`: the ability score to raise by 2${ask === 'abilityOrWillpower' ? ', or Willpower' : ''}`);
    } else if (ask === 'skill') {
      if (input.skill && SKILLS.some((k) => k.id === input.skill)) pick.skill = input.skill;
      else need.push('`skill`: the skill to gain (expertise, if already proficient)');
    } else if (ask === 'note') {
      if (input.note?.trim()) pick.note = input.note.trim().slice(0, 300);
      else need.push('`note`: what was chosen (the technique, the spell, the weapons merged…)');
    } else {
      return { reply: `**${entry.name}** asks for a choice from the character’s own lists (${ask === 'proficiency' ? 'a kind of armor or weapon' : 'one of their pools'}). Add it on the website: sheet → + Spirit Surge.` };
    }
  }
  if (need.length) return { reply: `**${entry.name}** leaves a choice open. Run it again with ${need.join('; ')}.` };
  if (input.note?.trim() && !pick.note) pick.note = input.note.trim().slice(0, 300);

  const record: SurgeRecord = {
    id: newSurgeId(doc.surges), entry: entry.id, rarity: input.rarity, at: today,
    ...(input.reason?.trim() ? { reason: input.reason.trim().slice(0, 200) } : {}), ...(input.session?.trim() ? { session: input.session.trim().slice(0, 60) } : {}),
    ...(Object.keys(pick).length ? { pick } : {}),
  };
  const next = { ...doc, surges: [...(doc.surges ?? []), record] };
  const after = resheet(next);
  const lines = [`✨ **${sheet.name}** — ${input.rarity} Spirit Surge: **${entry.name}**${pick.willpower ? ' (Willpower)' : pick.ability ? ` (${ABILITY_NAMES[pick.ability]})` : pick.skill ? ` (${SKILLS.find((k) => k.id === pick.skill)?.name})` : ''}`];
  lines.push(`${String(entry.rarity ?? '')}${entry.kind === 'hakiFeature' ? ' Haki feature' : ' advancement'} · ${cite(entry.source.book, entry.source.page)}${record.reason ? ` · ${record.reason}` : ''}`);
  for (const change of sheetChanges(sheet, after).slice(0, 12)) lines.push(`• ${change}`);
  for (const why of option.blocked) lines.push(`⚠️ The rules would not offer this now: ${why.charAt(0).toLowerCase()}${why.slice(1)}. It was added anyway; that is your DM’s call.`);
  lines.push('The full text is on the website’s Haki tab.');
  return { doc: next, reply: lines.join('\n'), log: `${input.rarity} Spirit Surge (Discord): ${entry.name}` };
}

/** /surge remove: takes the most recent record of an advancement off again. */
export function surgeRemove(doc: CharacterDoc, sheet: Sheet, what: string, resheet: (next: CharacterDoc) => Sheet): Outcome {
  const want = norm(what);
  const mine = sheet.haki.surges.filter((s) => s.kind !== 'fruitAdvancement');
  const hits = mine.filter((s) => norm(s.name) === want || s.record.entry === what);
  const close = hits.length ? hits : mine.filter((s) => norm(s.name).includes(want));
  const names = [...new Set(close.map((s) => s.name))];
  if (names.length === 0) return { reply: `**${sheet.name}** has no advancement called "${what}".${mine.length ? ` Theirs: ${[...new Set(mine.map((s) => s.name))].slice(0, 15).join(', ')}.` : ''}` };
  if (names.length > 1) return { reply: `"${what}" could be: ${names.slice(0, 10).join(', ')}. Which one?` };
  const last = close[close.length - 1]!;
  const next = { ...doc, surges: (doc.surges ?? []).filter((r) => r.id !== last.record.id) };
  const lines = [`↩️ **${sheet.name}** no longer has **${last.name}**${close.length > 1 ? ` (the most recent of ${close.length})` : ''}.`];
  for (const change of sheetChanges(sheet, resheet(next)).slice(0, 12)) lines.push(`• ${change}`);
  return { doc: next, reply: lines.join('\n'), log: `Removed Spirit Surge advancement (Discord): ${last.name}` };
}
