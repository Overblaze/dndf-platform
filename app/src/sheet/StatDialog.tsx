import { cite, type Stat } from '@dndf/engine';
import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useRolls } from '../lib/rolls';
import type { LiveCharacter } from '../lib/useCharacter';
import { formatStat, type StatKind } from './stats';

/** How a number was worked out, with the player's own value on top if they set one. */
export function StatDialog({ stat, kind, rollable, live, onClose }: { stat: Stat; kind: StatKind; rollable: boolean; live: LiveCharacter; onClose: () => void }) {
  const rolls = useRolls();
  const [own, setOwn] = useState(stat.overridden ? String(stat.value) : '');
  const setOverride = (value: number | null) => {
    const overrides = { ...live.doc.overrides };
    if (value === null) delete overrides[stat.key];
    else overrides[stat.key] = value;
    live.setDoc({ ...live.doc, overrides }, value === null ? `${stat.label}: back to calculated` : `${stat.label} set to ${value}`);
  };
  const parsed = Number(own);
  const valid = own.trim() !== '' && Number.isFinite(parsed);

  return (
    <Dialog title={stat.label} onClose={onClose}>
      <div className={stat.overridden ? 'big-value edited' : 'big-value'}>
        <span className="big num">{formatStat(stat.value, kind)}</span>
        {stat.overridden && (
          <span className="page-ref">
            edited · calculated {formatStat(stat.calculated, kind)}
          </span>
        )}
      </div>
      <div className="breakdown">
        <div className="breakdown-head">
          <span className="label">Calculated</span>
          {stat.page !== undefined && <span className="page-ref">{cite(stat.book, stat.page)}</span>}
        </div>
        <ul>
          {stat.lines.map((line, i) => (
            <li key={i}>
              <span>{line.label}</span>
              <span className="num">{line.value}</span>
            </li>
          ))}
          <li className="breakdown-total">
            <span>Total</span>
            <span className="num">{formatStat(stat.calculated, kind)}</span>
          </li>
        </ul>
      </div>
      <label className="field">
        <span className="label">Use my own number</span>
        <span className="row">
          <input type="number" inputMode="numeric" value={own} onChange={(e) => setOwn(e.target.value)} placeholder={String(stat.calculated)} />
          <button className="btn btn-primary" disabled={!valid} onClick={() => setOverride(parsed)}>
            Set
          </button>
          <button className="btn" disabled={!stat.overridden} onClick={() => { setOverride(null); setOwn(''); }}>
            Use calculated
          </button>
        </span>
      </label>
      {rollable && (
        <button className="btn btn-primary wide" onClick={() => { rolls.d20(stat.label, stat.value); onClose(); }}>
          Roll d20 {formatStat(stat.value, 'mod')}
        </button>
      )}
    </Dialog>
  );
}
