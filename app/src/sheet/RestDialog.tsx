import { dawn, longRest, nextHitDice, rollDie, shortRest, type RestResult } from '@dndf/engine';
import { useMemo, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { rng } from '../lib/rules';
import type { LiveCharacter } from '../lib/useCharacter';

type Kind = 'short' | 'long' | 'dawn';
const TITLES: Record<Kind, string> = { short: 'Short rest', long: 'Long rest', dawn: 'Dawn' };

/** Pick a rest, see exactly what it will change, then apply it. */
export function RestDialog({ live, onClose }: { live: LiveCharacter; onClose: () => void }) {
  const { doc, sheet } = live;
  const [kind, setKind] = useState<Kind>('short');
  const [rolls, setRolls] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const needConfirm = sheet.resources.filter((r) => r.confirm && r.remaining < r.max && (kind === 'long' || r.recharge === 'short') && kind !== 'dawn');

  const preview: RestResult = useMemo(() => {
    const options = { confirmed: Object.fromEntries(needConfirm.map((r) => [r.id, confirmed[r.id] ?? true])) };
    if (kind === 'short') return shortRest(doc, sheet, { ...options, hitDiceRolls: rolls });
    return kind === 'long' ? longRest(doc, sheet, options) : dawn(doc, sheet);
  }, [kind, rolls, confirmed, doc, sheet]);

  const diceLeft = sheet.hitDice.remaining - rolls.length;
  const apply = () => {
    live.setState(preview.state, `${TITLES[kind]}: ${preview.changes.join('; ') || 'nothing to change'}`);
    onClose();
  };

  return (
    <Dialog title="Rest" onClose={onClose}>
      <div className="segmented" role="tablist">
        {(Object.keys(TITLES) as Kind[]).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'active' : ''} onClick={() => { setKind(k); setRolls([]); }}>
            {TITLES[k]}
          </button>
        ))}
      </div>

      {kind === 'short' && (
        <div className="field">
          <span className="label">Hit dice: {diceLeft} of {sheet.hitDice.pool.map((p) => `${p.count}d${p.die}`).join(' + ')} left</span>
          <div className="row wrap">
            <button className="btn" disabled={diceLeft <= 0} onClick={() => setRolls([...rolls, rollDie(nextHitDice(sheet, 1, rolls.length)[0] ?? sheet.hitDice.die, rng)])}>
              Roll a hit die
            </button>
            <button className="btn" disabled={rolls.length === 0} onClick={() => setRolls([])}>Undo rolls</button>
            {rolls.length > 0 && <span className="num">Rolled {rolls.join(', ')}</span>}
          </div>
        </div>
      )}

      {needConfirm.map((res) => (
        <label key={res.id} className="check">
          <input type="checkbox" checked={confirmed[res.id] ?? true} onChange={(e) => setConfirmed({ ...confirmed, [res.id]: e.target.checked })} />
          <span>{res.confirm} ({res.name})</span>
        </label>
      ))}

      <div className="breakdown">
        <div className="breakdown-head">
          <span className="label">What will change</span>
        </div>
        <ul>
          {preview.changes.length === 0 && <li><span>Nothing: everything is already full.</span></li>}
          {preview.changes.map((change) => <li key={change}><span>{change}</span></li>)}
        </ul>
      </div>
      <button className="btn btn-primary wide" onClick={apply}>Apply {TITLES[kind].toLowerCase()}</button>
    </Dialog>
  );
}
