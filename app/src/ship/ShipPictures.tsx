// A ship's maps and artwork: thumbnails on the sheet, a closer look in a dialog, and one picture
// the crew can put at the top of her sheet.
import { SHIP_PICTURES_MAX, type ShipPicture } from '@dndf/engine';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { prepareShipPicture, type ShipPictureStore } from '../lib/shipPictures';

const KIND_NAMES: Record<ShipPicture['kind'], string> = { map: 'Map', art: 'Artwork' };

/** The URL to show for a stored picture: undefined while it is fetched, null if it is gone. */
function usePictureUrl(store: ShipPictureStore, ref: string): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    setUrl(undefined);
    store.url(ref).then((found) => current && setUrl(found), () => current && setUrl(null));
    return () => { current = false; };
  }, [store, ref]);
  return url;
}

const describe = (p: ShipPicture) => p.title ?? KIND_NAMES[p.kind];

function Picture({ store, picture, className }: { store: ShipPictureStore; picture: ShipPicture; className?: string }) {
  const url = usePictureUrl(store, picture.ref);
  if (url === undefined) return <span className="picture-wait">Loading…</span>;
  if (url === null) return <span className="picture-wait">{navigator.onLine === false ? 'Pictures need a connection.' : 'This picture can’t be found. It may have been added in another browser while signed out.'}</span>;
  return <img className={className} src={url} alt={describe(picture)} width={picture.width} height={picture.height} loading="lazy" />;
}

/** The picture the crew chose for the top of the sheet. */
export function ShipCover({ store, picture, onOpen }: { store: ShipPictureStore; picture: ShipPicture; onOpen: () => void }) {
  return (
    <button className="ship-cover" onClick={onOpen} aria-label={`Look at ${describe(picture)}`}>
      <Picture store={store} picture={picture} />
    </button>
  );
}

/** One picture, close up: its title, what it is, whether it sits at the top of the sheet, and taking it down. */
export function PictureDialog({ store, picture, isCover, onSave, onCover, onRemove, onClose }: {
  store: ShipPictureStore; picture: ShipPicture; isCover: boolean;
  onSave: (next: ShipPicture) => void; onCover: (on: boolean) => void; onRemove: () => void; onClose: () => void;
}) {
  const url = usePictureUrl(store, picture.ref);
  const [full, setFull] = useState(false);
  const [title, setTitle] = useState(picture.title ?? '');
  const [asking, setAsking] = useState(false);
  const save = (next: Partial<ShipPicture>) => onSave({ ...picture, title: title.trim() || undefined, ...next });
  return (
    <Dialog title={describe(picture)} onClose={() => { if (title.trim() !== (picture.title ?? '')) save({}); onClose(); }}>
      <div className={full ? 'picture-view picture-full' : 'picture-view'}>
        <Picture store={store} picture={picture} />
      </div>
      <div className="row wrap">
        <button className="btn" onClick={() => setFull(!full)} aria-pressed={full}>{full ? 'Fit to the screen' : 'Full size (drag to look around)'}</button>
        {url && <a className="btn" href={url} target="_blank" rel="noreferrer">Open on its own</a>}
      </div>
      <div className="grid-2">
        <label className="field"><span className="label">Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => save({})} placeholder="Main deck" maxLength={80} /></label>
        <label className="field">
          <span className="label">What it is</span>
          <select value={picture.kind} onChange={(e) => save({ kind: e.target.value as ShipPicture['kind'] })}>
            <option value="map">Map</option>
            <option value="art">Artwork</option>
          </select>
        </label>
      </div>
      <label className="check"><input type="checkbox" checked={isCover} onChange={(e) => onCover(e.target.checked)} /> Show it at the top of her sheet</label>
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => { save({}); onClose(); }}>Done</button>
        {asking
          ? <><button className="btn btn-damage" onClick={onRemove}>Yes, take it down</button><button className="btn" onClick={() => setAsking(false)}>Keep it</button></>
          : <button className="btn btn-damage" onClick={() => setAsking(true)}>Take it down…</button>}
      </div>
    </Dialog>
  );
}

/** The card on the sheet: maps first, then artwork, and adding more. */
export function ShipPicturesCard({ store, shipId, pictures, cover, shared, onAdd, onOpen }: {
  store: ShipPictureStore; shipId: string; pictures: ShipPicture[]; cover?: string; shared: boolean;
  onAdd: (added: ShipPicture[]) => void; onOpen: (picture: ShipPicture) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const kind = useRef<ShipPicture['kind']>('map');
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const room = SHIP_PICTURES_MAX - pictures.length;

  const add = async (files: FileList | null) => {
    const chosen = [...(files ?? [])];
    if (!chosen.length) return;
    setProblem(null);
    const added: ShipPicture[] = [];
    const failed: string[] = [];
    for (const [i, file] of chosen.slice(0, room).entries()) {
      setBusy(chosen.length > 1 ? `Adding ${i + 1} of ${Math.min(chosen.length, room)}…` : 'Adding…');
      try {
        const prepared = await prepareShipPicture(file);
        const ref = await store.upload(shipId, prepared.blob);
        added.push({ id: crypto.randomUUID(), ref, kind: kind.current, title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 80) || undefined, width: prepared.width, height: prepared.height });
      } catch (e) { failed.push(`${file.name}: ${(e as Error).message}`); }
    }
    if (chosen.length > room) failed.push(`A ship keeps ${SHIP_PICTURES_MAX} pictures, so ${chosen.length - room} were left out.`);
    if (added.length) onAdd(added);
    setBusy(null);
    setProblem(failed.length ? failed.join(' ') : null);
    if (input.current) input.current.value = '';
  };
  const pick = (which: ShipPicture['kind']) => { kind.current = which; input.current?.click(); };
  const ordered = [...pictures.filter((p) => p.kind === 'map'), ...pictures.filter((p) => p.kind === 'art')];

  return (
    <section className="card">
      <h2>Map and artwork</h2>
      {pictures.length === 0 && <p className="soft">No pictures yet. Add her deck plan, a cutaway, or a painting of her.</p>}
      {problem && <p className="notice" role="alert">{problem} <button className="btn" onClick={() => setProblem(null)}>OK</button></p>}
      <div className="picture-grid">
        {ordered.map((picture) => (
          <button key={picture.id} className="picture-thumb" onClick={() => onOpen(picture)} aria-label={`Look at ${describe(picture)}`}>
            <Picture store={store} picture={picture} />
            <span className="picture-caption">
              <span className="resource-name">{describe(picture)}</span>
              <span className="page-ref">{[KIND_NAMES[picture.kind], picture.id === cover ? 'top of the sheet' : ''].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        ))}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden aria-label="Choose pictures" onChange={(e) => void add(e.target.files)} />
      <div className="row wrap">
        <button className="btn btn-primary" disabled={Boolean(busy) || room <= 0} onClick={() => pick('map')}>{busy ?? 'Add a map'}</button>
        <button className="btn" disabled={Boolean(busy) || room <= 0} onClick={() => pick('art')}>Add artwork</button>
      </div>
      <p className="page-ref">
        {room <= 0 ? `She has ${SHIP_PICTURES_MAX} pictures, which is all a ship keeps; take one down to add another. ` : ''}
        Pictures are shrunk to 2,560 pixels on the long side and saved as JPEGs. {shared ? 'Everyone in her campaign can see them, add to them and take them down; nobody outside it can.' : 'Only you can see them.'}
      </p>
    </section>
  );
}
