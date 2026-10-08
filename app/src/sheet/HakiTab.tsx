import { PURIST_PICKS, cite, type PuristPick, type RuleEntry } from '@dndf/engine';
import { useState } from 'react';
import { RuleText } from '../components/RuleText';
import { ruleSet } from '../lib/rules';
import type { LiveCharacter } from '../lib/useCharacter';
import { SurgeDialog } from './SurgeDialog';
import { Tile, type OpenStat } from './Vitals';

/** Haki by Color and tier, Haki Purist, and every Spirit Surge advancement on the character. */
export function HakiTab({ live, onOpen }: { live: LiveCharacter; onOpen: OpenStat }) {
  const { doc, sheet } = live;
  const [adding, setAdding] = useState(false);
  const rules = ruleSet(doc.rulesVersion).rules;
  const rule = (id: string) => rules.get(id) as RuleEntry | undefined;
  const { purist } = sheet.haki;
  const puristRule = rule('rule.haki_purist');
  const tiersRule = rule('rule.haki_tiers');
  const pageOf = (entry: RuleEntry | undefined) => (entry?.sources as Record<string, { page: number }> | undefined)?.[doc.rulesVersion]?.page ?? entry?.source.page ?? 221;

  const setPurist = (picks: PuristPick[], log: string) => live.setDoc({ ...doc, hakiPurist: picks.length ? picks : undefined }, log);
  const remove = (id: string, name: string) => live.setDoc({ ...doc, surges: (doc.surges ?? []).filter((r) => r.id !== id) }, `Removed ${name}`);

  return (
    <>
      <section className="card">
        <h2>Haki</h2>
        <div className="tiles">
          <Tile stat={sheet.willpower} kind="plain" onOpen={onOpen} />
          <Tile stat={sheet.hakiSaveDc} kind="plain" label="Haki DC" onOpen={onOpen} />
          {sheet.hakiAttack && <Tile stat={sheet.hakiAttack} kind="mod" label="Haki attack" sub="table ruling" onOpen={onOpen} />}
        </div>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Spirit Surge</button>
        </div>
        <label className="field-inline">
          <input type="checkbox" checked={doc.qualitiesOfAKing === true} onChange={(e) => live.setDoc({ ...doc, qualitiesOfAKing: e.target.checked || undefined }, e.target.checked ? 'Has the Qualities of a King' : 'Does not have the Qualities of a King')} />
          <span>Qualities of a King (needed for the Color of the Supreme King) · {cite(sheet.book, 231)}</span>
        </label>
      </section>

      {sheet.haki.colors.map((color) => {
        const features = color.features.flatMap((key) => sheet.features.filter((f) => f.key === key));
        return (
          <section key={color.id} className="card">
            <h2>{color.name} <span className="chip">{color.tier ? `Tier ${color.tier}` : 'Not awakened'}</span></h2>
            <button className="link-row" onClick={() => onOpen(color.count, 'plain')}>
              <span className="page-ref">
                {color.count.value} feature{color.count.value === 1 ? '' : 's'} counted toward tiers{color.count.overridden ? ' (your number)' : ''} · Tier 2 at 4, Tier 3 at 6 · tap to change
              </span>
            </button>
            {features.length === 0 && <p className="soft">Nothing yet.</p>}
            {features.map((feature) => {
              const res = feature.resource ? sheet.resources.find((r) => r.id === feature.resource) : undefined;
              const record = sheet.haki.surges.find((s) => s.feature === feature.key)?.record;
              return (
                <details key={feature.key} className="feature">
                  <summary>
                    <span className="resource-name">{feature.name}</span>
                    <span className="page-ref">{feature.from.split(' · ').slice(1).join(' · ')}{res ? ` · ${res.remaining} of ${res.max} left` : ''} · {cite(feature.book, feature.page)}</span>
                  </summary>
                  <RuleText text={feature.text} sections={feature.sections} tables={feature.tables} book={feature.book} />
                  <p className="page-ref">{feature.book} ({cite(feature.book, feature.page)}). Its buttons and uses are on the Combat tab.</p>
                  {record && <button className="btn" onClick={() => remove(record.id, feature.name)}>Remove from this character</button>}
                </details>
              );
            })}
          </section>
        );
      })}

      <section className="card">
        <h2>Haki Purist</h2>
        <p className="page-ref">
          {purist.picks.length} of {purist.earned} picked · one at level {purist.levels.join(', ')} · lost on gaining a Devil Fruit · {cite(sheet.book, pageOf(puristRule))}
        </p>
        {purist.picks.length > purist.earned && <p className="notice">That is more picks than this level gives. They are all counted; it is your call.</p>}
        {PURIST_PICKS.map((pick) => {
          const count = purist.picks.filter((p) => p === pick.id).length;
          const drop = () => { const at = purist.picks.lastIndexOf(pick.id); setPurist(purist.picks.filter((_, i) => i !== at), `Haki Purist: dropped ${pick.name}`); };
          return (
            <div key={pick.id} className="resource">
              <div className="resource-name">{pick.name}</div>
              <span className="big num">{count}</span>
              <div className="row">
                <button className="btn" onClick={drop} disabled={count === 0} aria-label={`One fewer ${pick.name}`}>−</button>
                <button className="btn" onClick={() => setPurist([...purist.picks, pick.id], `Haki Purist: ${pick.name}`)} aria-label={`One more ${pick.name}`}>+</button>
              </div>
            </div>
          );
        })}
        <p className="page-ref">Train Quality adds a die to every Haki roll button and Train Stamina adds uses, both already in the numbers. Train Quantity changes areas, which you apply.</p>
        {puristRule && (
          <details className="rule-text">
            <summary>Rules text</summary>
            <RuleText text={String(puristRule.text ?? '')} book={sheet.book} />
          </details>
        )}
      </section>

      <section className="card">
        <h2>Spirit Surges</h2>
        {sheet.haki.surges.length === 0 && <p className="soft">None yet. “+ Spirit Surge” adds a Haki feature or a Standard Advancement.</p>}
        {[...sheet.haki.surges].reverse().map((surge) => (
          <div key={surge.record.id} className="resource">
            <div>
              <div className="resource-name">{surge.name}</div>
              <div className="page-ref">
                {[surge.record.rarity ? `${surge.record.rarity} surge` : `${surge.rarity}`, surge.record.reason, surge.record.session, surge.record.at, cite(surge.book, surge.page)].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button className="btn" onClick={() => remove(surge.record.id, surge.name)}>Remove</button>
          </div>
        ))}
        {tiersRule && (
          <details className="rule-text">
            <summary>Haki tiers: rules text</summary>
            <RuleText text={String(tiersRule.text ?? '')} book={sheet.book} />
            <p className="page-ref">{cite(sheet.book, pageOf(tiersRule))}</p>
          </details>
        )}
      </section>

      {adding && <SurgeDialog live={live} onClose={() => setAdding(false)} />}
    </>
  );
}
