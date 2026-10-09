// The slash commands as Discord wants them described.
import { SlashCommandBuilder, type SlashCommandOptionsOnlyBuilder, type SlashCommandSubcommandBuilder } from 'discord.js';

const character = (b: SlashCommandOptionsOnlyBuilder) =>
  b.addStringOption((o) => o.setName('character').setDescription('Which of your characters (default: the one you changed last)').setAutocomplete(true));
const shown = (b: SlashCommandOptionsOnlyBuilder, what: string) =>
  b.addBooleanOption((o) => o.setName('private').setDescription(`Only you see ${what} (default: everyone in the channel does)`));

const whichShip = (b: SlashCommandSubcommandBuilder) =>
  b.addStringOption((o) => o.setName('ship').setDescription('Which ship (default: your campaign’s, or the one changed last)').setAutocomplete(true))
    .addBooleanOption((o) => o.setName('private').setDescription('Only you see it (default: everyone in the channel does)'));

const whose = (b: SlashCommandSubcommandBuilder) =>
  b.addStringOption((o) => o.setName('character').setDescription('Which of your characters (default: the one you changed last)').setAutocomplete(true))
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
  new SlashCommandBuilder().setName('item').setDescription('What your character carries')
    .addSubcommand((sub) => whose(sub.setName('list').setDescription('Everything your character carries')))
    .addSubcommand((sub) => whose(sub.setName('add').setDescription('Add something from the book’s armory, or a plain item of your own')
      .addStringOption((o) => o.setName('name').setDescription('Pick from the armory as you type, or write any name').setRequired(true).setAutocomplete(true).setMaxLength(80))
      .addIntegerOption((o) => o.setName('quantity').setDescription('How many (default 1)').setMinValue(1).setMaxValue(9999))
      .addNumberOption((o) => o.setName('weight').setDescription('Weight of one, in pounds').setMinValue(0).setMaxValue(99999))
      .addStringOption((o) => o.setName('notes').setDescription('A note to keep with it').setMaxLength(300))))
    .addSubcommand((sub) => whose(sub.setName('make').setDescription('Make an item of your own that works on the sheet')
      .addStringOption((o) => o.setName('kind').setDescription('What it is').setRequired(true).addChoices(
        { name: 'weapon', value: 'weapon' }, { name: 'armor', value: 'armor' }, { name: 'shield', value: 'shield' },
        { name: 'something with powers', value: 'wondrous' }, { name: 'something you use up', value: 'consumable' }, { name: 'plain gear', value: 'gear' }))
      .addStringOption((o) => o.setName('name').setDescription('What it is called').setRequired(true).setMaxLength(80))
      .addStringOption((o) => o.setName('description').setDescription('What it is and does, in your words').setMaxLength(1500))
      .addStringOption((o) => o.setName('damage').setDescription('Weapon: damage dice, like 1d8').setMaxLength(8))
      .addStringOption((o) => o.setName('damage_type').setDescription('Weapon: slashing, piercing, bludgeoning, fire…').setMaxLength(30))
      .addBooleanOption((o) => o.setName('martial').setDescription('Weapon: a martial weapon (default: simple)'))
      .addBooleanOption((o) => o.setName('ranged').setDescription('Weapon: ranged (uses Dexterity)'))
      .addBooleanOption((o) => o.setName('finesse').setDescription('Weapon: finesse (Strength or Dexterity, whichever is better)'))
      .addIntegerOption((o) => o.setName('weapon_bonus').setDescription('Weapon: its own bonus to hit and damage, like 1 for a +1 weapon').setMinValue(-10).setMaxValue(10))
      .addIntegerOption((o) => o.setName('armor_class').setDescription('Armor: its base Armor Class').setMinValue(0).setMaxValue(40))
      .addStringOption((o) => o.setName('armor_dex').setDescription('Armor: how much Dexterity is added (default: all of it)').addChoices({ name: 'all of it (light)', value: 'full' }, { name: 'up to +2 (medium)', value: 'max2' }, { name: 'none (heavy)', value: 'none' }))
      .addIntegerOption((o) => o.setName('ac_bonus').setDescription('Armor Class it adds while in use (a shield’s own +2 is already counted)').setMinValue(-20).setMaxValue(20))
      .addIntegerOption((o) => o.setName('speed_bonus').setDescription('Feet of speed it adds while in use').setMinValue(-100).setMaxValue(100))
      .addIntegerOption((o) => o.setName('hp_bonus').setDescription('Hit point maximum it adds while in use').setMinValue(-100).setMaxValue(100))
      .addIntegerOption((o) => o.setName('charges').setDescription('How many charges it has').setMinValue(1).setMaxValue(999))
      .addStringOption((o) => o.setName('recharge').setDescription('When the charges come back (default: long rest)').addChoices({ name: 'long rest', value: 'long' }, { name: 'short rest', value: 'short' }))
      .addStringOption((o) => o.setName('roll').setDescription('Dice it rolls, like 2d6+3').setMaxLength(30))
      .addStringOption((o) => o.setName('roll_is').setDescription('What that roll is').addChoices({ name: 'damage', value: 'damage' }, { name: 'healing', value: 'heal' }, { name: 'temporary hit points', value: 'tempHp' }, { name: 'something else', value: 'other' }))
      .addStringOption((o) => o.setName('effect').setDescription('A standing effect, like: Resistance to cold damage').setMaxLength(200))
      .addStringOption((o) => o.setName('rarity').setDescription('How rare it is').addChoices(...['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Mythical'].map((r) => ({ name: r, value: r }))))
      .addIntegerOption((o) => o.setName('quantity').setDescription('How many (default 1)').setMinValue(1).setMaxValue(9999))
      .addNumberOption((o) => o.setName('weight').setDescription('Weight of one, in pounds').setMinValue(0).setMaxValue(99999))
      .addBooleanOption((o) => o.setName('use_now').setDescription('Put it to use straight away'))))
    .addSubcommand((sub) => whose(sub.setName('use').setDescription('Put an item you made to use, or put it away')
      .addStringOption((o) => o.setName('item').setDescription('Which item').setRequired(true).setAutocomplete(true))
      .addBooleanOption((o) => o.setName('put_away').setDescription('Put it away instead (default: put it to use)'))))
    .addSubcommand((sub) => whose(sub.setName('remove').setDescription('Remove an item, or some of it')
      .addStringOption((o) => o.setName('item').setDescription('Which item').setRequired(true).setAutocomplete(true))
      .addIntegerOption((o) => o.setName('quantity').setDescription('How many to remove (default: all of it)').setMinValue(1).setMaxValue(9999)))),
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
