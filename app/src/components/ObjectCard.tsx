import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface ObjectChip {
  label: string;
  tone?: 'heal' | 'damage' | 'warn';
}

/** Tiles laid out side by side where there is room, one to a row on a phone. */
export function ObjectGrid({ children }: { children: ReactNode }) {
  return <div className="object-grid">{children}</div>;
}

/**
 * One character or ship in a list: a tile that reads as a thing already made, opened by tapping
 * anywhere on it. Its buttons (Delete, Level up) sit above that and do their own thing.
 */
export function ObjectCard({ to, kind, name, summary, meter, chips = [], children }: {
  to: string;
  kind: 'character' | 'ship';
  name: string;
  summary?: string;
  /** Hit points now and at most, drawn as a bar under the name. */
  meter?: { label: string; now: number; max: number };
  chips?: ObjectChip[];
  /** Buttons along the bottom. */
  children?: ReactNode;
}) {
  const share = meter && meter.max > 0 ? Math.max(0, Math.min(1, meter.now / meter.max)) : 0;
  return (
    <article className={`object-card object-card-${kind}`}>
      <Link className="object-card-main" to={to}>
        <span className="object-badge" aria-hidden="true">{kind === 'ship' ? <AnchorIcon /> : (name.trim()[0] ?? '?').toUpperCase()}</span>
        <span className="object-text">
          <span className="object-name">{name}</span>
          {summary && <span className="object-summary">{summary}</span>}
        </span>
      </Link>
      {meter && (
        <div className="object-meter">
          <span className="label">{meter.label} <span className="num">{meter.now} / {meter.max}</span></span>
          <div className="hp-bar" aria-hidden="true"><div className="hp-fill" style={{ width: `${share * 100}%` }} /></div>
        </div>
      )}
      {chips.length > 0 && (
        <div className="object-chips">
          {chips.map((chip) => <span key={chip.label} className={chip.tone ? `chip chip-${chip.tone}` : 'chip'}>{chip.label}</span>)}
        </div>
      )}
      {children && <div className="object-actions row wrap">{children}</div>}
    </article>
  );
}

function AnchorIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2.2" />
      <path d="M12 7.2V21M8 11h8M4.5 14.5c0 3.6 3.4 6.5 7.5 6.5s7.5-2.9 7.5-6.5M4.5 14.5l-1.5 1.5M4.5 14.5l1.8 1.2M19.5 14.5l1.5 1.5M19.5 14.5l-1.8 1.2" />
    </svg>
  );
}
