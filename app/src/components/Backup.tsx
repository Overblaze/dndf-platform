// Export to a file and import from one: a backup, or a way to move a character or a ship between
// a browser and an account, or hand one to a friend.
import { exportFile, exportFileName, readExport, IMPORT_MAX_BYTES, type CharacterDoc, type ShipDoc } from '@dndf/engine';
import { useRef, useState } from 'react';

/** Hands the browser a file to save. Nothing leaves the device. */
export function downloadExport(items: { characters?: CharacterDoc[]; ships?: ShipDoc[] }): void {
  const at = new Date().toISOString();
  const blob = new Blob([JSON.stringify(exportFile(items, at), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(items, at);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type Kind = 'characters' | 'ships';
const WORDS: Record<Kind, { one: string; many: string; other: Kind; otherPage: string }> = {
  characters: { one: 'character', many: 'characters', other: 'ships', otherPage: 'the Ship page' },
  ships: { one: 'ship', many: 'ships', other: 'characters', otherPage: 'the Sheet page' },
};
const count = (n: number, kind: Kind) => `${n} ${n === 1 ? WORDS[kind].one : WORDS[kind].many}`;

/**
 * The backup card on a list page. `add` saves one imported thing as a new one: an import never
 * replaces or changes anything already there.
 */
export function Backup<T extends CharacterDoc | ShipDoc>({ kind, mine, add, onDone }: { kind: Kind; mine: T[]; add: (doc: T) => Promise<unknown>; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const words = WORDS[kind];

  const read = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setDone(null); setProblem(null);
    try {
      if (file.size > IMPORT_MAX_BYTES) throw new Error('That file is too big to be a DnDF export.');
      const found = readExport(await file.text());
      const wanted = found[kind] as T[];
      const notes = [...found.skipped];
      let added = 0;
      for (const doc of wanted) {
        try { await add(doc); added++; } catch (e) { notes.push(`${doc.name} was not saved: ${(e as Error).message}`); }
      }
      const other = found[words.other].length;
      if (other) notes.push(`The file also has ${count(other, words.other)}: import ${other === 1 ? 'it' : 'them'} from ${words.otherPage}.`);
      if (added) { setDone(`Imported ${count(added, kind)}: ${wanted.slice(0, 5).map((d) => d.name).join(', ')}${wanted.length > 5 ? '…' : ''}. ${kind === 'ships' ? 'Maps and artwork are not in a file, so add them again.' : 'Nothing you already had was changed.'}`); onDone(); }
      else if (!other && !notes.length) notes.push(`That file has no ${words.many} in it.`);
      setProblem(notes.length ? notes.join(' ') : null);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <section className="card">
      <h2>Backup</h2>
      <input ref={input} type="file" accept=".json,application/json" hidden aria-label={`Choose a file to import ${words.many} from`} onChange={(e) => void read(e.target.files?.[0])} />
      <div className="row wrap">
        <button className="btn" disabled={mine.length === 0} onClick={() => downloadExport({ [kind]: mine })}>Export {mine.length > 1 ? `all ${mine.length} ${words.many}` : mine.length === 1 ? `your ${words.one}` : `your ${words.many}`} to a file</button>
        <button className="btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Reading…' : 'Import from a file'}</button>
      </div>
      {done && <p className="notice" role="status">{done} <button className="btn" onClick={() => setDone(null)}>OK</button></p>}
      {problem && <p className="notice" role="alert">{problem} <button className="btn" onClick={() => setProblem(null)}>OK</button></p>}
      <p className="page-ref">
        A file is a copy to keep, or to hand to a friend. Importing always adds new {words.many}; it never replaces one you have.{' '}
        {kind === 'characters' ? 'A Devil Fruit and an uploaded sheet background are not in the file.' : 'Her maps and artwork are not in the file.'}
      </p>
    </section>
  );
}
