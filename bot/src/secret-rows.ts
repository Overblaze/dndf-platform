// Turning the private rules files (~/dndf/secret/*.json) into rows of the secret_entries table.
// Plain functions, so the shape of a row can be tested with made-up entries: no real private
// content is ever in the repository or its tests.

export type Audience = 'grant' | 'holders' | 'dm';

export interface SecretRow {
  key: string;
  id: string;
  kind: string;
  name: string;
  book: string;
  versions: string[];
  audience: Audience;
  data: unknown;
}

interface Entry {
  id?: unknown;
  kind?: unknown;
  name?: unknown;
  versions?: unknown;
  source?: { book?: unknown };
  [field: string]: unknown;
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Who may read an entry.
 *   A Devil Fruit: only a player it is granted to.
 *   A fruit advancement, and the encyclopedia's rules for fruit users: any player who holds a fruit.
 *   Everything else private (DM chapters, the tables fruits are generated from): DMs only.
 * Anything this does not recognise is DM-only, so a new kind of file can never be opened to players by accident.
 */
export function audienceOf(kind: string, file: string): Audience {
  if (kind === 'devilFruit' || kind === 'beast') return 'grant';
  if (kind === 'fruitAdvancement') return 'holders';
  if (/^encyclopedia_(fruit_rules|fruit_advancements|encyclopedia_spells)\.json$/.test(file)) return 'holders';
  return 'dm';
}

/** One row for one entry of one file, or the reason it cannot be a row. */
export function secretRow(entry: Entry, file: string): SecretRow | string {
  if (typeof entry.id !== 'string' || !entry.id) return 'no id';
  if (typeof entry.kind !== 'string' || !entry.kind) return `${entry.id}: no kind`;
  const book = typeof entry.source?.book === 'string' && entry.source.book ? entry.source.book : null;
  if (!book) return `${entry.id}: no source book`;
  return {
    // The same fruit is written up in more than one book: the book is part of what identifies a row.
    key: `${entry.id}@${slug(book)}`,
    id: entry.id,
    kind: entry.kind,
    name: typeof entry.name === 'string' && entry.name ? entry.name : entry.id,
    book,
    versions: Array.isArray(entry.versions) ? entry.versions.filter((v): v is string => typeof v === 'string') : [],
    audience: audienceOf(entry.kind, file),
    data: entry,
  };
}

/** Every file's rows, with what could not be used and any two entries that would land on one key. */
export function secretRows(files: { file: string; entries: Entry[] }[]): { rows: SecretRow[]; skipped: string[]; clashes: string[] } {
  const rows = new Map<string, SecretRow>();
  const skipped: string[] = [];
  const clashes: string[] = [];
  for (const { file, entries } of files) {
    for (const entry of entries) {
      const row = secretRow(entry, file);
      if (typeof row === 'string') skipped.push(`${file}: ${row}`);
      else if (rows.has(row.key)) clashes.push(`${row.key} (again in ${file})`);
      else rows.set(row.key, row);
    }
  }
  return { rows: [...rows.values()], skipped, clashes };
}
