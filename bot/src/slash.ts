// The slash commands as Discord wants them described.
import { SlashCommandBuilder, type SlashCommandOptionsOnlyBuilder, type SlashCommandSubcommandBuilder } from 'discord.js';

const character = (b: SlashCommandOptionsOnlyBuilder) =>
  b.addStringOption((o) => o.setName('character').setDescription('Which of your characters (default: the one you changed last)').setAutocomplete(true));
const shown = (b: SlashCommandOptionsOnlyBuilder, what: string) =>
  b.addBooleanOption((o) => o.setName('private').setDescription(`Only you see ${what} (default: everyone in the channel does)`));

const whichShip = (b: SlashCommandSubcommandBuilder) =>
  b.addStringOption((o) => o.setName('ship').setDescription('Which ship (default: your campaign’s, or the one changed last)').setAutocomplete(true))
    .addBooleanOption((o) => o.setName('private').setDescription('Only you see it (default: everyone in the channel does)'));

const ABILITY_CHOICES = [['Strength', 'str'], ['Dexterity', 'dex'], ['Constitution', 'con'], ['Intelligence', 'int'], ['Wisdom', 'wis'], ['Charisma', 'cha']].map(([name, value]) => ({ name: name!, value: value! }));
/** The 18 skills, by the ids the engine uses. */
const SKILL_CHOICES = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival']
  .map((name) => ({ name, value: name.toLowerCase().replace(/ /g, '_') }));
// /make: what every kind of item has, then its powers. A subcommand holds 25 options at most, so a
// weapon (which has seven of its own) leaves out the bonuses that a worn thing is more likely to have.
const named = (b: SlashCommandSubcommandBuilder) => b
  .addStringOption((o) => o.setName('name').setDescription('What it is called').setRequired(true).setMaxLength(80))
  .addStringOption((o) => o.setName('description').setDescription('What it is and does, in your words').setMaxLength(1500));
const powers = (b: SlashCommandSubcommandBuilder, armorClass: boolean) => {
  if (armorClass) b.addIntegerOption((o) => o.setName('ac_bonus').setDescription('Armor Class it adds (a shield’s own +2 is already counted)').setMinValue(-20).setMaxValue(20));
  return b
    .addStringOption((o) => o.setName('ability').setDescription('An ability score it changes').addChoices(...ABILITY_CHOICES))
    .addIntegerOption((o) => o.setName('ability_becomes').setDescription('It becomes this if lower (19 for a Circlet of Intellect)').setMinValue(1).setMaxValue(30))
    .addIntegerOption((o) => o.setName('ability_bonus').setDescription('Or it goes up by this').setMinValue(-20).setMaxValue(20))
    .addIntegerOption((o) => o.setName('charges').setDescription('How many charges it has').setMinValue(1).setMaxValue(999))
    .addStringOption((o) => o.setName('recharge').setDescription('When the charges come back (default: long rest)').addChoices({ name: 'long rest', value: 'long' }, { name: 'short rest', value: 'short' }))
    .addStringOption((o) => o.setName('roll').setDescription('Dice it rolls, like 2d6+3').setMaxLength(30))
    .addStringOption((o) => o.setName('roll_is').setDescription('What that roll is').addChoices({ name: 'damage', value: 'damage' }, { name: 'healing', value: 'heal' }, { name: 'temporary hit points', value: 'tempHp' }, { name: 'something else', value: 'other' }))
    .addStringOption((o) => o.setName('effect').setDescription('A standing effect, like: Resistance to cold damage').setMaxLength(200));
};
const extras = (b: SlashCommandSubcommandBuilder) => b
  .addIntegerOption((o) => o.setName('save_bonus').setDescription('Bonus to every saving throw while in use').setMinValue(-20).setMaxValue(20))
  .addStringOption((o) => o.setName('skill').setDescription('A skill it helps (leave out for every skill)').setAutocomplete(true))
  .addIntegerOption((o) => o.setName('skill_bonus').setDescription('Bonus to that skill, or to every skill, while in use').setMinValue(-20).setMaxValue(20))
  .addIntegerOption((o) => o.setName('speed_bonus').setDescription('Feet of speed it adds while in use').setMinValue(-100).setMaxValue(100))
  .addIntegerOption((o) => o.setName('hp_bonus').setDescription('Hit point maximum it adds while in use').setMinValue(-100).setMaxValue(100))
  .addStringOption((o) => o.setName('spells').setDescription('Spells it lets you cast, separated by commas').setMaxLength(300));
const tail = (b: SlashCommandSubcommandBuilder) => b
  .addBooleanOption((o) => o.setName('attunement').setDescription('It requires attunement'))
  .addStringOption((o) => o.setName('rarity').setDescription('How rare it is').addChoices(...['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Mythical'].map((r) => ({ name: r, value: r }))))
  .addIntegerOption((o) => o.setName('quantity').setDescription('How many (default 1)').setMinValue(1).setMaxValue(9999))
  .addNumberOption((o) => o.setName('weight').setDescription('Weight of one, in pounds').setMinValue(0).setMaxValue(99999))
  .addBooleanOption((o) => o.setName('use_now').setDescription('Use it straight away (attuning too, if it needs that)'));

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
    .addSubcommand((sub) => whose(sub.setName('use').setDescription('Put an item to use or away, and attune to it')
      .addStringOption((o) => o.setName('item').setDescription('Which item').setRequired(true).setAutocomplete(true))
      .addBooleanOption((o) => o.setName('put_away').setDescription('Put it away instead (default: put it to use)'))
      .addStringOption((o) => o.setName('attune').setDescription('Attune to it, or end the attunement').addChoices({ name: 'attune to it', value: 'attune' }, { name: 'end the attunement', value: 'end' }))))
    .addSubcommand((sub) => whose(sub.setName('remove').setDescription('Remove an item, or some of it')
      .addStringOption((o) => o.setName('item').setDescription('Which item').setRequired(true).setAutocomplete(true))
      .addIntegerOption((o) => o.setName('quantity').setDescription('How many to remove (default: all of it)').setMinValue(1).setMaxValue(9999)))),
  // Its own command, not part of /item: Discord allows a command 8,000 characters of names, descriptions
  // and choices in all, and the six kinds of item with their options do not fit beside the rest of /item.
  new SlashCommandBuilder().setName('make').setDescription('Make an item of your own that works on the sheet')
    .addSubcommand((sub) => whose(tail(powers(named(sub.setName('weapon').setDescription('A weapon: it shows under Attacks with its own to-hit and damage'))
      .addStringOption((o) => o.setName('damage').setDescription('Damage dice, like 1d8').setMaxLength(8))
      .addStringOption((o) => o.setName('damage_type').setDescription('slashing, piercing, bludgeoning, fire…').setMaxLength(30))
      .addBooleanOption((o) => o.setName('martial').setDescription('A martial weapon (default: simple)'))
      .addBooleanOption((o) => o.setName('ranged').setDescription('Ranged (uses Dexterity)'))
      .addBooleanOption((o) => o.setName('finesse').setDescription('Finesse (Strength or Dexterity, whichever is better)'))
      .addBooleanOption((o) => o.setName('two_handed').setDescription('Two-handed'))
      .addIntegerOption((o) => o.setName('weapon_bonus').setDescription('Its own bonus to hit and damage, like 1 for a +1 weapon').setMinValue(-10).setMaxValue(10)), false))))
    .addSubcommand((sub) => whose(tail(powers(named(sub.setName('armor').setDescription('Armor: it sets Armor Class while it is worn'))
      .addIntegerOption((o) => o.setName('armor_class').setDescription('Its base Armor Class').setMinValue(0).setMaxValue(40))
      .addStringOption((o) => o.setName('armor_dex').setDescription('How much Dexterity is added (default: all of it)').addChoices({ name: 'all of it (light)', value: 'full' }, { name: 'up to +2 (medium)', value: 'max2' }, { name: 'none (heavy)', value: 'none' })), true))))
    .addSubcommand((sub) => whose(tail(extras(powers(named(sub.setName('shield').setDescription('A shield: +2 Armor Class while it is carried')), true)))))
    .addSubcommand((sub) => whose(tail(extras(powers(named(sub.setName('wondrous').setDescription('Something with powers: a ring, a circlet, a Dial')), true)))))
    .addSubcommand((sub) => whose(tail(extras(powers(named(sub.setName('consumable').setDescription('Something you use up: a potion, a Rumble Ball')), true)))))
    .addSubcommand((sub) => whose(named(sub.setName('gear').setDescription('Plain gear: carried and weighed, nothing more'))
      .addIntegerOption((o) => o.setName('quantity').setDescription('How many (default 1)').setMinValue(1).setMaxValue(9999))
      .addNumberOption((o) => o.setName('weight').setDescription('Weight of one, in pounds').setMinValue(0).setMaxValue(99999)))),
  new SlashCommandBuilder().setName('surge').setDescription('Spirit Surges: your Haki and advancements')
    .addSubcommand((sub) => whose(sub.setName('list').setDescription('Your Haki by Color and every Spirit Surge advancement you have')))
    .addSubcommand((sub) => whose(sub.setName('add').setDescription('Record an advancement from a Spirit Surge')
      .addStringOption((o) => o.setName('rarity').setDescription('How strong the Spirit Surge was').setRequired(true).addChoices(...['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary'].map((r) => ({ name: r, value: r }))))
      .addStringOption((o) => o.setName('advancement').setDescription('The Haki feature or advancement (pick from the list as you type)').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName('choice').setDescription('Strengthen Self: what goes up by 2').addChoices(...ABILITY_CHOICES, { name: 'Willpower (v10)', value: 'willpower' }))
      .addStringOption((o) => o.setName('skill').setDescription('Career Advancement: the skill').addChoices(...SKILL_CHOICES))
      .addStringOption((o) => o.setName('note').setDescription('What was chosen, for an advancement that leaves it open (a technique, a spell…)').setMaxLength(300))
      .addStringOption((o) => o.setName('reason').setDescription('What earned it, for the record').setMaxLength(200))
      .addStringOption((o) => o.setName('session').setDescription('Which session').setMaxLength(60))))
    .addSubcommand((sub) => whose(sub.setName('remove').setDescription('Take an advancement off again (the most recent one of that name)')
      .addStringOption((o) => o.setName('advancement').setDescription('Which advancement').setRequired(true).setAutocomplete(true)))),
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
