// The DnDF Discord bot. Run with: npm start --workspace bot   (see bot/README.md)
import { AttachmentBuilder, Client, Events, GatewayIntentBits, MessageFlags, type AutocompleteInteraction, type ChatInputCommandInteraction } from 'discord.js';
import type { RollMode } from '@dndf/engine';
import { dawnCommand, hp, partyLine, rest, roll, status, type Outcome } from './commands';
import { ChangedElsewhere, Db, HISTORY_DAYS, type BotCharacter } from './db';
import { loadEnv } from './env';
import { closeBrowser, sheetPdf, SITE } from './pdf';
import { sheetOf } from './rules';

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

async function autocomplete(interaction: AutocompleteInteraction) {
  const characters = (await db.charactersOf(interaction.user.id)) ?? [];
  const typed = interaction.options.getFocused().toLowerCase();
  await interaction.respond(characters.filter((c) => c.doc.name.toLowerCase().includes(typed)).slice(0, 25).map((c) => ({ name: c.doc.name.slice(0, 100), value: c.id })));
}

async function run(interaction: ChatInputCommandInteraction) {
  const name = interaction.commandName;
  const hidden = name === 'sheet' ? !interaction.options.getBoolean('public') : Boolean(interaction.options.getBoolean('private'));
  // Reading the database and making a PDF can take longer than Discord's three seconds.
  await interaction.deferReply(hidden ? { flags: MessageFlags.Ephemeral } : {});

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
  const sheet = sheetOf(doc);

  if (name === 'sheet') {
    const pdf = await sheetPdf(doc, Boolean(interaction.options.getBoolean('full_text')));
    const file = new AttachmentBuilder(pdf, { name: `${doc.name.replace(/[^\w -]+/g, '').trim() || 'character'}.pdf` });
    return interaction.editReply({ content: `📜 **${sheet.name}** — ${sheet.summary}`, files: [file] });
  }

  let outcome: Outcome;
  if (name === 'roll') outcome = roll(sheet, interaction.options.getString('what', true), (interaction.options.getString('with') ?? 'normal') as RollMode, rng);
  else if (name === 'hp') outcome = hp(doc, sheet, interaction.options.getString('change', true) as 'damage' | 'heal' | 'temp', interaction.options.getInteger('amount', true));
  else if (name === 'rest') outcome = rest(doc, sheet, interaction.options.getString('kind', true) as 'short' | 'long', interaction.options.getInteger('hit_dice') ?? 0, rng);
  else if (name === 'dawn') outcome = dawnCommand(doc, sheet);
  else if (name === 'status') outcome = status(doc, sheet);
  else return interaction.editReply(`I don't know /${name}.`);

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
      await interaction.editReply('That character was changed somewhere else a moment ago (the website, or another command). Nothing was changed here. Run the command again.').catch(() => {});
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
