// The System Reference Document 5.2.1 (the free 2024 fifth edition rules) as a shelf to look things up on.
// It is kept apart from the handbooks' rules (lib/rules.ts): DnDF characters are built on the handbooks,
// which follow the 2014 rules, so nothing here is ever offered when building a character or read by the sheet.
// The data is data/reference/srd-5.2, written by tools/extract/extract_srd52.py.

export type SrdBlock =
  | { t: 'h'; level: number; text: string; page: number }
  | { t: 'p' | 'stat'; text: string; lead?: string; page: number }
  | { t: 'table'; title?: string; rows: string[][]; wide?: true; head?: false; over?: { text: string; from: number; to: number }[]; notes?: string[]; page: number }
  | { t: 'facts'; rows: [string, string][]; page: number }
  | { t: 'abilities'; rows: [string, string, string, string][]; page: number }
  | { t: 'sidebar'; title: string; text: string; page: number };

export type SrdKind = 'section' | 'class' | 'background' | 'species' | 'feat' | 'gear' | 'spell' | 'term' | 'magicItem' | 'monster';

export interface SrdEntry {
  id: string;
  name: string;
  kind: SrdKind;
  page: number;
  /** The first-level heading it stands under ("Spell Descriptions"). */
  section?: string;
  /** The heading it is grouped by ("Origin Feats", "Goblins"). */
  group?: string;
  /** The line under its name: "Level 3 Evocation (Sorcerer, Wizard)", "Small Fey (Goblinoid), Chaotic Neutral". */
  subtitle?: string;
  blocks: SrdBlock[];
}

export interface SrdChapter {
  $note: string;
  book: string;
  chapter: string;
  page: number;
  entries: SrdEntry[];
}

export interface SrdLibrary {
  book: string;
  /** The attribution the licence asks for, as the data files carry it. */
  note: string;
  chapters: SrdChapter[];
  byId: Map<string, SrdEntry>;
  chapterOf: Map<string, string>;
}

export const SRD52_BOOK = '5e SRD 5.2.1';
export const SRD52_NAME = 'System Reference Document 5.2.1';

export const SRD_KIND_LABEL: Record<SrdKind, string> = {
  section: 'Rules',
  class: 'Class',
  background: 'Background',
  species: 'Species',
  feat: 'Feat',
  gear: 'Gear',
  spell: 'Spell',
  term: 'Rules term',
  magicItem: 'Magic item',
  monster: 'Monster',
};

/** The chapters in the book's own order, with every entry findable by its id. */
export function buildLibrary(chapters: SrdChapter[]): SrdLibrary {
  const ordered = [...chapters].sort((a, b) => a.page - b.page);
  const byId = new Map<string, SrdEntry>();
  const chapterOf = new Map<string, string>();
  for (const chapter of ordered) {
    for (const entry of chapter.entries) {
      byId.set(entry.id, entry);
      chapterOf.set(entry.id, chapter.chapter);
    }
  }
  return { book: ordered[0]?.book ?? SRD52_BOOK, note: ordered[0]?.$note ?? '', chapters: ordered, byId, chapterOf };
}

export interface SrdHit {
  id: string;
  title: string;
  /** What kind of thing it is and where it stands: "Spell · Level 3 Evocation (Sorcerer, Wizard)". */
  where: string;
  page: number;
  /** For a hit inside the words: the words around it. */
  snippet?: string;
}

const plain = (text: string) => text.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();

function blockWords(block: SrdBlock): string {
  if (block.t === 'table') return [block.title ?? '', ...block.rows.flat(), ...(block.notes ?? [])].join(' ');
  if (block.t === 'facts') return block.rows.map(([name, value]) => `${name}: ${value}`).join(' ');
  if (block.t === 'abilities') return '';
  if (block.t === 'sidebar') return `${block.title} ${block.text}`;
  return block.text;
}

/**
 * Finds things by name: entries first (a name that starts with the words before one that only contains
 * them), then the headings inside entries (a class's "Level 5: Extra Attack", a stat block inside a spell).
 * With `words`, the text itself is searched too and each hit shows the words around it.
 */
export function searchSrd(library: SrdLibrary, query: string, options: { words?: boolean; limit?: number } = {}): SrdHit[] {
  const q = plain(query);
  if (q.length < 2) return [];
  const limit = options.limit ?? 60;
  const starts: SrdHit[] = [];
  const contains: SrdHit[] = [];
  const headings: SrdHit[] = [];
  const inside: SrdHit[] = [];
  for (const chapter of library.chapters) {
    for (const entry of chapter.entries) {
      const kind = SRD_KIND_LABEL[entry.kind];
      const where = [kind, entry.subtitle ?? entry.group ?? (entry.kind === 'section' ? chapter.chapter : '')].filter(Boolean).join(' · ');
      const name = plain(entry.name);
      const named = name.includes(q);
      if (named) (name.startsWith(q) ? starts : contains).push({ id: entry.id, title: entry.name, where, page: entry.page });
      let quoted = named;
      for (const block of entry.blocks) {
        if (block.t === 'h' && plain(block.text).includes(q)) {
          headings.push({ id: entry.id, title: block.text, where: `${kind} · ${entry.name}`, page: block.page });
          quoted = true;
        } else if (options.words && !quoted && inside.length < limit) {
          const words = blockWords(block);
          const at = words.toLowerCase().indexOf(query.trim().toLowerCase());
          if (at >= 0) {
            const from = Math.max(0, words.lastIndexOf(' ', Math.max(0, at - 50)));
            const snippet = `${from > 0 ? '…' : ''}${words.slice(from, at + query.trim().length + 70).trim()}${at + query.trim().length + 70 < words.length ? '…' : ''}`;
            inside.push({ id: entry.id, title: entry.name, where, page: block.page || entry.page, snippet });
            quoted = true; // one hit an entry is enough
          }
        }
      }
    }
  }
  return [...starts, ...contains, ...headings, ...inside].slice(0, limit);
}

/** A monster's challenge rating as its stat block prints it ("1/4"), for the list. */
export function challengeOf(entry: SrdEntry): string {
  for (const block of entry.blocks) {
    if (block.t === 'stat' && block.lead === 'CR') return block.text.replace(/^CR\s+/, '').replace(/\s*\(.*$/, '');
  }
  return '';
}

/** The headings inside a long entry (a class's features and subclass), for jumping to. */
export function outlineOf(entry: SrdEntry): { index: number; text: string; level: number }[] {
  return entry.blocks.flatMap((block, index) => (block.t === 'h' && block.level <= 3 ? [{ index, text: block.text, level: block.level }] : []));
}
