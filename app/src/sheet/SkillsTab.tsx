import { Fragment } from 'react';
import { ABILITIES, ABILITY_NAMES, signed, type RollEdge, type Stat } from '@dndf/engine';
import { EdgeNote } from '../components/EdgeNote';
import { useRolls } from '../lib/rolls';
import type { LiveCharacter } from '../lib/useCharacter';
import { Tile, type OpenStat } from './Vitals';

function RollRow({ stat, name, mark, edge, onOpen }: { stat: Stat; name: string; mark: string; edge?: RollEdge; onOpen: OpenStat }) {
  const rolls = useRolls();
  return (
    <div className="roll-row">
      <button className="roll-name" onClick={() => onOpen(stat, 'mod', true)}>
        <span className="prof-mark" aria-hidden="true">{mark}</span>
        {name}
      </button>
      {edge && <EdgeNote edge={edge} short />}
      <button className={stat.overridden ? 'btn btn-roll edited' : 'btn btn-roll'} onClick={() => rolls.d20(stat.label, stat.value, undefined, edge)} aria-label={`Roll ${stat.label}, ${signed(stat.value)}${edge && edge.mode !== 'normal' ? `, with ${edge.mode}` : ''}`}>
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
            <button key={a} className="tile tile-btn" onClick={() => rolls.d20(`${ABILITY_NAMES[a]} check`, sheet.abilities[a].mod, undefined, sheet.abilities[a].edge)} aria-label={`Roll a ${ABILITY_NAMES[a]} check, ${signed(sheet.abilities[a].mod)}`}>
              <span className="label">{a}</span>
              <span className="big num">{signed(sheet.abilities[a].mod)}</span>
              <span className={sheet.abilities[a].changes ? 'page-ref edited' : 'page-ref'}>score {sheet.abilities[a].score}</span>
            </button>
          ))}
        </div>
        {ABILITIES.filter((a) => sheet.abilities[a].changes).map((a) => (
          <p key={a} className="page-ref">{ABILITY_NAMES[a]}: {live.doc.scores[a]} on the character → {sheet.abilities[a].changes!.map((c) => `${c.to} (${c.label})`).join(' → ')}</p>
        ))}
      </section>
      <section className="card">
        <h2>Saving throws</h2>
        <div className="roll-list">
          {ABILITIES.map((a) => (
            <RollRow key={a} stat={sheet.saves[a]} edge={sheet.saves[a].edge} name={ABILITY_NAMES[a]} mark={sheet.saves[a].proficient ? '●' : '○'} onOpen={onOpen} />
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Skills</h2>
        <p className="page-ref">● proficient · ◆ expertise · tap a name for the math, the number to roll · ADV and DIS mark a roll the sheet makes with advantage or disadvantage (tap the name for why)</p>
        <div className="roll-list">
          {sheet.skills.map((skill) => (
            <RollRow key={skill.id} stat={skill} edge={skill.edge} name={`${skill.label} (${skill.ability})`} mark={skill.expertise ? '◆' : skill.proficient ? '●' : '○'} onOpen={onOpen} />
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
