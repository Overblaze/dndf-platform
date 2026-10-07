import { Fragment } from 'react';
import { ABILITIES, ABILITY_NAMES, signed, type Stat } from '@dndf/engine';
import { useRolls } from '../lib/rolls';
import type { LiveCharacter } from '../lib/useCharacter';
import { Tile, type OpenStat } from './Vitals';

function RollRow({ stat, name, mark, onOpen }: { stat: Stat; name: string; mark: string; onOpen: OpenStat }) {
  const rolls = useRolls();
  return (
    <div className="roll-row">
      <button className="roll-name" onClick={() => onOpen(stat, 'mod', true)}>
        <span className="prof-mark" aria-hidden="true">{mark}</span>
        {name}
      </button>
      <button className={stat.overridden ? 'btn btn-roll edited' : 'btn btn-roll'} onClick={() => rolls.d20(stat.label, stat.value)} aria-label={`Roll ${stat.label}, ${signed(stat.value)}`}>
        <span className="num">{signed(stat.value)}</span>
      </button>
    </div>
  );
}

export function SkillsTab({ live, onOpen }: { live: LiveCharacter; onOpen: OpenStat }) {
  const rolls = useRolls();
  const { sheet } = live;
  return (
    <>
      <section className="card">
        <h2>Abilities</h2>
        <div className="tiles tiles-abilities">
          {ABILITIES.map((a) => (
            <button key={a} className="tile tile-btn" onClick={() => rolls.d20(`${ABILITY_NAMES[a]} check`, sheet.abilities[a].mod)} aria-label={`Roll a ${ABILITY_NAMES[a]} check, ${signed(sheet.abilities[a].mod)}`}>
              <span className="label">{a}</span>
              <span className="big num">{signed(sheet.abilities[a].mod)}</span>
              <span className="page-ref">score {sheet.abilities[a].score}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Saving throws</h2>
        <div className="roll-list">
          {ABILITIES.map((a) => (
            <RollRow key={a} stat={sheet.saves[a]} name={ABILITY_NAMES[a]} mark={sheet.saves[a].proficient ? '●' : '○'} onOpen={onOpen} />
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Skills</h2>
        <p className="page-ref">● proficient · ◆ expertise · tap a name for the math, the number to roll</p>
        <div className="roll-list">
          {sheet.skills.map((skill) => (
            <RollRow key={skill.id} stat={skill} name={`${skill.label} (${skill.ability})`} mark={skill.expertise ? '◆' : skill.proficient ? '●' : '○'} onOpen={onOpen} />
          ))}
        </div>
        <div className="tiles">
          <Tile stat={sheet.passivePerception} kind="plain" onOpen={onOpen} sub={' '} />
          <Tile stat={sheet.carry} kind="lb" label="Carry" onOpen={onOpen} />
        </div>
      </section>
      <section className="card">
        <h2>Proficiencies</h2>
        <dl className="facts facts-plain">
          {([['Armor', sheet.proficiencies.armor], ['Weapons', sheet.proficiencies.weapons], ['Tools', sheet.proficiencies.tools]] as const).map(([title, list]) => (
            <Fragment key={title}>
              <dt>{title}</dt>
              <dd>
                {list.length === 0 ? 'None' : list.map((p, i) => (
                  <span key={p.id}>{i > 0 && ', '}{p.name} <span className="page-ref">({p.from})</span></span>
                ))}
              </dd>
            </Fragment>
          ))}
        </dl>
      </section>
    </>
  );
}
