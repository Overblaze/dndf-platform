import { BOUNTY_DEEDS, WANTED_TERMS, cite, exactBerries, formatBerries, type BountyDeeds, type WantedPoster as Poster, type WantedTerms } from '@dndf/engine';
import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import type { LiveCharacter } from '../lib/useCharacter';
import type { OpenStat } from './Vitals';

/** A wanted poster: the name, the epithet, the terms and the price. */
export function WantedPoster({ name, poster, small }: { name: string; poster: Poster; small?: boolean }) {
  return (
    <div className={small ? 'poster poster-small' : 'poster'}>
      <div className="poster-wanted">WANTED</div>
      <div className="poster-terms">{(poster.terms ?? 'Dead or Alive').toUpperCase()}</div>
      {poster.epithet && <div className="poster-epithet">“{poster.epithet}”</div>}
      <div className="poster-name">{name}</div>
      <div className="poster-price"><span className="num">{exactBerries(poster.value)}</span></div>
      {!small && <div className="poster-foot">MARINE{poster.at ? ` · issued ${poster.at}` : ''}</div>}
    </div>
  );
}

/** The price on the character's head: the DM Guide's suggestion, your own number, and the poster the world has seen. */
export function BountyCard({ live, onOpen }: { live: LiveCharacter; onOpen: OpenStat }) {
  const { doc, sheet } = live;
  const record = doc.bounty ?? {};
  const [showing, setShowing] = useState(false);
  const set = (patch: Partial<NonNullable<typeof doc.bounty>>, log?: string) => live.setDoc({ ...doc, bounty: { ...record, ...patch } }, log);
  const setDeed = (key: keyof BountyDeeds, raw: string) => {
    const n = Math.max(0, Math.round(Number(raw)));
    const deeds = { ...(record.deeds ?? {}) };
    if (raw.trim() === '' || !Number.isFinite(n) || n === 0) delete deeds[key];
    else deeds[key] = n;
    set({ deeds: Object.keys(deeds).length ? deeds : undefined });
  };
  const issue = () => {
    const posted: Poster = { value: sheet.wanted.value, epithet: record.epithet, terms: record.terms, at: new Date().toISOString().slice(0, 10) };
    set({ posted }, `Wanted poster issued: ${exactBerries(posted.value)}`);
    setShowing(true);
  };
  const poster = sheet.poster;
  const changed = poster && (poster.value !== sheet.wanted.value || (poster.epithet ?? '') !== (record.epithet ?? '') || (poster.terms ?? '') !== (record.terms ?? ''));

  return (
    <section className="card">
      <h2>Bounty</h2>
      <button className="link-row" onClick={() => onOpen(sheet.wanted, 'berries')}>
        <span>
          <span className={sheet.wanted.overridden ? 'big num edited' : 'big num'}>{exactBerries(sheet.wanted.value)}</span>
          <span className="page-ref"> {sheet.wanted.overridden ? `your number · the formula gives ${formatBerries(sheet.wanted.calculated)}` : 'from the DM Guide’s formula'} · tap to see it worked out or set your own · {cite(sheet.wanted.book, sheet.wanted.page ?? 107)}</span>
        </span>
      </button>
      <div className="grid-2">
        <label className="field">
          <span className="label">Epithet (optional)</span>
          <input value={record.epithet ?? ''} onChange={(e) => set({ epithet: e.target.value || undefined })} placeholder="Iron Fist" maxLength={60} />
        </label>
        <label className="field">
          <span className="label">Wanted</span>
          <select value={record.terms ?? 'Dead or Alive'} onChange={(e) => set({ terms: e.target.value as WantedTerms })}>
            {WANTED_TERMS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <details className="rule-text">
        <summary>What the formula counts</summary>
        <p className="page-ref">Your level, your strongest Haki and your Devil Fruit are read from the sheet. Count the rest here; leave a box empty for none.</p>
        <div className="grid-2">
          {BOUNTY_DEEDS.map((deed) => (
            <label key={deed.key} className="field">
              <span className="label">{deed.label} · {deed.each}</span>
              <input type="number" inputMode="numeric" min={0} value={record.deeds?.[deed.key] ?? ''} onChange={(e) => setDeed(deed.key, e.target.value)} />
            </label>
          ))}
        </div>
      </details>
      <div className="row wrap">
        <button className="btn btn-primary" onClick={issue}>{poster ? 'Issue a new poster' : 'Issue a wanted poster'}</button>
        {poster && <button className="btn" onClick={() => setShowing(true)}>Show my poster</button>}
      </div>
      <p className="page-ref">
        {poster
          ? `Your crew sees the poster issued${poster.at ? ` on ${poster.at}` : ''}: ${exactBerries(poster.value)}.${changed ? ' Your bounty has changed since; issue a new one when the world finds out.' : ''}`
          : 'Nobody else sees your bounty until you issue a poster. Then your crew sees it on the Crew page.'}
      </p>
      {showing && poster && (
        <Dialog title="Wanted poster" onClose={() => setShowing(false)}>
          <WantedPoster name={sheet.name} poster={poster} />
        </Dialog>
      )}
    </section>
  );
}
