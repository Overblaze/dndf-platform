import {
  ABILITIES, ABILITY_NAMES, RARITIES, SKILLS, SURGE_TABS, cite, deriveSheet, newSurgeId, sheetChanges, surgeAsks, surgeOptions,
  type Ability, type CharacterDoc, type Rarity, type SurgeOption, type SurgePick, type SurgeRecord, type SurgeTab,
} from '@dndf/engine';
import { useMemo, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { RuleText } from '../components/RuleText';
import { ruleSet } from '../lib/rules';
import type { LiveCharacter } from '../lib/useCharacter';

const ARMOR = [['light', 'Light armor'], ['medium', 'Medium armor'], ['heavy', 'Heavy armor'], ['shields', 'Shields']] as const;
const WEAPONS = [['simple', 'Simple weapons'], ['martial', 'Martial weapons']] as const;
type Tab = SurgeTab | 'fruit';
const TABS: { id: Tab; name: string }[] = [...SURGE_TABS.slice(0, 4), { id: 'fruit', name: 'Devil Fruit' }, ...SURGE_TABS.slice(4)];

/** "Rare · Tier 1 · EH10 p.224" */
const optionRef = (option: SurgeOption) =>
  [String(option.entry.rarity ?? ''), typeof option.entry.tier === 'number' ? `Tier ${option.entry.tier}` : '', cite(option.entry.source.book, option.entry.source.page)].filter(Boolean).join(' · ');

/** Add a Spirit Surge: pick the surge's rarity, then any advancement. Nothing is refused; what the rules would hold back is greyed and says why. */
export function SurgeDialog({ live, onClose }: { live: LiveCharacter; onClose: () => void }) {
  const { doc, sheet } = live;
  const rules = ruleSet(doc.rulesVersion).rules;
  const [rarity, setRarity] = useState<Rarity>('Uncommon');
  const [tab, setTab] = useState<Tab>('standard');
  const [reason, setReason] = useState('');
  const [session, setSession] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [pick, setPick] = useState<SurgePick>({});

  const options = useMemo(() => {
    const tiers = Object.fromEntries(sheet.haki.colors.map((c) => [c.id, c.tier])) as Record<'armament' | 'observation' | 'supremeKing', number>;
    return surgeOptions(doc, rules, rarity, { tiers, spellcaster: sheet.resources.some((r) => /^slots\d$/.test(r.id)) });
  }, [doc, rules, rarity, sheet]);
  const option = chosen ? options.find((o) => o.entry.id === chosen) : undefined;
  const choose = (id: string | null) => { setChosen(id); setPick({}); };

  const record: SurgeRecord | null = option
    ? { id: newSurgeId(doc.surges), entry: option.entry.id, rarity, reason: reason.trim() || undefined, session: session.trim() || undefined, at: new Date().toISOString().slice(0, 10), pick: Object.keys(pick).length ? pick : undefined }
    : null;
  const next: CharacterDoc | null = record ? { ...doc, surges: [...(doc.surges ?? []), record] } : null;
  const changes = useMemo(() => (next ? sheetChanges(sheet, deriveSheet(next, rules)) : []), [next && JSON.stringify(next.surges), sheet, rules]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = () => {
    if (!next || !option) return;
    live.setDoc(next, `Spirit Surge (${rarity}): ${option.entry.name}${reason.trim() ? `, ${reason.trim()}` : ''}`);
    onClose();
  };

  if (option) {
    const asks = surgeAsks(option.entry, doc.rulesVersion);
    const pools = sheet.resources.filter((r) => r.id.startsWith('use.') && !r.id.startsWith('use.hakiFeature.'));
    return (
      <Dialog title={option.entry.name} onClose={onClose}>
        <button className="btn" onClick={() => choose(null)}>Back to the list</button>
        <p className="page-ref">{String(option.entry.typeLine ?? '')} · {option.entry.source.book} ({cite(option.entry.source.book, option.entry.source.page)})</p>
        {typeof option.entry.prerequisite === 'string' && <p className="page-ref">Prerequisite: {option.entry.prerequisite}</p>}
        <RuleText text={String(option.entry.text ?? '')} book={option.entry.source.book} />
        {option.blocked.length > 0 && (
          <p className="notice">The rules would not offer this right now ({rarity} surge): {option.blocked.join('; ').toLowerCase()}. You can still add it.</p>
        )}

        {asks.includes('abilityOrWillpower') && (
          <label className="field">
            <span className="label">Raise by 2 (maximum 20)</span>
            <select value={pick.willpower ? 'willpower' : pick.ability ?? ''} onChange={(e) => setPick(e.target.value === 'willpower' ? { willpower: true } : e.target.value ? { ability: e.target.value as Ability } : {})}>
              <option value="">Choose…</option>
              <option value="willpower">Willpower ({sheet.willpower.value})</option>
              {ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]} ({sheet.abilities[a].score})</option>)}
            </select>
          </label>
        )}
        {asks.includes('ability') && (
          <label className="field">
            <span className="label">Ability score to raise by 2 (maximum 20)</span>
            <select value={pick.ability ?? ''} onChange={(e) => setPick(e.target.value ? { ability: e.target.value as Ability } : {})}>
              <option value="">Choose…</option>
              {ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]} ({sheet.abilities[a].score})</option>)}
            </select>
          </label>
        )}
        {asks.includes('skill') && (
          <label className="field">
            <span className="label">Skill: proficiency, or expertise if you already have it</span>
            <select value={pick.skill ?? ''} onChange={(e) => setPick(e.target.value ? { skill: e.target.value } : {})}>
              <option value="">Choose…</option>
              {sheet.skills.map((s) => <option key={s.id} value={s.id} disabled={s.expertise}>{SKILLS.find((k) => k.id === s.id)?.name}{s.expertise ? ' (expertise already)' : s.proficient ? ' (proficient: becomes expertise)' : ''}</option>)}
            </select>
          </label>
        )}
        {asks.includes('proficiency') && (
          <label className="field">
            <span className="label">Weapon or armor type</span>
            <select value={pick.proficiency ? `${pick.proficiency.kind}:${pick.proficiency.id}` : ''} onChange={(e) => { const [kind, id] = e.target.value.split(':'); setPick(id ? { proficiency: { kind: kind as 'armor' | 'weapon', id } } : {}); }}>
              <option value="">Choose…</option>
              {ARMOR.map(([id, name]) => <option key={id} value={`armor:${id}`}>{name}</option>)}
              {WEAPONS.map(([id, name]) => <option key={id} value={`weapon:${id}`}>{name}</option>)}
            </select>
          </label>
        )}
        {asks.includes('resource') && (
          <label className="field">
            <span className="label">Class feature whose uses are doubled</span>
            <select value={pick.resource ?? ''} onChange={(e) => setPick(e.target.value ? { resource: e.target.value } : {})}>
              <option value="">Choose…</option>
              {pools.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.max} → {r.max * 2})</option>)}
            </select>
          </label>
        )}
        {(asks.includes('note') || asks.includes('proficiency')) && (
          <label className="field">
            <span className="label">{asks.includes('proficiency') ? 'Or write it (one weapon, say)' : 'What you chose'}</span>
            <input value={pick.note ?? ''} onChange={(e) => setPick({ ...pick, note: e.target.value || undefined })} />
          </label>
        )}
        {option.entry.id === 'surgeAdvancement.borrow_skill' && <p className="page-ref">After adding this, put the feature itself on the sheet with “Borrow a feature” on the Features tab.</p>}
        {option.entry.id === 'surgeAdvancement.quick_learner' && <p className="page-ref">After adding this, use “Level up” at the top of the sheet for the level it gives.</p>}
        {option.entry.id === 'surgeAdvancement.unjustified_reputation' && <p className="page-ref">Your bounty is yours to edit; doubling it is not done for you.</p>}

        <h3>What changes</h3>
        {changes.length > 0 ? <ul className="notes">{changes.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="soft">No number on the sheet changes. The text is added to your features.</p>}
        <div className="row wrap">
          <button className="btn btn-primary" onClick={add}>Add to {sheet.name}</button>
          <button className="btn" onClick={() => choose(null)}>Not this one</button>
        </div>
      </Dialog>
    );
  }

  const shown = options.filter((o) => o.tab === tab);
  return (
    <Dialog title="Spirit Surge" onClose={onClose}>
      <p className="page-ref">The rarity of the Spirit Surge sets the highest rarity you may choose · {cite(sheet.book, 221)}</p>
      <div className="segmented surge-rarity" role="radiogroup" aria-label="Rarity of the Spirit Surge">
        {RARITIES.map((r) => (
          <button key={r} role="radio" aria-checked={rarity === r} className={rarity === r ? 'active' : ''} onClick={() => setRarity(r)}>{r}</button>
        ))}
      </div>
      <div className="grid-2">
        <label className="field">
          <span className="label">What earned it (optional)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Beat the Marine captain" />
        </label>
        <label className="field">
          <span className="label">Session (optional)</span>
          <input value={session} onChange={(e) => setSession(e.target.value)} placeholder="Session 14" />
        </label>
      </div>
      <div className="segmented surge-tabs" role="tablist" aria-label="Kind of advancement">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.name}{t.id !== 'fruit' && <span className="num"> {options.filter((o) => o.tab === t.id).length}</span>}
          </button>
        ))}
      </div>
      {tab === 'fruit' && <p className="notice">Devil Fruit advancements are kept secret. They will show here once your DM has granted this character a fruit; granting is the next piece being built.</p>}
      {tab === 'supremeKing' && (
        <label className="field-inline">
          <input type="checkbox" checked={doc.qualitiesOfAKing === true} onChange={(e) => live.setDoc({ ...doc, qualitiesOfAKing: e.target.checked || undefined }, e.target.checked ? 'Has the Qualities of a King' : 'Does not have the Qualities of a King')} />
          <span>This character has the Qualities of a King · {cite(sheet.book, 231)}</span>
        </label>
      )}
      {tab === 'amateur' && <p className="page-ref">Variant rule: Amateur Haki is for characters of level 1–4 and becomes its Uncommon variant at level 5 · {cite(sheet.book, 221)}</p>}
      <div className="surge-list">
        {shown.map((o) => (
          <button key={o.entry.id} className={o.blocked.length ? 'surge-option held' : 'surge-option'} onClick={() => choose(o.entry.id)}>
            <span className="resource-name">{o.entry.name}{o.taken > 0 && o.entry.repeatable === true ? ` (taken ${o.taken}×)` : ''}</span>
            <span className="page-ref">{optionRef(o)}</span>
            {o.blocked.length > 0 && <span className="page-ref held-why">{o.blocked.join(' · ')}</span>}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
