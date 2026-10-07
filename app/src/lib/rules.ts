import { indexRules, type OptionDef, type Rng, type RulesFile } from '@dndf/engine';
import bruiserFile from '../../../data/rules/dndf-10/bruiser.json';

/** Every public rules entry the app knows, by id. More files join in phase 3. */
export const rules = indexRules([bruiserFile as unknown as RulesFile]);

export const bruiserStyles = [...rules.values()].filter((e) => e.kind === 'subclass' && e.parent === 'class.bruiser');
export const furyOptions = (rules.get('optionGroup.bruiser_fury')?.options ?? []) as OptionDef[];

/** Dice use the browser's cryptographic random source. */
export const rng: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
