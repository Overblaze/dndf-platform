// The DnDF Discord bot. Run with: npm start --workspace bot   (see bot/README.md)
import { AttachmentBuilder, Client, Events, GatewayIntentBits, MessageFlags, type AutocompleteInteraction, type ChatInputCommandInteraction } from 'discord.js';
import type { RollMode, Sheet } from '@dndf/engine';
import { dawnCommand, hp, partyLine, rest, roll, status, withPrivacy, type Outcome } from './commands';
import { ChangedElsewhere, Db, HISTORY_DAYS, type BotCharacter, type BotShip } from './db';
import { loadEnv } from './env';
import { armoryMatches, itemAdd, itemList, itemMake, itemRemove, itemUse } from './itemCommands';
import { closeBrowser, sheetPdf, SITE } from './pdf';
import { rulesOf, sheetOf } from './rules';
import { bountyReply, crewPosters, shipAboard, shipHit, shipStatus, shipTreasury, type ShipOutcome } from './shipCommands';

const env = loadEnv();
const db = new Db(env);
const rng = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
const NOT_LINKED = `I don't know you yet. Sign in once with Discord at ${SITE} and make a character there; then I can find it.`;
const NO_CHARACTERS = `You have no characters saved to your account. Make one at ${SITE} while signed in (characters made while signed out stay in that browser).`;

/** The character a command is about: the one named, or the one changed most recently. */
function pick(characters: BotCharacter[], wanted: string | null): BotCharacter | undefined {
  if (!wanted) return characters[0];
  const lower = wanted.toLowerCase();
  return characters.find((c) => c.id === wanted) ?? characters.find((c) => c.doc.name.toLowerCase() === lower) ?? characters.find((c) => c.doc.name.toLowerCase().includes(lower));
}

/** Ship rules (types and upgrades) are in the v10 data; both handbooks share the DM Guide's ship chapter. */
const shipRule = (id: string) => rulesOf('dndf-10').get(id);
const NO_SHIPS = `You have no ship yet. Launch one on the Ship page at ${SITE} while signed in, and share her with your campaign so the whole crew can use her here.`;

function pickShip(ships: BotShip[], wanted: string | null): BotShip | undefined {
  if (!wanted) return ships[0];
  const lower = wanted.toLowerCase();
  return ships.find((s) => s.id === wanted) ?? ships.find((s) => s.doc.name.toLowerCase() === lower) ?? ships.find((s) => s.doc.name.toLowerCase().includes(lower));
}

async function shipCommand(interaction: ChatInputCommandInteraction) {
  const ships = await db.shipsOf(interaction.user.id);
  if (!ships) return interaction.editReply(NOT_LINKED);
  if (ships.length === 0) return interaction.editReply(NO_SHIPS);
  const wanted = interaction.options.getString('ship');
  const ship = pickShip(ships, wanted);
  if (!ship) return interaction.editReply(`You have no ship called "${wanted}". Yours: ${ships.map((s) => s.doc.name).join(', ')}.`);
  const sub = interaction.options.getSubcommand();
  const today = new Date().toISOString().slice(0, 10);
  let outcome: ShipOutcome;
  if (sub === 'status') outcome = shipStatus(ship.doc, shipRule);
  else {
    const by = await db.nameOf(interaction.user.id);
    if (sub === 'damage' || sub === 'repair') outcome = shipHit(ship.doc, interaction.options.getString('part', true), interaction.options.getInteger('amount', true), sub, by, today, shipRule);
    else if (sub === 'treasury') outcome = shipTreasury(ship.doc, interaction.options.getString('change', true) as 'in' | 'out', interaction.options.getInteger('amount', true), interaction.options.getString('why') ?? '', by, today);
    else if (sub === 'aboard') outcome = shipAboard(ship.doc, interaction.options.getString('what', true) as 'crew' | 'passengers' | 'rations', interaction.options.getInteger('number', true), by, today, shipRule);
    else return interaction.editReply(`I don't know /ship ${sub}.`);
  }
  // Save first: the crew is only told about a change that was really written.
  if (outcome.doc) await db.saveShip(interaction.user.id, ship, outcome.doc);
  return interaction.editReply(outcome.reply.slice(0, 1990));
}

async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused(true);
  if (interaction.commandName === 'ship') {
    const ships = (await db.shipsOf(interaction.user.id)) ?? [];
    const typed = focused.value.toLowerCase();
    if (focused.name === 'ship') return interaction.respond(ships.filter((s) => s.doc.name.toLowerCase().includes(typed)).slice(0, 25).map((s) => ({ name: `${s.doc.name}${s.campaign ? ` (${s.campaign})` : ''}`.slice(0, 100), value: s.id })));
    const ship = pickShip(ships, interaction.options.getString('ship'));
    const parts = (ship?.doc.components ?? []).filter((c) => c.maxHp !== undefined && c.name.toLowerCase().includes(typed));
    return interaction.respond(parts.slice(0, 25).map((c) => ({ name: c.name.slice(0, 100), value: c.name.slice(0, 100) })));
  }
  const characters = (await db.charactersOf(interaction.user.id)) ?? [];
  const typed = interaction.options.getFocused().toLowerCase();
  if (interaction.commandName === 'item' && focused.name !== 'character') {
    const character = pick(characters, interaction.options.getString('character'));
    if (focused.name === 'name') return interaction.respond(armoryMatches([...rulesOf(character?.doc.rulesVersion ?? 'dndf-10').values()].filter((e) => e.kind === 'item'), typed));
    // "item": what this character carries; for /item use, only the things that can be switched on.
    const using = interaction.options.getSubcommand() === 'use';
    const carried = (character?.doc.inventory ?? []).filter((i) => i.name.toLowerCase().includes(typed) && (!using || i.custom));
    return interaction.respond([...new Set(carried.map((i) => i.name))].slice(0, 25).map((name) => ({ name: name.slice(0, 100), value: name.slice(0, 100) })));
  }
  await interaction.respond(characters.filter((c) => c.doc.name.toLowerCase().includes(typed)).slice(0, 25).map((c) => ({ name: c.doc.name.slice(0, 100), value: c.id })));
}

async function run(interaction: ChatInputCommandInteraction) {
  const name = interaction.commandName;
  const hidden = name === 'sheet' ? !interaction.options.getBoolean('public') : Boolean(interaction.options.getBoolean('private'));
  // Reading the database and making a PDF can take longer than Discord's three seconds.
  await interaction.deferReply(hidden ? { flags: MessageFlags.Ephemeral } : {});

  if (name === 'ship') return shipCommand(interaction);
  if (name === 'bounty' && interaction.options.getBoolean('crew')) {
    const parties = await db.partyOf(interaction.user.id);
    if (!parties) return interaction.editReply(NOT_LINKED);
    if (parties.length === 0) return interaction.editReply('You are not in a campaign yet. Your DM adds you on the website.');
    // Posters are read from the saved characters alone: a poster is public, and no Devil Fruit is in it.
    const text = parties.map((p) => `__${p.campaign}__\n${crewPosters(p.members.map((m) => ({ doc: m.character.doc, sheet: sheetOf(m.character.doc), player: m.player })))}`).join('\n\n');
    return interaction.editReply(text.slice(0, 1990));
  }

  if (name === 'party') {
    const parties = await db.partyOf(interaction.user.id);
    if (!parties) return interaction.editReply(NOT_LINKED);
    if (parties.length === 0) return interaction.editReply('You are not in a campaign yet. Your DM adds you on the website.');
    const text = parties.map((p) => `__${p.campaign}__\n${p.members.map((m) => partyLine(m.character.doc, sheetOf(m.character.doc), m.player)).join('\n') || 'No characters in this campaign yet.'}`).join('\n\n');
    return interaction.editReply(text.slice(0, 1990));
  }

  const characters = await db.charactersOf(interaction.user.id);
  if (!characters) return interaction.editReply(NOT_LINKED);
  if (characters.length === 0) return interaction.editReply(NO_CHARACTERS);
  const wanted = interaction.options.getString('character');
  const character = pick(characters, wanted);
  if (!character) return interaction.editReply(`You have no character called "${wanted}". Yours: ${characters.map((c) => c.doc.name).join(', ')}.`);
  const { doc } = character;
  // The sheet anyone may see: the saved character alone. A Devil Fruit is never in it.
  const sheet = sheetOf(doc);

  if (name === 'bounty') return interaction.editReply(bountyReply(doc, sheet).slice(0, 1990));

  if (name === 'item') {
    // Gear is not secret, and the sums here are of the saved character alone, as on the Gear tab.
    const o = interaction.options;
    const sub = o.getSubcommand();
    const resheet = (next: typeof doc) => sheetOf(next);
    const id = () => crypto.randomUUID();
    const armory = [...rulesOf(doc.rulesVersion).values()].filter((e) => e.kind === 'item');
    const outcome: Outcome | null =
      sub === 'list' ? itemList(doc, sheet)
      : sub === 'add' ? itemAdd(doc, sheet, { name: o.getString('name', true), quantity: o.getInteger('quantity'), weight: o.getNumber('weight'), notes: o.getString('notes') }, armory, id, resheet)
      : sub === 'make' ? itemMake(doc, sheet, {
        kind: o.getString('kind', true), name: o.getString('name', true), quantity: o.getInteger('quantity'), weight: o.getNumber('weight'), rarity: o.getString('rarity'), description: o.getString('description'),
        damage: o.getString('damage'), damageType: o.getString('damage_type'), martial: o.getBoolean('martial'), ranged: o.getBoolean('ranged'), finesse: o.getBoolean('finesse'), weaponBonus: o.getInteger('weapon_bonus'),
        armorClass: o.getInteger('armor_class'), armorDex: o.getString('armor_dex'), acBonus: o.getInteger('ac_bonus'), speedBonus: o.getInteger('speed_bonus'), hpBonus: o.getInteger('hp_bonus'),
        charges: o.getInteger('charges'), recharge: o.getString('recharge'), roll: o.getString('roll'), rollIs: o.getString('roll_is'), effect: o.getString('effect'), useNow: o.getBoolean('use_now'),
      }, id, resheet)
      : sub === 'use' ? itemUse(doc, sheet, o.getString('item', true), !o.getBoolean('put_away'), resheet)
      : sub === 'remove' ? itemRemove(doc, sheet, o.getString('item', true), o.getInteger('quantity'), resheet)
      : null;
    if (!outcome) return interaction.editReply(`I don't know /item ${sub}.`);
    if (outcome.doc && outcome.log) await db.save(interaction.user.id, character, outcome.doc, outcome.log);
    return interaction.editReply(outcome.reply.slice(0, 1990));
  }

  if (name === 'sheet') {
    const pdf = await sheetPdf(doc, Boolean(interaction.options.getBoolean('full_text')));
    const file = new AttachmentBuilder(pdf, { name: `${doc.name.replace(/[^\w -]+/g, '').trim() || 'character'}.pdf` });
    return interaction.editReply({ content: `📜 **${sheet.name}** — ${sheet.summary}`, files: [file] });
  }

  // The sums use the whole sheet, the granted Devil Fruit included. Its details are only in the reply
  // when the fruit has been revealed to the table, or the reply is one only this player can see.
  const { secrets, open } = await db.secretsOf(character.id);
  const whole = sheetOf(doc, secrets);
  const act = (one: Sheet, dice: typeof rng): Outcome | null => {
    if (name === 'roll') return roll(one, interaction.options.getString('what', true), (interaction.options.getString('with') ?? 'normal') as RollMode, dice);
    if (name === 'hp') return hp(doc, one, interaction.options.getString('change', true) as 'damage' | 'heal' | 'temp', interaction.options.getInteger('amount', true));
    if (name === 'rest') return rest(doc, one, interaction.options.getString('kind', true) as 'short' | 'long', interaction.options.getInteger('hit_dice') ?? 0, dice);
    if (name === 'dawn') return dawnCommand(doc, one);
    if (name === 'status') return status(doc, one);
    return null;
  };
  if (!['roll', 'hp', 'rest', 'dawn', 'status'].includes(name)) return interaction.editReply(`I don't know /${name}.`);
  const outcome = withPrivacy((one, dice) => act(one, dice)!, whole, sheet, hidden || open, rng);

  // Save first: the player is only told about a change that was really written.
  if (outcome.doc && outcome.log) await db.save(interaction.user.id, character, outcome.doc, outcome.log);
  return interaction.editReply(outcome.reply.slice(0, 1990));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once(Events.ClientReady, (ready) => {
  console.log(`DnDF bot signed in as ${ready.user.tag}; PDFs come from ${SITE}`);
  // Once now and once a day: change logs older than 90 days go. Characters are never removed.
  const tidy = () => db.pruneHistory().then(
    (removed) => console.log(`History tidy: ${removed} change log line(s) older than ${HISTORY_DAYS} days removed`),
    (error: Error) => console.error('History tidy failed:', error.message),
  );
  void tidy();
  setInterval(tidy, 24 * 60 * 60 * 1000).unref();
});
client.on(Events.InteractionCreate, async (interaction) => {
  // One table, one server: commands from anywhere else are ignored.
  if (interaction.guildId !== env.DISCORD_GUILD_ID) return;
  try {
    if (interaction.isAutocomplete()) await autocomplete(interaction);
    else if (interaction.isChatInputCommand()) await run(interaction);
  } catch (error) {
    if (error instanceof ChangedElsewhere && interaction.isChatInputCommand()) {
      await interaction.editReply(`That ${interaction.commandName === 'ship' ? 'ship' : 'character'} was changed somewhere else a moment ago (the website, or another command). Nothing was changed here. Run the command again.`).catch(() => {});
      return;
    }
    // The error's text goes to the log on this machine; the player gets a plain line with no internals.
    console.error(`/${'commandName' in interaction ? interaction.commandName : '?'} failed:`, (error as Error).message);
    if (interaction.isChatInputCommand()) {
      const sorry = 'Something went wrong and nothing was changed. Try again; if it keeps happening, tell Matt.';
      await (interaction.deferred || interaction.replied ? interaction.editReply(sorry) : interaction.reply({ content: sorry, flags: MessageFlags.Ephemeral })).catch(() => {});
    }
  }
});

const stop = async () => { await closeBrowser(); await client.destroy(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await client.login(env.DISCORD_BOT_TOKEN);
