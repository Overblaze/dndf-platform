// What each bot command does to a character, with no Discord and no database in it: a character
// and the player's words in, the reply and (when something changed) the new character out.
// The numbers all come from the shared engine, so the bot and the website can never disagree.
import {
  ABILITIES, ABILITY_NAMES, CONDITIONS, CONDITION_EFFECTS, applyDamage, applyHealing, damageAfterDefenses, dawn, describeEdge, exactBerries, gainTempHp, longRest, nextHitDice, rollD20, rollDice, rollDie, rollModeWith, shortRest, signed,
  type CharacterDoc, type RollEdge, type RollMode, type Rng, type Sheet, speedLine } from '@dndf/engine';

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
export function rollables(sheet: Sheet): { name: string; bonus: number; kind: 'check' | 'save' | 'skill' | 'attack' | 'initiative'; damage?: string; /** Advantage or disadvantage the sheet gives this roll. */ edge?: RollEdge; /** The condition that makes this save fail without a roll. */ fails?: string }[] {
  return [
    { name: 'Initiative', bonus: sheet.initiative.value, kind: 'initiative' as const, edge: sheet.initiativeEdge },
    ...sheet.skills.map((s) => ({ name: s.label, bonus: s.value, kind: 'skill' as const, edge: s.edge })),
    ...ABILITIES.map((a) => ({ name: `${ABILITY_NAMES[a]} save`, bonus: sheet.saves[a].value, kind: 'save' as const, edge: sheet.saves[a].edge, fails: sheet.saves[a].autoFail })),
    ...ABILITIES.map((a) => ({ name: `${ABILITY_NAMES[a]} check`, bonus: sheet.abilities[a].mod, kind: 'check' as const, edge: sheet.abilities[a].edge })),
    ...sheet.attacks.map((a) => ({ name: a.name, bonus: a.toHit.value, kind: 'attack' as const, damage: `${a.damage} ${a.damageType}`, edge: a.edge })),
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
  // A saving throw a condition makes fail (paralyzed, stunned…) is not rolled.
  if (found.fails) return { reply: `🎲 **${sheet.name}** · ${found.name}: **fails** without a roll (${found.fails}).` };
  // What the sheet gives this roll (heavy armor on Stealth, an item) is put together with what the player asked for: one of each is a straight roll.
  const rolledAs = rollModeWith(found.edge, mode);
  const d20 = rollD20(found.bonus, rng, rolledAs);
  const why = [found.edge ? describeEdge(found.edge) : '', mode !== 'normal' ? `asked for ${mode}` : ''].filter(Boolean).join('; ');
  const how = rolledAs === 'normal' ? `${d20.die}${found.edge ? `, ${why}${/straight roll/.test(why) ? '' : ', so a straight roll'}` : ''}` : `${dieFaces(d20.dice)} → ${d20.die}, ${found.edge ? why : rolledAs}`;
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
export function hp(doc: CharacterDoc, sheet: Sheet, kind: 'damage' | 'heal' | 'temp', amount: number, type?: string | null): Outcome {
  const n = Math.max(0, Math.floor(amount));
  if (n === 0) return { reply: `Nothing to change: the amount was 0. ${sheet.name} is at ${hpLine(doc, sheet)}.` };
  const before = hpLine(doc, sheet);
  // With the kind of damage given, resistances, immunities and vulnerabilities are applied.
  const taken = kind === 'damage' ? damageAfterDefenses(n, type ?? undefined, sheet.protections) : { amount: n, why: null };
  const state = kind === 'damage' ? applyDamage(doc.state, taken.amount) : kind === 'heal' ? applyHealing(doc.state, n, sheet.maxHp.value) : gainTempHp(doc.state, n);
  const next = { ...doc, state };
  const verb = kind === 'damage' ? `takes ${type ? `${n} ${type}` : n} damage${taken.why ? ` (${taken.why}: ${taken.amount} taken)` : ''}` : kind === 'heal' ? `heals ${n}` : `gains ${n} temporary hit points`;
  const down = kind === 'damage' && state.hp === 0 ? ' 💀 Down at 0 hit points.' : '';
  return {
    doc: next,
    reply: `${kind === 'damage' ? '💥' : '💚'} **${sheet.name}** ${verb}: ${before} → **${hpLine(next, sheet)}**.${down}`,
    log: `${kind === 'damage' ? 'Damage' : kind === 'heal' ? 'Healing' : 'Temporary hit points'} ${n}${kind === 'damage' && type ? ` ${type}${taken.why ? `, ${taken.amount} taken` : ''}` : ''} (Discord): HP ${doc.state.hp} → ${state.hp}`,
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
    `❤️ ${hpLine(doc, sheet)} · 🛡️ AC ${sheet.ac.value} · 👟 ${speedLine(sheet)} · initiative ${signed(sheet.initiative.value)}`,
    `Hit dice ${sheet.hitDice.remaining}/${sheet.hitDice.total}${sheet.optionalRules.dreamPoints ? ` · Dream Points ${sheet.dreamPoints.remaining}/${sheet.dreamPoints.max}` : ''} · Willpower ${sheet.willpower.value} · Haki DC ${sheet.hakiSaveDc.value}`,
  ];
  if (pools.length) lines.push(pools.join(' · '));
  if (sheet.money !== 0 || sheet.gear.lines.length > 0) lines.push(`${exactBerries(sheet.money)} · carrying ${sheet.gear.carried} of ${sheet.gear.capacity} lb${sheet.gear.over ? ' (over)' : ''}`);
  // Only a class that prepares has a list for the day; a class that learns always has all its spells.
  const prepared = sheet.spellbook.known.filter((k) => k.level > 0 && k.prepared && k.mode !== 'known').map((k) => k.name);
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

/** /condition: put a condition on the character, take one off, or list them with what each is doing. */
export function condition(doc: CharacterDoc, sheet: Sheet, action: 'add' | 'remove' | 'list', name: string | null, resheet: (next: CharacterDoc) => Sheet): Outcome {
  const has = doc.state.conditions;
  if (action === 'list' || !name?.trim()) {
    if (sheet.conditions.length === 0 && !doc.state.exhaustion) return { reply: `**${sheet.name}** has no conditions.` };
    const lines = sheet.conditions.map((c) => `• **${c.name}**${c.immune ? ` — immune (${c.immune}), so it does nothing` : c.effects.length ? ` — ${c.effects.join('; ')}` : c.known ? '' : ' — noted'}`);
    if (doc.state.exhaustion) lines.push(`• **Exhaustion ${doc.state.exhaustion}**`);
    return { reply: [`**${sheet.name}**`, ...lines].join('\n') };
  }
  const typed = name.trim().slice(0, 40);
  const known = CONDITIONS.find((c) => c.toLowerCase() === typed.toLowerCase());
  const label = known ?? typed;
  const on = has.find((c) => c.toLowerCase() === label.toLowerCase());
  if (action === 'add') {
    if (on) return { reply: `**${sheet.name}** is already ${label.toLowerCase()}.` };
    const next = { ...doc, state: { ...doc.state, conditions: [...has, label] } };
    const after = resheet(next).conditions.find((c) => c.name === label);
    const does = after?.immune ? `They are immune (${after.immune}), so it does nothing.` : known ? CONDITION_EFFECTS[known]!.notes.join('; ') + '.' : 'Noted; it changes nothing on the sheet.';
    return { doc: next, reply: `⚠️ **${sheet.name}** is **${label.toLowerCase()}**. ${does}`, log: `${label} added (Discord)` };
  }
  if (!on) return { reply: `**${sheet.name}** is not ${label.toLowerCase()}.${has.length ? ` They are: ${has.join(', ')}.` : ''}` };
  return { doc: { ...doc, state: { ...doc.state, conditions: has.filter((c) => c !== on) } }, reply: `✅ **${sheet.name}** is no longer ${on.toLowerCase()}.`, log: `${on} removed (Discord)` };
}
