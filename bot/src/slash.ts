// The slash commands as Discord wants them described.
import { SlashCommandBuilder, type SlashCommandOptionsOnlyBuilder, type SlashCommandSubcommandBuilder } from 'discord.js';

const character = (b: SlashCommandOptionsOnlyBuilder) =>
  b.addStringOption((o) => o.setName('character').setDescription('Which of your characters (default: the one you changed last)').setAutocomplete(true));
const shown = (b: SlashCommandOptionsOnlyBuilder, what: string) =>
  b.addBooleanOption((o) => o.setName('private').setDescription(`Only you see ${what} (default: everyone in the channel does)`));

const whichShip = (b: SlashCommandSubcommandBuilder) =>
  b.addStringOption((o) => o.setName('ship').setDescription('Which ship (default: your campaign’s, or the one changed last)').setAutocomplete(true))
    .addBooleanOption((o) => o.setName('private').setDescription('Only you see it (default: everyone in the channel does)'));

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
  shown(character(new SlashCommandBuilder().setName('bounty').setDescription('Your wanted poster, or every poster out in your crew')
    .addBooleanOption((o) => o.setName('crew').setDescription('Show every poster in your campaign instead of one character’s'))), 'it'),
  new SlashCommandBuilder().setName('ship').setDescription('Your crew’s ship')
    .addSubcommand((sub) => whichShip(sub.setName('status').setDescription('The ship at a glance: speed, crew, every part’s hit points, treasury')))
    .addSubcommand((sub) => whichShip(sub.setName('damage').setDescription('A part of the ship takes damage (under its threshold, none gets through)')
      .addStringOption((o) => o.setName('part').setDescription('hull, sails, helm, cannon 2…').setRequired(true).setAutocomplete(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('How much').setRequired(true).setMinValue(0).setMaxValue(99999))))
    .addSubcommand((sub) => whichShip(sub.setName('repair').setDescription('Repair a part of the ship')
      .addStringOption((o) => o.setName('part').setDescription('hull, sails, helm, cannon 2…').setRequired(true).setAutocomplete(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('How much').setRequired(true).setMinValue(0).setMaxValue(99999))))
    .addSubcommand((sub) => whichShip(sub.setName('treasury').setDescription('Put berries into the crew’s treasury or take them out')
      .addStringOption((o) => o.setName('change').setDescription('In or out').setRequired(true).addChoices({ name: 'put in', value: 'in' }, { name: 'take out', value: 'out' }))
      .addIntegerOption((o) => o.setName('amount').setDescription('How many berries').setRequired(true).setMinValue(0).setMaxValue(999_999_999_999))
      .addStringOption((o) => o.setName('why').setDescription('What for (goes in the ship’s log)').setMaxLength(80))))
    .addSubcommand((sub) => whichShip(sub.setName('aboard').setDescription('Set how many crew, passengers or rations are aboard')
      .addStringOption((o) => o.setName('what').setDescription('Which number').setRequired(true).addChoices({ name: 'crew working the ship', value: 'crew' }, { name: 'passengers', value: 'passengers' }, { name: 'rations', value: 'rations' }))
      .addIntegerOption((o) => o.setName('number').setDescription('The new number').setRequired(true).setMinValue(0).setMaxValue(99999)))),
].map((command) => command.toJSON());
