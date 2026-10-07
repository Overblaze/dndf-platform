import { applyDamage, applyHealing, cite, gainTempHp, type Stat } from '@dndf/engine';
import { useState } from 'react';
import type { LiveCharacter } from '../lib/useCharacter';
import { formatStat, type StatKind } from './stats';

export type OpenStat = (stat: Stat, kind: StatKind, rollable?: boolean) => void;

export function Tile({ stat, kind, label, sub, onOpen, rollable }: { stat: Stat; kind: StatKind; label?: string; sub?: string; onOpen: OpenStat; rollable?: boolean }) {
  return (
    <button className={stat.overridden ? 'tile tile-btn edited' : 'tile tile-btn'} onClick={() => onOpen(stat, kind, rollable)}>
      <span className="label">{label ?? stat.label}</span>
      <span className="big num">{formatStat(stat.value, kind)}</span>
      <span className="page-ref">{stat.overridden ? 'edited' : sub ?? (stat.page ? cite(stat.book, stat.page) : ' ')}</span>
    </button>
  );
}

export function Vitals({ live, onOpen }: { live: LiveCharacter; onOpen: OpenStat }) {
  const { doc, sheet } = live;
  const { hp, tempHp } = doc.state;
  const max = sheet.maxHp.value;
  const [amount, setAmount] = useState('');
  const n = Math.max(0, Math.floor(Number(amount)));
  const ready = amount.trim() !== '' && Number.isFinite(n) && n > 0;

  const act = (what: 'damage' | 'heal' | 'temp') => {
    const state = what === 'damage' ? applyDamage(doc.state, n) : what === 'heal' ? applyHealing(doc.state, n, max) : gainTempHp(doc.state, n);
    const log =
      what === 'temp'
        ? `Temporary HP ${tempHp} → ${state.tempHp}`
        : `${n} ${what === 'damage' ? 'damage' : 'healing'}: HP ${hp} → ${state.hp}${tempHp !== state.tempHp ? `, temporary HP ${tempHp} → ${state.tempHp}` : ''}`;
    live.setState(state, log);
    setAmount('');
  };

  return (
    <section className="card vitals">
      <div className="hp">
        <button className={sheet.maxHp.overridden ? 'hp-numbers edited' : 'hp-numbers'} onClick={() => onOpen(sheet.maxHp, 'plain')} aria-label="Hit points; open the maximum's breakdown">
          <span className="label">Hit points</span>
          <span className="hp-now num">
            {hp}
            <span className="hp-max"> / {max}</span>
          </span>
          {tempHp > 0 && <span className="chip chip-heal">+{tempHp} temporary</span>}
          {hp === 0 && <span className="chip chip-damage">Down</span>}
          {hp > 0 && hp <= Math.floor(max / 2) && <span className="chip chip-warn">Half or less</span>}
        </button>
        <div className="hp-bar" aria-hidden="true">
          <span className="hp-fill" style={{ width: `${Math.min(100, (hp / Math.max(1, max)) * 100)}%` }} />
          {tempHp > 0 && <span className="hp-temp" style={{ width: `${Math.min(100, (tempHp / Math.max(1, max)) * 100)}%` }} />}
        </div>
        <div className="row hp-controls">
          <input type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" aria-label="Amount of damage, healing or temporary hit points" />
          <button className="btn btn-damage" disabled={!ready} onClick={() => act('damage')}>Damage</button>
          <button className="btn btn-heal" disabled={!ready} onClick={() => act('heal')}>Heal</button>
          <button className="btn" disabled={!ready} onClick={() => act('temp')}>Temp</button>
        </div>
      </div>
      <div className="tiles tiles-vitals">
        <Tile stat={sheet.ac} kind="plain" label="AC" onOpen={onOpen} />
        <Tile stat={sheet.initiative} kind="mod" label="Initiative" onOpen={onOpen} rollable />
        <Tile stat={sheet.speed} kind="ft" onOpen={onOpen} sub={' '} />
        <Tile stat={sheet.prof} kind="mod" label="Proficiency" onOpen={onOpen} />
        <Tile stat={sheet.willpower} kind="plain" onOpen={onOpen} />
        <Tile stat={sheet.hakiSaveDc} kind="plain" label="Haki DC" onOpen={onOpen} />
        {sheet.hakiAttack && <Tile stat={sheet.hakiAttack} kind="mod" label="Haki attack" sub="table ruling" onOpen={onOpen} />}
        <Tile stat={sheet.passivePerception} kind="plain" label="Passive Perc." onOpen={onOpen} sub={' '} />
      </div>
    </section>
  );
}
