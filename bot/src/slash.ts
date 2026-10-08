// The slash commands as Discord wants them described.
import { SlashCommandBuilder, type SlashCommandOptionsOnlyBuilder } from 'discord.js';

const character = (b: SlashCommandOptionsOnlyBuilder) =>
  b.addStringOption((o) => o.setName('character').setDescription('Which of your characters (default: the one you changed last)').setAutocomplete(true));
const shown = (b: SlashCommandOptionsOnlyBuilder, what: string) =>
  b.addBooleanOption((o) => o.setName('private').setDescription(`Only you see ${what} (default: everyone in the channel does)`));

export const COMMANDS = [
  shown(character(new SlashCommandBuilder().setName('roll').setDescription('Roll for your character, or roll plain dice')
    .addStringOption((o) => o.setName('what').setDescription('athletics, dex save, initiative, an attack’s name, or dice like 2d6+3').setRequired(true))
    .addStringOption((o) => o.setName('with').setDescription('Advantage or disadvantage').addChoices({ name: 'advantage', value: 'advantage' }, { name: 'disadvantage', value: 'disadvantage' }))), 'the roll'),
  shown(character(new SlashCommandBuilder().setName('hp').setDescription('Take damage, heal, or gain temporary hit points')
    .addStringOption((o) => o.setName('change').setDescription('What happened').setRequired(true).addChoices({ name: 'damage', value: 'damage' }, { name: 'heal', value: 'heal' }, { name: 'temporary hit points', value: 'temp' }))
    .addIntegerOption((o) => o.setName('amount').setDescription('How many').setRequired(true).setMinValue(0).setMaxValue(9999))), 'the change'),
  shown(character(new SlashCommandBuilder().setName('rest').setDescription('Take a short or long rest')
    .addStringOption((o) => o.setName('kind').setDescription('Short or long').setRequired(true).addChoices({ name: 'short', value: 'short' }, { name: 'long', value: 'long' }))
    .addIntegerOption((o) => o.setName('hit_dice').setDescription('Short rest: how many hit dice to spend (the bot rolls them)').setMinValue(0).setMaxValue(20))), 'the rest'),
  shown(character(new SlashCommandBuilder().setName('dawn').setDescription('A new dawn: what comes back at dawn')), 'it'),
  shown(character(new SlashCommandBuilder().setName('status').setDescription('Your character at a glance: hit points, AC, pools, conditions')), 'it'),
  character(new SlashCommandBuilder().setName('sheet').setDescription('Your character sheet as a PDF')
    .addBooleanOption((o) => o.setName('full_text').setDescription('Include the rules text of every feature (default: the short sheet)'))
    .addBooleanOption((o) => o.setName('public').setDescription('Post it in the channel (default: only you see it)'))),
  new SlashCommandBuilder().setName('party').setDescription('Everyone in your campaign: hit points and AC')
    .addBooleanOption((o) => o.setName('private').setDescription('Only you see it (default: everyone in the channel does)')),
].map((command) => command.toJSON());
