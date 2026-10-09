import { ABILITIES, ABILITY_NAMES, abilityMod, applyLevelUp, customClassEntry, cite, columnLabel, levelUpPlan, rollDie, signed, type Ability, type CharacterDoc } from '@dndf/engine';
import { useMemo, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { RuleText } from '../components/RuleText';
import { rng, ruleSet } from '../lib/rules';
import type { LiveCharacter } from '../lib/useCharacter';

type HpMode = 'average' | 'roll' | 'typed';
const NONE: Record<Ability, number> = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

/**
 * Take one more level: pick the class, settle the hit points, see what the level gives, make the
 * choices it asks for, and confirm. Everything it warns about can be ignored.
 */
export function LevelUpDialog({ live, onClose, onLevelled }: { live: LiveCharacter; onClose: () => void; onLevelled: (before: CharacterDoc) => void }) {
  const { doc } = live;
  const { rules, classes: bookClasses, feats } = ruleSet(doc.rulesVersion);
  const classes = [...bookClasses, ...(doc.customClasses ?? []).map((c) => customClassEntry(c, doc.rulesVersion))];
  const [classId, setClassId] = useState(doc.classes[0]!.id);
  const [hpMode, setHpMode] = useState<HpMode>('average');
  const [rolled, setRolled] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [subclass, setSubclass] = useState('');
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [improve, setImprove] = useState<'scores' | 'feat'>('scores');
  const [increase, setIncrease] = useState(NONE);
  const [feat, setFeat] = useState('');

  // A class that is not in this handbook (an old save, a deleted custom class) can't be levelled; offer the ones that can.
  const known = (id: string) => classes.some((c) => c.id === id);
  const usable = known(classId) ? classId : doc.classes.find((c) => known(c.id))?.id ?? classes[0]!.id;
  const plan = useMemo(() => levelUpPlan(doc, rules, usable), [doc, rules, usable]);
  const pickClass = (id: string) => { setClassId(id); setRolled(null); setTyped(''); setSubclass(''); setPicks({}); setIncrease(NONE); setFeat(''); };
  const others = classes.filter((c) => !doc.classes.some((held) => held.id === c.id));

  const hpRoll = hpMode === 'roll' ? rolled : hpMode === 'typed' && typed !== '' ? Math.max(1, Math.min(plan.hitDie, Math.round(Number(typed)) || 1)) : null;
  const die = hpRoll ?? plan.averageHp;
  const added = ABILITIES.reduce((sum, a) => sum + increase[a], 0);
  const scoreIncrease = plan.improvement && improve === 'scores' && added > 0 ? increase : undefined;
  const preview = useMemo(
    () => applyLevelUp(doc, rules, { classId: usable, hpRoll, subclass: subclass || undefined, choices: picks, scoreIncrease, feat: plan.improvement && improve === 'feat' && feat ? feat : undefined }),
    [doc, rules, usable, hpRoll, subclass, picks, scoreIncrease, plan.improvement, improve, feat],
  );
  const waiting = hpMode === 'roll' && rolled === null;
  const toDo = [
    ...(plan.subclass && !subclass ? [`${plan.subclass.label} not chosen`] : []),
    ...plan.choices.filter((c) => (picks[c.id] ?? c.have).length < c.allowed).map((c) => `${c.name}: ${(picks[c.id] ?? c.have).length} of ${c.allowed} picked`),
    ...(plan.improvement && improve === 'scores' && added !== 2 ? [`Ability Score Improvement: ${added} of 2 points placed`] : []),
    ...(plan.improvement && improve === 'feat' && !feat ? ['No feat chosen'] : []),
  ];

  const confirm = () => {
    onLevelled(doc);
    live.setDoc(preview.doc, preview.summary);
    onClose();
  };
  const toggle = (id: string, have: string[], option: string) => {
    const current = picks[id] ?? have;
    setPicks({ ...picks, [id]: current.includes(option) ? current.filter((o) => o !== option) : [...current, option] });
  };

  return (
    <Dialog title="Level up" onClose={onClose}>
      <label className="field">
        <span className="label">Take a level in</span>
        <select value={usable} onChange={(e) => pickClass(e.target.value)}>
          {doc.classes.filter((held) => known(held.id)).map((held) => {
            const cls = classes.find((c) => c.id === held.id);
            return <option key={held.id} value={held.id}>{cls?.name ?? held.id} {held.level} → {held.level + 1}</option>;
          })}
          <optgroup label="A new class (multiclass)">
            {others.map((c) => <option key={c.id} value={c.id}>{c.name} 1</option>)}
          </optgroup>
        </select>
      </label>
      <p className="page-ref">Character level {plan.totalLevel - 1} → {plan.totalLevel}{plan.proficiency.to !== plan.proficiency.from ? ` · proficiency bonus ${signed(plan.proficiency.from)} → ${signed(plan.proficiency.to)}` : ''}</p>
      {plan.warnings.map((w) => <p key={w} className="notice">{w} It's your call.</p>)}
      {plan.classLevel > 20 && <p className="notice">The {plan.className} table stops at level 20. You can go past it; numbers that grow with level stay at their level-20 values.</p>}
      {doc.classes.some((held) => !known(held.id)) && <p className="notice">One of this character's classes is not in this handbook, so it isn't offered here.</p>}

      <fieldset>
        <legend className="label">Hit points · d{plan.hitDie}</legend>
        {plan.hitPointsRule && <p className="page-ref">{plan.hitPointsRule}. Only a character’s very first level takes the die’s maximum.</p>}
        {plan.bookFixedHp !== undefined && (
          <p className="notice">The book prints {plan.bookFixedHp} as this class’s fixed number, which is a slip: a d{plan.hitDie}’s is {plan.averageHp}, and this table uses {plan.averageHp} (Matt’s ruling).</p>
        )}
        <div className="segmented" role="radiogroup" aria-label="Hit points for this level">
          <button type="button" role="radio" aria-checked={hpMode === 'average'} className={hpMode === 'average' ? 'active' : ''} onClick={() => setHpMode('average')}>Average ({plan.averageHp})</button>
          <button type="button" role="radio" aria-checked={hpMode === 'roll'} className={hpMode === 'roll' ? 'active' : ''} onClick={() => setHpMode('roll')}>Roll</button>
          <button type="button" role="radio" aria-checked={hpMode === 'typed'} className={hpMode === 'typed' ? 'active' : ''} onClick={() => setHpMode('typed')}>Rolled at the table</button>
        </div>
        {hpMode === 'roll' && (
          <div className="row wrap">
            <button type="button" className="btn btn-primary" onClick={() => setRolled(rollDie(plan.hitDie, rng))}>{rolled === null ? `Roll the d${plan.hitDie}` : 'Roll again'}</button>
            {rolled !== null && <span className="num" aria-live="polite">Rolled {rolled}</span>}
          </div>
        )}
        {hpMode === 'typed' && (
          <label className="field">
            <span className="label">The die showed (1–{plan.hitDie})</span>
            <input type="number" inputMode="numeric" min={1} max={plan.hitDie} value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Hit die result" />
          </label>
        )}
        <p className="page-ref" aria-live="polite">
          {waiting ? 'Roll the die to see the total.' : `${die} from the die ${signed(abilityMod(preview.doc.scores.con))} Constitution${preview.hpGained !== die + abilityMod(preview.doc.scores.con) ? ', and earlier levels catch up' : ''} · hit point maximum ${live.sheet.maxHp.value} → ${live.sheet.maxHp.value + preview.hpGained} (${signed(preview.hpGained)})`}
        </p>
      </fieldset>

      {(plan.features.length > 0 || plan.columns.length > 0) && (
        <fieldset>
          <legend className="label">{plan.className} {plan.classLevel} gives you</legend>
          {plan.columns.length > 0 && (
            <ul className="notes">
              {plan.columns.map((c) => <li key={c.key}>{columnLabel(c.key)}: {c.from === null ? '' : `${c.from} → `}{c.to}</li>)}
            </ul>
          )}
          {plan.features.map((f) => (
            <details key={`${f.from}/${f.name}`} className="feature">
              <summary>
                <span className="resource-name">{f.name}</span>
                <span className="page-ref">{f.from} · {cite(f.book, f.page)}</span>
              </summary>
              <RuleText text={f.text} book={f.book} />
            </details>
          ))}
        </fieldset>
      )}

      {plan.subclass && (
        <label className="field">
          <span className="label">{plan.subclass.label}</span>
          <select value={subclass} onChange={(e) => setSubclass(e.target.value)}>
            <option value="">Not chosen yet</option>
            {plan.subclass.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}

      {plan.choices.map((choice) => {
        const current = picks[choice.id] ?? choice.have;
        return (
          <fieldset key={choice.id}>
            <legend className="label">{choice.name}: {current.length} of {choice.allowed} · {cite(choice.book, choice.page)}</legend>
            {current.length > choice.allowed && <p className="notice">That is more than the {choice.allowed} the rules give at this level. It's your call.</p>}
            {choice.options.map((option) => (
              <label key={option.id} className="check">
                <input type="checkbox" checked={current.includes(option.id)} onChange={() => toggle(choice.id, choice.have, option.id)} />
                <span>{option.name}</span>
              </label>
            ))}
          </fieldset>
        );
      })}

      {plan.improvement && (
        <fieldset>
          <legend className="label">Ability Score Improvement</legend>
          <div className="segmented" role="radiogroup" aria-label="Improvement">
            <button type="button" role="radio" aria-checked={improve === 'scores'} className={improve === 'scores' ? 'active' : ''} onClick={() => setImprove('scores')}>Raise scores</button>
            <button type="button" role="radio" aria-checked={improve === 'feat'} className={improve === 'feat' ? 'active' : ''} onClick={() => setImprove('feat')}>Take a feat</button>
          </div>
          {improve === 'scores' && (
            <>
              <p className={added > 2 ? 'notice' : 'page-ref'} aria-live="polite">{added} of 2 points placed: +2 to one score, or +1 to two.{added > 2 ? " More than the rules give. It's your call." : ''}</p>
              <div className="score-rows">
                {ABILITIES.map((a) => (
                  <div key={a} className="score-row">
                    <span className="label score-name" title={ABILITY_NAMES[a]}>{a}</span>
                    <span className="score-stepper">
                      <button type="button" className="btn" onClick={() => setIncrease({ ...increase, [a]: increase[a] - 1 })} disabled={increase[a] <= 0} aria-label={`Lower the ${ABILITY_NAMES[a]} increase`}>−</button>
                      <span className="num score-base">{signed(increase[a])}</span>
                      <button type="button" className="btn" onClick={() => setIncrease({ ...increase, [a]: increase[a] + 1 })} aria-label={`Raise ${ABILITY_NAMES[a]}`}>+</button>
                    </span>
                    <span />
                    <span className="score-final"><span className="num">{doc.scores[a] + increase[a]}</span>{doc.scores[a] + increase[a] > 20 && <span className="page-ref"> over 20</span>}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {improve === 'feat' && (
            <label className="field">
              <span className="label">Feat</span>
              <select value={feat} onChange={(e) => setFeat(e.target.value)}>
                <option value="">Not chosen yet</option>
                {feats.filter((f) => !(doc.feats ?? []).includes(f.id)).map((f) => (
                  <option key={f.id} value={f.id}>{f.name}{f.prerequisite ? ` (needs ${f.prerequisite})` : ''}</option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
      )}

      {toDo.length > 0 && <p className="notice">Still open: {toDo.join('; ')}. You can level up now and finish these in Edit.</p>}
      <div className="row wrap dialog-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={confirm} disabled={waiting}>Level up to {plan.className} {plan.classLevel}</button>
      </div>
    </Dialog>
  );
}
