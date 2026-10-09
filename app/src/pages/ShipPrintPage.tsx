import { SHIP_ABILITIES, UPGRADE_SOURCES, cite, deriveShip, exactBerries, signed, type ShipDoc, type ShipPicture, type ShipSheet } from '@dndf/engine';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ruleSet } from '../lib/rules';
import { shipPicturesFor, type ShipPictureStore } from '../lib/shipPictures';
import { shipStoreFor } from '../lib/ships';

const BOOK = 'DnDF DM Guide';
const ROLE_NAMES = { hull: 'Hull', control: 'Control', movement: 'Movement', weapon: 'Weapon', other: 'Other' } as const;
const rule = (id: string) => ruleSet('dndf-10').rules.get(id);

function PrintedPicture({ store, picture }: { store: ShipPictureStore; picture: ShipPicture }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    store.url(picture.ref).then((found) => current && setUrl(found), () => current && setUrl(null));
    return () => { current = false; };
  }, [store, picture.ref]);
  if (!url) return url === null ? <p className="print-small">{picture.title ?? 'A picture'} could not be found.</p> : null;
  return (
    <figure className="print-picture">
      <img src={url} alt={picture.title ?? (picture.kind === 'map' ? 'Map' : 'Artwork')} width={picture.width} height={picture.height} />
      {picture.title && <figcaption>{picture.title}</figcaption>}
    </figure>
  );
}

function Paper({ doc, sheet, pictures, withPictures }: { doc: ShipDoc; sheet: ShipSheet; pictures: ShipPictureStore; withPictures: boolean }) {
  const ordered = [...doc.pictures.filter((p) => p.kind === 'map'), ...doc.pictures.filter((p) => p.kind === 'art')];
  return (
    <article className="paper">
      <header className="print-head">
        <div>
          <h1>{sheet.name}</h1>
          <p>{sheet.summary}</p>
        </div>
        <p className="print-meta">Worth {exactBerries(sheet.worth.value)} · {sheet.slots.used} of {sheet.slots.total} upgrade slots</p>
      </header>

      <section className="print-vitals">
        {[
          ['Speed', `${sheet.speed.value} ft`], ['Pace', `${doc.pace.mph} mph`], ['Crew', `____ / ${sheet.crew.max}`], ['Passengers', `____ / ${sheet.crew.passengerMax}`],
          ['Cargo', `____ / ${sheet.cargo.capacity} t`], ['Rations', '____'], ['Treasury', '฿ ________'], ['Soul', `${sheet.soul.points} / 3`],
        ].map(([label, value]) => (
          <div key={label} className="print-box"><span>{label}</span><b>{value}</b></div>
        ))}
      </section>
      <p className="print-small">
        {SHIP_ABILITIES.map((a) => `${a.toUpperCase()} ${sheet.abilities[a].score} (${sheet.abilities[a].autoFail ? 'fails' : signed(sheet.abilities[a].mod)})`).join(' · ')}
        {' · '}a score of 0 fails every check and save · {cite(BOOK, 11)}
      </p>

      <section>
        <h2>Components</h2>
        <table className="print-table">
          <thead><tr><th>Part</th><th>Kind</th><th>AC</th><th>Hit points</th><th>Threshold</th><th>Speed</th></tr></thead>
          <tbody>
            {sheet.components.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td><td>{ROLE_NAMES[c.role]}</td><td>{c.ac ?? ''}</td>
                <td>{c.maxHp !== undefined ? `____ / ${c.maxHp}${c.damage ? ` (now ${c.hp})` : ''}` : ''}</td>
                <td>{c.threshold ?? ''}</td><td>{c.speed !== undefined ? `${c.speed} ft` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="print-small">Damage under a part’s threshold does nothing; at or over it, all of it counts · {cite(BOOK, 13)}. With {Math.floor(doc.crewMax / 2)} crew or fewer she is short-handed: half speed, half her weapons.</p>
      </section>

      {sheet.components.some((c) => c.text) && (
        <section className="print-features">
          <h2>What her parts do</h2>
          {sheet.components.filter((c) => c.text).map((c) => (
            <div key={c.id} className="print-feature"><p><b>{c.name}</b></p><p className="print-text">{c.text}</p></div>
          ))}
        </section>
      )}

      {doc.upgrades.length > 0 && (
        <section>
          <h2>Upgrades</h2>
          <table className="print-table">
            <thead><tr><th>Upgrade</th><th>Slots</th><th>How she came by it</th><th>Notes</th></tr></thead>
            <tbody>
              {doc.upgrades.map((u) => {
                const entry = u.entry ? rule(u.entry) : undefined;
                return (
                  <tr key={u.id}>
                    <td>{u.name}{entry ? ` · ${cite(BOOK, entry.source.page)}` : ' (the crew’s own)'}</td><td>{u.slots}</td>
                    <td>{UPGRADE_SOURCES[u.how]}{u.paid ? ` for ${exactBerries(u.paid)}` : ''}</td><td>{[u.note, u.text].filter(Boolean).join(' — ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2>Hold · {sheet.cargo.tons} of {sheet.cargo.capacity} tons</h2>
        {sheet.cargo.lines.length > 0 ? (
          <table className="print-table">
            <thead><tr><th>Cargo</th><th>Count</th><th>Tons each</th><th>Tons</th></tr></thead>
            <tbody>{sheet.cargo.lines.map((l) => <tr key={l.id}><td>{l.name}</td><td>{l.qty}</td><td>{l.tons ?? ''}</td><td>{l.tons !== undefined ? l.total : ''}</td></tr>)}</tbody>
          </table>
        ) : <p>Empty.</p>}
        <p><b>Treasury:</b> {exactBerries(sheet.treasury)} · <b>Rations:</b> {doc.rations}{sheet.rationDays !== null ? ` (${sheet.rationDays} days for the ${sheet.crew.aboard + sheet.crew.passengers} aboard)` : ''} · <b>Aboard:</b> {sheet.crew.aboard} crew, {sheet.crew.passengers} passengers</p>
      </section>

      {sheet.notes.length > 0 && (
        <section>
          <h2>As she stands</h2>
          <ul className="print-list">{sheet.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </section>
      )}

      {doc.notes.trim() && (
        <section>
          <h2>Notes</h2>
          <p className="print-text">{doc.notes}</p>
        </section>
      )}

      {withPictures && ordered.map((picture) => <PrintedPicture key={picture.id} store={pictures} picture={picture} />)}
      <footer className="print-foot">{sheet.name} · {BOOK}, chapter 2 · printed {new Date().toLocaleDateString()}</footer>
    </article>
  );
}

/** A ship laid out for paper or a PDF: her numbers with blanks to pencil in, her parts, upgrades and hold, and her maps. */
export function ShipPrintPage() {
  const { id } = useParams();
  const { loading, session } = useAuth();
  const userId = session?.user.id ?? null;
  const store = useMemo(() => shipStoreFor(userId), [userId]);
  const pictures = useMemo(() => shipPicturesFor(userId), [userId]);
  const [doc, setDoc] = useState<ShipDoc | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [withPictures, setWithPictures] = useState(true);

  useEffect(() => {
    if (loading || !id) return;
    let current = true;
    store.get(id).then(
      (stored) => current && (stored ? setDoc(stored.doc) : setProblem('No such ship. She may have been scuttled, or she belongs to another crew.')),
      (error: Error) => current && setProblem(error.message),
    );
    return () => { current = false; };
  }, [store, id, loading]);

  const sheet = useMemo(() => (doc ? deriveShip(doc, rule) : null), [doc]);
  useEffect(() => { if (sheet) document.title = `${sheet.name} · ship sheet`; }, [sheet]);

  if (problem) return <p className="notice" role="alert">{problem}</p>;
  if (!doc || !sheet) return <p>Laying out the sheet…</p>;
  return (
    <div className="print-page">
      <div className="print-bar no-print">
        <Link className="btn" to={`/ship/${id}`}>Back to the ship</Link>
        {doc.pictures.length > 0 && (
          <label className="check">
            <input type="checkbox" checked={withPictures} onChange={(e) => setWithPictures(e.target.checked)} />
            <span>Include her maps and artwork</span>
          </label>
        )}
        <button className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <Paper doc={doc} sheet={sheet} pictures={pictures} withPictures={withPictures} />
    </div>
  );
}
