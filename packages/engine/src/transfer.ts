// Taking characters and ships out of the platform as a file, and bringing them back in: a backup,
// a way to hand a character to a friend, or to move one between a browser and an account.
//
// A file holds only what is in the saved document. A Devil Fruit is never in a character's document
// (it is read beside it, for those it has been granted to), so it is never in a file either. Pictures
// are not in the file: a character's own sheet background and a ship's maps and artwork stay behind.
import { normalizeDoc, type CharacterDoc } from './character';
import { normalizeShip, type ShipDoc } from './shipSheet';

export const EXPORT_FORMAT = 'dndf-platform';
/** Files larger than this are not read: nothing the platform writes comes close. */
export const IMPORT_MAX_BYTES = 5_000_000;
/** A file never brings in more than this many of each kind. */
export const IMPORT_MAX_ITEMS = 100;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: 1;
  /** When the file was made, as an ISO date and time. */
  exportedAt: string;
  characters: CharacterDoc[];
  ships: ShipDoc[];
}

/** A character as it goes into a file: the uploaded background picture is not in the file, so its reference is dropped. */
export function characterForExport(doc: CharacterDoc): CharacterDoc {
  if (doc.appearance?.background?.kind !== 'image') return doc;
  const { background: _picture, ...appearance } = doc.appearance;
  return { ...doc, appearance };
}

/** A ship as she goes into a file: without her pictures, which are kept apart from her. */
export function shipForExport(doc: ShipDoc): ShipDoc {
  return { ...doc, pictures: [], cover: undefined };
}

export function exportFile(items: { characters?: CharacterDoc[]; ships?: ShipDoc[] }, exportedAt: string): ExportFile {
  return { format: EXPORT_FORMAT, version: 1, exportedAt, characters: (items.characters ?? []).map(characterForExport), ships: (items.ships ?? []).map(shipForExport) };
}

/** "Going Merry" → "going-merry.dndf.json"; several things → "dndf-backup-2026-10-09.dndf.json". */
export function exportFileName(items: { characters?: CharacterDoc[]; ships?: ShipDoc[] }, exportedAt: string): string {
  const all = [...(items.characters ?? []), ...(items.ships ?? [])];
  const slug = all.length === 1 ? all[0]!.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) : '';
  return `${slug || `dndf-backup-${exportedAt.slice(0, 10)}`}.dndf.json`;
}

export interface Imported {
  characters: CharacterDoc[];
  ships: ShipDoc[];
  /** What was in the file but could not be used, in words for the player. */
  skipped: string[];
}

/**
 * Reads a file made by Export (or a single saved character or ship on its own). Everything in it is
 * put through the same checks as a save read from the database, so a damaged or hand-edited file can
 * bring in odd numbers but never something the sheet cannot open. Throws, with words for the player,
 * when the text is not one of these files at all.
 */
export function readExport(text: string): Imported {
  if (text.length > IMPORT_MAX_BYTES) throw new Error('That file is too big to be a DnDF export.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('That file is not a DnDF export: it could not be read as JSON.'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('That file is not a DnDF export.');
  const file = raw as Record<string, unknown>;
  const skipped: string[] = [];
  let characters: unknown[] = [];
  let ships: unknown[] = [];
  if (file.format === EXPORT_FORMAT) {
    if (typeof file.version === 'number' && file.version > 1) throw new Error('That file was made by a newer version of the platform than this one. Reload the site and try again.');
    characters = Array.isArray(file.characters) ? file.characters : [];
    ships = Array.isArray(file.ships) ? file.ships : [];
  } else if (file.schema === 1 && Array.isArray(file.classes)) characters = [file];
  else if (file.schema === 1 && Array.isArray(file.components)) ships = [file];
  else throw new Error('That file is not a DnDF export.');

  const limit = <T,>(list: T[], what: string) => {
    if (list.length > IMPORT_MAX_ITEMS) skipped.push(`Only the first ${IMPORT_MAX_ITEMS} ${what} were read; the file has ${list.length}.`);
    return list.slice(0, IMPORT_MAX_ITEMS);
  };
  const out: Imported = { characters: [], ships: [], skipped };
  limit(characters, 'characters').forEach((entry, i) => {
    const doc = normalizeDoc(entry);
    if (doc) out.characters.push(characterForExport(doc));
    else skipped.push(`Character ${i + 1} in the file is not a character this version can read.`);
  });
  limit(ships, 'ships').forEach((entry, i) => {
    const doc = normalizeShip(entry);
    if (doc) out.ships.push(shipForExport(doc));
    else skipped.push(`Ship ${i + 1} in the file is not a ship this version can read.`);
  });
  if (out.characters.length === 0 && out.ships.length === 0 && skipped.length === 0) throw new Error('That file has no characters or ships in it.');
  return out;
}
