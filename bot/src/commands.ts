// What each bot command does to a character, with no Discord and no database in it: a character
// and the player's words in, the reply and (when something changed) the new character out.
// The numbers all come from the shared engine, so the bot and the website can never disagree.
import {
  ABILITIES, ABILITY_NAMES, applyDamage, applyHealing, dawn, exactBerries, gainTempHp, longRest, nextHitDice, rollD20, rollDice, rollDie, shortRest, signed,
  type CharacterDoc, type RollMode, type Rng, type Sheet,
} from '@dndf/engine';

export interface Outcome {
  /** What the bot says, in Discord markdown. */
  reply: string;
  /** The character after the command, when it changed. */
  doc?: CharacterDoc;
  /** One line for the character's History. */
  log?: string;
}

/**
 * Runs a command on the whole sheet, Devil Fruit included, so that what is saved is right (fruit charges
 * come back at dawn). When the fruit is still secret and the reply can be read by other players, the
 * reply is the one the same command gives for the sheet without the fruit, with the same dice.
 */
export function withPrivacy(run: (sheet: Sheet, rng: Rng) => Outcome, whole: Sheet, withoutSecrets: Sheet, showAll: boolean, rng: Rng): Outcome {
  const rolled: number[] = [];
  const outcome = run(whole, () => { const value = rng(); rolled.push(value); return value; });
  if (showAll) return outcome;
  let next = 0;
  return { ...outcome, reply: run(withoutSecrets, () => rolled[next++] ?? rng()).reply };
}

const dieFaces = (values: number[]) => values.join(', ');
const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Everything on a sheet that a d20 can be rolled for, by the names a player might type. */
export function rollables(sheet: Sheet): { name: string; bonus: number; kind: 'check' | 'save' | 'skill' | 'attack' | 'initiative'; damage?: string }[] {
  return [
    { name: 'Initiative', bonus: sheet.initiative.value, kind: 'initiative' as const },
    ...sheet.skills.map((s) => ({ name: s.label, bonus: s.value, kind: 'skill' as const })),
    ...ABILITIES.map((a) => ({ name: `${ABILITY_NAMES[a]} save`, bonus: sheet.saves[a].value, kind: 'save' as const })),
    ...ABILITIES.map((a) => ({ name: `${ABILITY_NAMES[a]} check`, bonus: sheet.abilities[a].mod, kind: 'check' as const })),
    ...sheet.attacks.map((a) => ({ name: a.name, bonus: a.toHit.value, kind: 'attack' as const, damage: `${a.damage} ${a.damageType}` })),
  ];
}

/** The rollable a player meant: an exact name, else the one name that starts with or contains what was typed. */
export function findRollable(sheet: Sheet, what: string) {
  const all = rollables(sheet);
  const want = norm(what);
  const short = want.replace(/ (check|save|saving throw)$/, '');
  const asSave = / (save|saving throw)$/.test(want);
  const names = all.map((r) => ({ r, n: norm(r.name) }));
  const exact = names.filter(({ n }) => n === want || (asSave && n === `${short} save`));
  if (exact.length === 1) return { found: exact[0]!.r, close: [] };
  // "str" → Strength check, "dex save" → Dexterity save, "ath" → Athletics
  const pool = names.filter(({ r }) => (asSave ? r.kind === 'save' : true));
  const starts = pool.filter(({ n }) => n.startsWith(short));
  const preferred = starts.filter(({ r }) => (asSave ? r.kind === 'save' : r.kind !== 'save'));
  const pick = preferred.length === 1 ? preferred : starts.length === 1 ? starts : [];
  if (pick.length === 1) return { found: pick[0]!.r, close: [] };
  const close = (starts.length ? starts : pool.filter(({ n }) => n.includes(short))).map(({ r }) => r.name);
  if (close.length === 1) return { found: all.find((r) => r.name === close[0])!, close: [] };
  return { found: undefined, close: close.slice(0, 8) };
}

/** /roll: a named roll from the sheet ("athletics", "dex save", "club"), or plain dice ("2d6+3"). */
export function roll(sheet: Sheet, what: string, mode: RollMode, rng: Rng): Outcome {
  const text = what.trim();
  if (/^\s*\d*\s*d\s*\d+/i.test(text)) {
    try {
      const rolled = rollDice(text.replace(/\s+/g, ' '), rng);
      return { reply: `🎲 **${sheet.name}** rolls ${rolled.text}: **${rolled.total}**  (${dieFaces(rolled.rolls.map((r) => r.value))}${rolled.bonus ? ` ${signed(rolled.bonus)}` : ''})` };
    } catch {
      return { reply: `I can't roll "${text}". Write dice like \`2d6+3\`, or name something on the sheet like \`athletics\` or \`dex save\`.` };
    }
  }
  const { found, close } = findRollable(sheet, text);
  if (!found) {
    return { reply: close.length ? `"${text}" could be: ${close.join(', ')}. Which one?` : `Nothing on ${sheet.name}'s sheet is called "${text}". Try a skill, \`str save\`, \`initiative\`, an attack's name, or dice like \`2d6+3\`.` };
  }
  const d20 = rollD20(found.bonus, rng, mode);
  const how = mode === 'normal' ? `${d20.die}` : `${dieFaces(d20.dice)} → ${d20.die}, ${mode}`;
  const flair = d20.natural20 ? ' — natural 20!' : d20.natural1 ? ' — natural 1.' : '';
  const lines = [`🎲 **${sheet.name}** · ${found.name}: **${d20.total}**  (${how} ${signed(found.bonus)})${flair}`];
  if (found.kind === 'attack' && found.damage) {
    const dice = found.damage.replace(/\s+[a-z ,]+$/i, '');
    const type = found.damage.slice(dice.length).trim();
    const damage = rollDice(d20.natural20 ? dice.replace(/(\d+)d(\d+)/g, (_, n: string, sides: string) => `${Number(n) * 2}d${sides}`) : dice, rng);
    lines.push(`   On a hit: **${damage.total}** ${type}  (${damage.text}: ${dieFaces(damage.rolls.map((r) => r.value))}${damage.bonus ? ` ${signed(damage.bonus)}` : ''})${d20.natural20 ? ' — dice doubled' : ''}`);
  }
  return { reply: lines.join('\n') };
}

const hpLine = (doc: CharacterDoc, sheet: Sheet) => `${doc.state.hp} / ${sheet.maxHp.value}${doc.state.tempHp ? ` (+${doc.state.tempHp} temporary)` : ''}`;

/** /hp: take damage, heal, or gain temporary hit points. */
export function hp(doc: CharacterDoc, sheet: Sheet, kind: 'damage' | 'heal' | 'temp', amount: number): Outcome {
  const n = Math.max(0, Math.floor(amount));
  if (n === 0) return { reply: `Nothing to change: the amount was 0. ${sheet.name} is at ${hpLine(doc, sheet)}.` };
  const before = hpLine(doc, sheet);
  const state = kind === 'damage' ? applyDamage(doc.state, n) : kind === 'heal' ? applyHealing(doc.state, n, sheet.maxHp.value) : gainTempHp(doc.state, n);
  const next = { ...doc, state };
  const verb = kind === 'damage' ? `takes ${n} damage` : kind === 'heal' ? `heals ${n}` : `gains ${n} temporary hit points`;
  const down = kind === 'damage' && state.hp === 0 ? ' 💀 Down at 0 hit points.' : '';
  return {
    doc: next,
    reply: `${kind === 'damage' ? '💥' : '💚'} **${sheet.name}** ${verb}: ${before} → **${hpLine(next, sheet)}**.${down}`,
    log: `${kind === 'damage' ? 'Damage' : kind === 'heal' ? 'Healing' : 'Temporary hit points'} ${n} (Discord): HP ${doc.state.hp} → ${state.hp}`,
  };
}

/** /rest: a short rest (optionally spending hit dice, rolled here) or a long rest. */
export function rest(doc: CharacterDoc, sheet: Sheet, kind: 'short' | 'long', hitDice: number, rng: Rng): Outcome {
  if (kind === 'long') {
    const done = longRest(doc, sheet);
    return { doc: { ...doc, state: done.state }, reply: `🛏️ **${sheet.name}** takes a long rest.\n${bullets(done.changes)}`, log: `Long rest (Discord): ${done.changes.join('; ') || 'nothing to change'}` };
  }
  const spend = Math.max(0, Math.min(Math.floor(hitDice), sheet.hitDice.remaining));
  const rolls = nextHitDice(sheet, spend).map((die) => rollDie(die, rng));
  const done = shortRest(doc, sheet, { hitDiceRolls: rolls });
  const asked = Math.floor(hitDice) > spend ? `\n(Only ${sheet.hitDice.remaining} hit ${sheet.hitDice.remaining === 1 ? 'die' : 'dice'} left, so ${spend} spent.)` : '';
  return {
    doc: { ...doc, state: done.state },
    reply: `⛺ **${sheet.name}** takes a short rest${spend ? `, spending ${spend} hit ${spend === 1 ? 'die' : 'dice'} (rolled ${dieFaces(rolls)})` : ''}.\n${bullets(done.changes)}${asked}`,
    log: `Short rest (Discord): ${done.changes.join('; ') || 'nothing to change'}`,
  };
}

/** /dawn: what comes back at dawn. */
export function dawnCommand(doc: CharacterDoc, sheet: Sheet): Outcome {
  const done = dawn(doc, sheet);
  return { doc: { ...doc, state: done.state }, reply: `🌅 Dawn for **${sheet.name}**.\n${bullets(done.changes)}`, log: `Dawn (Discord): ${done.changes.join('; ') || 'nothing to change'}` };
}

const bullets = (changes: string[]) => (changes.length ? changes.map((c) => `• ${c}`).join('\n') : '• Nothing to change.');

/** /status: the character at a glance. */
export function status(doc: CharacterDoc, sheet: Sheet): Outcome {
  const pools = sheet.resources.filter((r) => !r.id.startsWith('sr.') && r.max > 0).map((r) => `${r.name} ${r.remaining}/${r.max}`);
  const lines = [
    `**${sheet.name}** — ${sheet.summary}`,
    `❤️ ${hpLine(doc, sheet)} · 🛡️ AC ${sheet.ac.value} · 👟 ${sheet.speed.value} ft · initiative ${signed(sheet.initiative.value)}`,
    `Hit dice ${sheet.hitDice.remaining}/${sheet.hitDice.total} · Dream Points ${sheet.dreamPoints.remaining}/${sheet.dreamPoints.max} · Willpower ${sheet.willpower.value} · Haki DC ${sheet.hakiSaveDc.value}`,
  ];
  if (pools.length) lines.push(pools.join(' · '));
  if (sheet.money !== 0 || sheet.gear.lines.length > 0) lines.push(`${exactBerries(sheet.money)} · carrying ${sheet.gear.carried} of ${sheet.gear.capacity} lb${sheet.gear.over ? ' (over)' : ''}`);
  const prepared = sheet.spellbook.known.filter((k) => k.level > 0 && k.prepared).map((k) => k.name);
  if (prepared.length) lines.push(`Prepared: ${prepared.join(', ')}`);
  const on = sheet.toggles.filter((t) => t.on).map((t) => t.label);
  if (on.length) lines.push(`On: ${on.join(', ')}`);
  if (doc.state.conditions.length) lines.push(`Conditions: ${doc.state.conditions.join(', ')}`);
  if (doc.state.exhaustion) lines.push(`Exhaustion ${doc.state.exhaustion}`);
  if (doc.state.hp === 0) lines.push(`Death saves: ${doc.state.deathSaves.successes} successes, ${doc.state.deathSaves.failures} failures`);
  return { reply: lines.join('\n') };
}

/** /party: one line per character. */
export function partyLine(doc: CharacterDoc, sheet: Sheet, player?: string): string {
  const mark = doc.state.hp === 0 ? '💀' : doc.state.hp <= sheet.maxHp.value / 2 ? '🩸' : '❤️';
  return `${mark} **${sheet.name}**${player ? ` (${player})` : ''} — ${sheet.summary.split(' · ').slice(1).join(' · ') || sheet.summary} · HP ${hpLine(doc, sheet)} · AC ${sheet.ac.value}`;
}
