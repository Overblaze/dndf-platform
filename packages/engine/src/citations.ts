// Book names and their short forms, used wherever a page number is shown.
import type { RulesVersion } from './types';

/** The handbook each rules version is built from. */
export const HANDBOOKS: Record<RulesVersion, string> = {
  'dndf-10': 'DnDF Expanded Handbook v10',
  'dndf-8.8': 'DnDF Expanded Handbook v8.8',
};

export const BOOK_ABBREVIATIONS: Record<string, string> = {
  'DnDF Expanded Handbook v10': 'EH10',
  'DnDF Expanded Handbook v8.8': 'EH8.8',
  'Expanded Devil Fruit Encyclopedia v1.2': 'EDFE',
  'Original Devil Fruit Encyclopedia': 'DFE',
  'DnDF DM Guide': 'DMG',
  'Original DnDF PHB': 'PHB',
  "Volo's Guide to Monsters": 'VGM',
  '5e SRD 5.1': 'SRD',
};

/** "EH10" for the v10 Expanded Handbook; a book without a short form keeps its name. */
export function bookAbbreviation(book: string): string {
  return BOOK_ABBREVIATIONS[book] ?? book;
}

/** A page reference with its book: "EH10 p.86". */
export function cite(book: string | undefined, page: number): string {
  return book ? `${bookAbbreviation(book)} p.${page}` : `p.${page}`;
}

/** Pages of general rules that sit on different pages in the two handbooks. */
export const GENERAL_PAGES: Record<RulesVersion, { proficiency: number; multiclassing: number; devilFruitDc: number }> = {
  'dndf-10': { proficiency: 209, multiclassing: 209, devilFruitDc: 242 },
  'dndf-8.8': { proficiency: 208, multiclassing: 208, devilFruitDc: 239 },
};
