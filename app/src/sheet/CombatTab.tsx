import { gainTempHp, setToggle, setTracker, spendResource, activateFeature, type SheetFeature, type SheetResource } from '@dndf/engine';
import { Pips } from '../components/Pips';
import { RuleText } from '../components/RuleText';
import { useRolls } from '../lib/rolls';
import type { LiveCharacter } from '../lib/useCharacter';
import { formatStat } from './stats';
import type { OpenStat } from './Vitals';

const ACTION_GROUPS: { id: string; title: string }[] = [
  { id: 'action', title: 'Actions' },
  { id: 'bonus', title: 'Bonus actions' },
  { id: 'reaction', title: 'Reactions' },
  { id: 'specialReaction', title: 'Special Reactions' },
  { id: 'other', title: 'Other features with uses or rolls' },
];

function ResourceRow({ res, live }: { res: SheetResource; live: LiveCharacter }) {
  const change = (amount: number) => {
    const result = spendResource(live.doc.state, live.sheet, res.id, amount);
    live.setState(result.state, result.summary);
  };
  return (
    <div className="resource">
      <div>
        <div className="resource-name">{res.name}</div>
        <div className="page-ref">
          {res.recharge} rest{res.page ? ` · p.${res.page}` : ''}
        </div>
      </div>
      <Pips remaining={res.remaining} max={res.max} label={res.name} />
      <div className="row">
        <button className="btn" onClick={() => change(1)} disabled={res.remaining === 0} aria-label={`Spend one ${res.name}`}>−</button>
        <button className="btn" onClick={() => change(-1)} disabled={res.remaining === res.max} aria-label={`Regain one ${res.name}`}>+</button>
      </div>
    </div>
  );
}

function FeatureAction({ feature, live }: { feature: SheetFeature; live: LiveCharacter }) {
  const rolls = useRolls();
  const { sheet, doc } = live;
  const res = feature.resource ? sheet.resources.find((r) => r.id === feature.resource) : undefined;
  const costs = Object.entries(feature.cost ?? {}).map(([id, n]) => `${n} ${sheet.resources.find((r) => r.id === id)?.name ?? id}`);
  const usable = Boolean(res || costs.length || feature.onUse.length || feature.counter);

  const use = () => {
    const result = activateFeature(doc.state, sheet, feature);
    live.setState(result.state, result.warning ? `${result.summary} (${result.warning})` : result.summary);
  };
  const roll = (r: SheetFeature['rolls'][number]) => {
    const result = rolls.dice(`${feature.name}: ${r.label}`, r.dice);
    if (r.kind === 'tempHp') {
      const state = gainTempHp(live.doc.state, result.total);
      live.setState(state, `${feature.name}: temporary HP ${doc.state.tempHp} → ${state.tempHp}`);
    }
  };

  return (
    <div className="action">
      <div className="action-head">
        <div>
          <div className="resource-name">{feature.name}</div>
          <div className="page-ref">
            {feature.from} · p.{feature.page}
            {costs.length > 0 && ` · costs ${costs.join(', ')}`}
          </div>
        </div>
        {res && !feature.toggle && <Pips remaining={res.remaining} max={res.max} label={feature.name} />}
      </div>
      {feature.displays.length > 0 && (
        <div className="chips">
          {feature.displays.map((d) => (
            <span key={d.label} className="chip">{d.label}: <strong className="num">{d.value}</strong></span>
          ))}
        </div>
      )}
      <div className="row wrap">
        {usable && !feature.toggle && <button className="btn btn-primary" onClick={use}>Use</button>}
        {feature.rolls.map((r) => (
          <button key={r.label} className="btn" onClick={() => roll(r)}>
            {r.label} <span className="num">{r.dice}</span>
          </button>
        ))}
      </div>
      <details className="rule-text">
        <summary>Rules text</summary>
        <RuleText text={feature.text} sections={feature.sections} tables={feature.tables} />
      </details>
    </div>
  );
}

export function CombatTab({ live, onOpen }: { live: LiveCharacter; onOpen: OpenStat }) {
  const rolls = useRolls();
  const { sheet, doc } = live;
  const general = new Set(['healing_surge', ...sheet.specialReactions.map((r) => r.resource)]);
  const featureOwned = new Set(sheet.features.flatMap((f) => (f.resource && !f.toggle ? [f.resource] : [])));
  const pools = sheet.resources.filter((r) => !general.has(r.id) && !featureOwned.has(r.id));

  const actionable = sheet.features.filter((f) => !f.toggle && (f.action || f.resource || f.cost || f.rolls.length || f.onUse.length || f.counter || f.displays.length));
  const groupOf = (f: SheetFeature) => (f.action && ACTION_GROUPS.some((g) => g.id === f.action) ? f.action : 'other');

  const specialReaction = (reaction: (typeof sheet.specialReactions)[number]) => {
    const result = spendResource(doc.state, sheet, reaction.resource, 1);
    live.setState(result.state, result.warning ? `${result.summary} (${result.warning})` : result.summary);
    if (reaction.roll) rolls.dice(`${reaction.name}: damage reduced`, reaction.roll);
  };

  return (
    <>
      {sheet.toggles.length > 0 && (
        <section className="card">
          <h2>Toggles</h2>
          {sheet.toggles.map((toggle) => {
            const res = toggle.resource ? sheet.resources.find((r) => r.id === toggle.resource) : undefined;
            const flip = () => {
              const result = setToggle(doc.state, sheet, toggle.id, !toggle.on);
              live.setState(result.state, result.warning ? `${result.summary} (${result.warning})` : result.summary);
            };
            return (
              <div key={toggle.id} className="resource">
                <div>
                  <div className="resource-name">{toggle.label}</div>
                  {res && <div className="page-ref">{res.name}: {res.remaining} of {res.max} left</div>}
                </div>
                {res && <Pips remaining={res.remaining} max={res.max} label={res.name} />}
                <button className={toggle.on ? 'btn btn-primary' : 'btn'} role="switch" aria-checked={toggle.on} onClick={flip}>
                  {toggle.on ? 'On' : 'Off'}
                </button>
              </div>
            );
          })}
          {sheet.notes.length > 0 && (
            <ul className="notes">
              {sheet.notes.map((note, i) => (
                <li key={i}>
                  {note.label} <span className="page-ref">{note.from}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card">
        <h2>Attacks</h2>
        <p className="page-ref">{sheet.attacksPerAction} attack{sheet.attacksPerAction > 1 ? 's' : ''} per Attack action</p>
        {sheet.attacks.map((attack) => (
          <div key={attack.id} className="attack">
            <button className="attack-name" onClick={() => onOpen(attack.toHit, 'mod', true)}>
              <span className="resource-name">{attack.name}</span>
              <span className="page-ref">{[attack.damageType, ...attack.notes].join(' · ')}</span>
            </button>
            <button
              className={attack.toHit.overridden ? 'btn btn-roll edited' : 'btn btn-roll'}
              onClick={() => rolls.d20(`${attack.name} attack`, attack.toHit.value, { title: `${attack.name} damage`, dice: attack.damage, type: attack.damageType })}
              aria-label={`Roll ${attack.name} attack, ${formatStat(attack.toHit.value, 'mod')}`}
            >
              <span className="label">Hit</span>
              <span className="num">{formatStat(attack.toHit.value, 'mod')}</span>
            </button>
            <button className="btn btn-roll" onClick={() => rolls.dice(`${attack.name} damage`, attack.damage)} aria-label={`Roll ${attack.name} damage, ${attack.damage}`}>
              <span className="label">Damage</span>
              <span className="num">{attack.damage}</span>
            </button>
          </div>
        ))}
      </section>

      {sheet.classTable.length > 0 && (
        <section className="card">
          <h2>Class table</h2>
          <div className="chips">
            {sheet.classTable.map((column) => (
              <span key={`${column.from}/${column.key}`} className="chip chip-lg">
                {column.label} <strong className="num">{column.value}</strong>
              </span>
            ))}
          </div>
          <p className="page-ref">This level's row of the {[...new Set(sheet.classTable.map((c) => c.from))].join(' and ')} table.</p>
        </section>
      )}

      {pools.length > 0 && (
        <section className="card">
          <h2>Resources</h2>
          {pools.map((res) => <ResourceRow key={res.id} res={res} live={live} />)}
        </section>
      )}

      {(sheet.trackers.length > 0 || sheet.counters.length > 0) && (
        <section className="card">
          <h2>Trackers</h2>
          {sheet.trackers.map((tracker) => {
            const step = (by: number) => live.setState(setTracker(doc.state, sheet, tracker.id, tracker.value + by), `${tracker.name} ${tracker.value} → ${Math.min(tracker.max, Math.max(tracker.min, tracker.value + by))}`);
            const at = tracker.levels?.find((l) => l.value === tracker.value);
            return (
              <div key={tracker.id} className="tracker">
                <div className="resource">
                  <div>
                    <div className="resource-name">{tracker.name}</div>
                    <div className="page-ref">{at ? at.label : `max ${tracker.max}`}{tracker.page ? ` · p.${tracker.page}` : ''}</div>
                  </div>
                  <span className="big num">{tracker.value}</span>
                  <div className="row">
                    <button className="btn" onClick={() => step(-1)} disabled={tracker.value <= tracker.min} aria-label={`Lower ${tracker.name}`}>−</button>
                    <button className="btn" onClick={() => step(1)} disabled={tracker.value >= tracker.max} aria-label={`Raise ${tracker.name}`}>+</button>
                  </div>
                </div>
                {at?.text && <p className="soft">{at.text}</p>}
              </div>
            );
          })}
          {sheet.counters.map((counter) => (
            <div key={counter.id} className="resource">
              <div>
                <div className="resource-name">{counter.label}</div>
                <div className="page-ref">used {counter.count} time{counter.count === 1 ? '' : 's'} since the last rest</div>
              </div>
              <span className="big num">{counter.value}</span>
            </div>
          ))}
        </section>
      )}

      {ACTION_GROUPS.map((group) => {
        const features = actionable.filter((f) => groupOf(f) === group.id);
        const special = group.id === 'specialReaction';
        if (features.length === 0 && !special) return null;
        return (
          <section key={group.id} className="card">
            <h2>{group.title}</h2>
            {special && (
              <>
                <p className="page-ref">2 per round · each {sheet.resources.find((r) => r.id === 'sr.parry')?.max} times per short rest · separate from your normal reaction · p.11</p>
                {sheet.specialReactions.map((reaction) => {
                  const res = sheet.resources.find((r) => r.id === reaction.resource)!;
                  return (
                    <div key={reaction.id} className="action">
                      <div className="resource">
                        <div>
                          <div className="resource-name">{reaction.name}</div>
                          <div className="page-ref">{reaction.roll ? `reduce the damage by ${reaction.roll} · ` : ''}p.{reaction.page}</div>
                        </div>
                        <Pips remaining={res.remaining} max={res.max} label={res.name} />
                        <button className="btn btn-primary" onClick={() => specialReaction(reaction)}>Use</button>
                      </div>
                      {reaction.text && (
                        <details className="rule-text">
                          <summary>Rules text</summary>
                          <RuleText text={reaction.text} />
                        </details>
                      )}
                    </div>
                  );
                })}
              </>
            )}
            {features.map((feature) => <FeatureAction key={feature.key} feature={feature} live={live} />)}
          </section>
        );
      })}
    </>
  );
}
