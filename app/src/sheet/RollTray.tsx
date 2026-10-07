import { DREAM_POINT_DIE, rollDice, type RollMode } from '@dndf/engine';
import { useState } from 'react';
import { useRolls } from '../lib/rolls';
import { rng } from '../lib/rules';
import type { LiveCharacter } from '../lib/useCharacter';

const MODES: { id: RollMode; label: string }[] = [
  { id: 'disadvantage', label: 'Dis' },
  { id: 'normal', label: 'Normal' },
  { id: 'advantage', label: 'Adv' },
];

/** The latest roll, pinned above the nav, with the roll mode for the next d20 and the history on tap. */
export function RollTray({ live }: { live: LiveCharacter }) {
  const rolls = useRolls();
  const [open, setOpen] = useState(false);
  const latest = rolls.entries[0];
  const { sheet, doc } = live;

  const dreamPoint = (id: number) => {
    const bonus = rollDice(DREAM_POINT_DIE, rng).total;
    rolls.addTo(id, 'Dream Point', bonus);
    live.setState({ ...doc.state, dreamPointsSpent: doc.state.dreamPointsSpent + 1 }, `Dream Point spent: +${bonus}`);
  };

  return (
    <div className="tray" aria-live="polite">
      {open && rolls.entries.length > 1 && (
        <ul className="tray-history">
          {rolls.entries.slice(1).map((entry) => (
            <li key={entry.id}>
              <span>{entry.title}</span>
              <span className="num">{entry.detail} = {entry.total}</span>
            </li>
          ))}
        </ul>
      )}
      {latest && (
        <div className={latest.flag ? `tray-latest tray-${latest.flag}` : 'tray-latest'}>
          <button className="tray-result" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Show or hide earlier rolls">
            <span className="tray-total num">{latest.total}</span>
            <span>
              <span className="resource-name">{latest.title}{latest.flag === 'crit' ? ' · natural 20' : latest.flag === 'fumble' ? ' · natural 1' : ''}</span>
              <span className="page-ref">{latest.detail}</span>
            </span>
          </button>
          {latest.followUp && (
            <button className="btn btn-primary" onClick={() => rolls.dice(latest.followUp!.title, latest.followUp!.dice, { crit: latest.flag === 'crit' })}>
              Damage
            </button>
          )}
          {latest.d20 && sheet.dreamPoints.remaining > 0 && (
            <button className="btn" onClick={() => dreamPoint(latest.id)} title="Spend a Dream Point to add 1d6">
              +{DREAM_POINT_DIE}
            </button>
          )}
        </div>
      )}
      <div className="segmented tray-mode" role="radiogroup" aria-label="Next d20 roll">
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={rolls.mode === m.id} className={rolls.mode === m.id ? 'active' : ''} onClick={() => rolls.setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
