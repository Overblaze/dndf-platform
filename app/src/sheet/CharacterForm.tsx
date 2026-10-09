import { ABILITIES, ABILITY_NAMES, HANDBOOKS, SKILLS, cite, crewRolesOf, otherVersion, raceChoices, racePicks as racePicksOf, speedLine, armorFromItem, classScope, deriveSheet, evaluateNumber, levelUp, newCharacter, weaponFromItem, customClassEntry, customClassId, isCustomClassId, rulesFor, type Ability, type AbilityScores, type CustomClass, type SectionDef, type ScoreOrigin, type CharacterClass, type CharacterDoc, type RulesVersion, type WeaponDef } from '@dndf/engine';
import { AbilityScoresField, originOf } from './AbilityScoresField';
import { useMemo, useState } from 'react';
import { CustomClassDialog } from './CustomClassDialog';
import { RaceChoiceFields } from './RaceChoiceFields';
import { RacePickFields } from './RacePickFields';
import { RuleText } from '../components/RuleText';
import { ruleSet, VERSION_NAMES } from '../lib/rules';

const BLANK_SCORES: AbilityScores = { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 };
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number.isFinite(n) ? n : min)));

type StepId = 'basics' | 'dm' | 'race' | 'class' | 'scores' | 'background' | 'crew' | 'equipment' | 'describe' | 'extras' | 'review';

/** Create a character of any class, or edit one: step by step in the handbook's order, or everything on one page. */
export function CharacterForm({ initial, onSave, onCancel, onCompare }: { initial: CharacterDoc | null; onSave: (doc: CharacterDoc, log: string) => void; onCancel: () => void; /** Opens the report of what would change on the other handbook. */ onCompare?: () => void }) {
  const first = initial?.classes[0];
  // A character is pinned to one handbook; it is chosen when the character is made.
  const [version, setVersion] = useState<RulesVersion>(initial?.rulesVersion ?? 'dndf-10');
  // Classes the player wrote for this character sit beside the handbook's.
  const [customClasses, setCustomClasses] = useState<CustomClass[]>(initial?.customClasses ?? []);
  const [classEditor, setClassEditor] = useState<CustomClass | 'new' | null>(null);
  const handbook = ruleSet(version);
  const rules = useMemo(() => rulesFor({ customClasses, rulesVersion: version }, handbook.rules), [customClasses, version, handbook]);
  const classes = useMemo(() => [...handbook.classes, ...customClasses.map((c) => customClassEntry(c, version))], [customClasses, version, handbook]);
  const { races, backgrounds, crewRoles, feats: allFeats, armors, weapons: armory, mainSubclasses, subracesOf, choiceFeatures } = handbook;
  const changeVersion = (next: RulesVersion) => {
    // The other handbook has its own classes, subclasses and feats: start those picks again.
    const other = ruleSet(next);
    setVersion(next);
    if (!other.rules.has(classId) && !isCustomClassId(classId)) setClassId('class.bruiser');
    setSubclass('');
    setOtherClasses([]);
    setChoices({});
    setFeats(feats.filter((id) => other.rules.has(id)));
    setCrewRoleIds(crewRoleIds.filter((id) => other.rules.has(id)));
    if (!other.rules.has(raceId)) pickRace('', '');
    else if (!other.rules.has(subraceId)) setSubraceId('');
    if (!other.rules.has(backgroundId)) setBackgroundId('');
  };
  const [name, setName] = useState(initial?.name ?? '');
  const [raceId, setRaceId] = useState(initial?.race.id ?? '');
  const [subraceId, setSubraceId] = useState(initial?.race.subraceId ?? '');
  const [raceName, setRaceName] = useState(initial?.race.name ?? 'Human (Standard)');
  const [speed, setSpeed] = useState(initial?.race.speed ?? 30);
  const [backgroundId, setBackgroundId] = useState(initial?.background?.id ?? '');
  const [crewRoleIds, setCrewRoleIds] = useState<string[]>(initial ? crewRolesOf(initial).map((r) => r.id) : []);
  const [feats, setFeats] = useState<string[]>(initial?.feats ?? []);
  const [languages, setLanguages] = useState<string[]>(initial?.languages ?? []);
  const [newLanguage, setNewLanguage] = useState('');
  const [classId, setClassId] = useState(first?.id ?? 'class.bruiser');
  const [level, setLevel] = useState(first?.level ?? 1);
  // Levels in further classes (multiclassing).
  const [otherClasses, setOtherClasses] = useState<CharacterClass[]>(initial?.classes.slice(1) ?? []);
  const setOther = (i: number, patch: Partial<CharacterClass>) => setOtherClasses(otherClasses.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const [scores, setScores] = useState<AbilityScores>(initial?.scores ?? BLANK_SCORES);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  // A new character is built step by step; an existing one opens with everything on one page.
  const [guided, setGuided] = useState(!initial);
  const [step, setStep] = useState<StepId>('basics');
  const [scoreOrigin, setScoreOrigin] = useState<ScoreOrigin>(originOf(initial?.scores ?? BLANK_SCORES, initial?.scoreOrigin));
  const [subclass, setSubclass] = useState(first?.subclass ?? '');
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? []);
  const [expertise, setExpertise] = useState<string[]>(initial?.expertise ?? []);
  const [choices, setChoices] = useState<Record<string, string[]>>(initial?.choices ?? {});
  const [armor, setArmor] = useState(initial?.armor ?? null);
  const [shield, setShield] = useState(initial?.shield ?? false);
  const [weapons, setWeapons] = useState<WeaponDef[]>(initial?.weapons ?? []);
  const [strengthenSelf, setStrengthenSelf] = useState(initial?.willpower.strengthenSelf ?? 0);

  const subraces = raceId ? subracesOf(raceId) : [];
  // Picking from the book fills in the name and walking speed; both can still be changed by hand.
  const pickRace = (nextRace: string, nextSub: string) => {
    setRaceId(nextRace);
    setSubraceId(nextSub);
    const race = rules.get(nextRace);
    const sub = rules.get(nextSub);
    if (!race) return;
    setRaceName(sub ? `${race.name} (${sub.name})` : race.name);
    const walk = sub?.speed ?? race.speed;
    if (typeof walk === 'number') setSpeed(walk);
  };
  const granted = [rules.get(backgroundId), ...crewRoleIds.map((id) => rules.get(id))].flatMap((e) => ((e?.skills ?? []) as string[]).map((id) => `${SKILLS.find((k) => k.id === id)?.name ?? id} (${e!.name})`));
  const cls = classes.find((c) => c.id === classId) ?? classes[0]!;
  const subclassLevel = cls.subclass?.level ?? 3;
  const styles = mainSubclasses(cls.id);
  // Every feature that asks for picks: the main class and its subclass, then each multiclass and its subclass.
  const pickFrom = [
    { of: cls, at: level, sub: level >= subclassLevel ? subclass : undefined },
    ...otherClasses.flatMap((other) => {
      const of = classes.find((c) => c.id === other.id);
      return of ? [{ of, at: other.level, sub: other.level >= (of.subclass?.level ?? 3) ? other.subclass : undefined }] : [];
    }),
  ];
  const picks = pickFrom.flatMap(({ of, at, sub }) =>
    choiceFeatures(of, sub).filter((f) => f.level <= at).map((f) => ({ ...f, known: evaluateNumber(f.choices.count, classScope({ cls: of, classLevel: at, scores })), book: of.source.book })),
  );
  const classSkills = cls.proficiencies as { skills?: { choose?: number; from?: string[] | string; text?: string } } | undefined;
  const skillHint = classSkills?.skills?.choose
    ? `${cls.name}: choose ${classSkills.skills.choose} from ${Array.isArray(classSkills.skills.from) ? classSkills.skills.from.map((id) => SKILLS.find((k) => k.id === id)?.name ?? id).join(', ') : 'any skills'}`
    : classSkills?.skills?.text ?? '';
  // The race's own pick-lists (Cyborg Upgrades), at the character's whole level.
  const racePicks = raceChoices({ race: { id: raceId || undefined, subraceId: subraceId || undefined, name: '', speed: 30 }, classes: [{ id: cls.id, level }, ...otherClasses], choices }, rules);
  // What those traits and upgrades leave to choose (a skill, a tool, a weapon). One whose upgrade is unticked is dropped on saving.
  const nestedPicks = racePicksOf({ race: { id: raceId || undefined, subraceId: subraceId || undefined, name: '', speed: 30 }, classes: [{ id: cls.id, level }, ...otherClasses], choices, background: backgroundId ? { id: backgroundId } : undefined }, rules);
  // Tools a class or a background leaves to choose stand with the proficiencies, further down; the race's own stand with the race.
  const isToolPick = (key: string) => /^pick\.(class|background)\./.test(key);
  const fixedTools = [rules.get(backgroundId), ...crewRoleIds.map((id) => rules.get(id))].flatMap((e) => (((e?.tools as { fixed?: string[] } | undefined)?.fixed) ?? []).map((tool) => `${tool} (${e!.name})`));
  const keptChoices = Object.fromEntries([
    ...picks.map((f) => [f.choices.id, choices[f.choices.id] ?? []] as const),
    ...racePicks.filter((c) => (choices[c.id] ?? []).length > 0).map((c) => [c.id, choices[c.id]!] as const),
    ...nestedPicks.filter((p) => p.picked.length > 0).map((p) => [p.key, p.picked] as const),
  ]);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const setWeapon = (i: number, patch: Partial<WeaponDef>) => setWeapons(weapons.map((w, j) => (j === i ? { ...w, ...patch } : w)));

  /** The character as the form stands: what Create or Save would write. */
  const buildDoc = (): CharacterDoc => {
    const shared = {
      name: name.trim() || 'Unnamed', rulesVersion: version, classId: cls.id, level, scores, raceName: raceName.trim() || 'Human', speed, subclass: subclass || undefined, skills, choices: keptChoices,
      raceId: raceId || undefined, subraceId: subraceId || undefined, backgroundId: backgroundId || undefined, crewRoleIds, feats,
    };
    if (!initial) {
      const built = newCharacter(shared, rules);
      const doc: CharacterDoc = { ...built, languages: languages.length ? languages : undefined, customClasses, notes, scoreOrigin, classes: [...built.classes, ...otherClasses], expertise, armor, shield, weapons, willpower: { strengthenSelf: version === 'dndf-10' ? strengthenSelf : 0 } };
      doc.state.hp = deriveSheet(doc, rules).maxHp.value;
      return doc;
    }
    const oldMax = deriveSheet(initial, rules).maxHp.value;
    // Going up exactly one level is a level-up (Dream Points reset); anything else is a plain edit.
    const base = level === first!.level + 1 && cls.id === first!.id ? levelUp(initial) : initial;
    const doc: CharacterDoc = {
      ...base,
      name: shared.name,
      race: { ...initial.race, id: shared.raceId, subraceId: shared.subraceId, name: shared.raceName, speed },
      background: shared.backgroundId ? { id: shared.backgroundId } : undefined,
      crewRoles: shared.crewRoleIds.map((id) => ({ id })),
      crewRole: undefined,
      feats,
      languages: languages.length ? languages : undefined,
      classes: [{ ...base.classes[0]!, id: cls.id, level, subclass: level >= subclassLevel ? shared.subclass : undefined }, ...otherClasses],
      scores,
      scoreOrigin,
      skills,
      expertise,
      choices: keptChoices,
      armor,
      shield,
      weapons,
      notes,
      customClasses,
      willpower: { ...initial.willpower, strengthenSelf: version === 'dndf-10' ? strengthenSelf : 0 },
    };
    const newMax = deriveSheet(doc, rules).maxHp.value;
    // A character at full health stays at full health when the maximum changes.
    if (initial.state.hp === oldMax) doc.state = { ...doc.state, hp: newMax };
    return doc;
  };
  const save = () => {
    const doc = buildDoc();
    if (!initial) return onSave(doc, `Created ${doc.name}`);
    onSave(doc, level !== first!.level ? `Level ${first!.level} → ${level}` : 'Character edited');
  };

  // --- The book's steps (EH10 p.9–10), one screen each; or everything on one page. ---
  const guide = ((rules.get('rule.character_creation_guide')?.sections ?? []) as SectionDef[]);
  const bookStep = (n: number) => guide.find((s) => s.name.startsWith(`Step ${n}:`));
  const STEPS: { id: StepId; title: string; book?: number[] }[] = [
    { id: 'basics', title: 'Name, handbook and level' },
    { id: 'dm', title: 'Your DM’s choices', book: [1, 2, 3, 4] },
    { id: 'race', title: bookStep(5)?.name ?? 'Choose a race', book: [5] },
    { id: 'class', title: bookStep(6)?.name ?? 'Choose a class', book: [6] },
    { id: 'scores', title: bookStep(7)?.name ?? 'Determine ability scores', book: [7] },
    { id: 'background', title: bookStep(8)?.name ?? 'Pick a background', book: [8] },
    { id: 'crew', title: bookStep(9)?.name ?? 'Pick your crew role', book: [9] },
    { id: 'equipment', title: bookStep(10)?.name ?? 'Choose equipment', book: [10] },
    { id: 'describe', title: 'Describe your character, backstory and dream', book: [11, 12] },
    { id: 'extras', title: 'Feats and Willpower' },
    { id: 'review', title: 'Review' },
  ];
  const at = STEPS.findIndex((s) => s.id === step);
  const show = (id: StepId) => !guided || step === id;
  const current = STEPS[at]!;
  const draft = buildDoc();
  const draftSheet = deriveSheet(draft, rules);
  const open = [
    ...(name.trim() ? [] : ['No name yet']),
    ...(level >= subclassLevel && styles.length > 0 && !subclass ? [`${cls.subclass?.label ?? 'Subclass'} not chosen`] : []),
    ...picks.filter((f) => (choices[f.choices.id] ?? []).length < f.known).map((f) => `${f.name}: ${(choices[f.choices.id] ?? []).length} of ${f.known} picked`),
    ...racePicks.filter((c) => (choices[c.id] ?? []).length < c.allowed).map((c) => `${c.name}: ${(choices[c.id] ?? []).length} of ${c.allowed} picked`),
    ...(scoreOrigin.method === 'array' || scoreOrigin.method === 'roll'
      ? ABILITIES.filter((a) => (scoreOrigin.assignment ?? {})[a] == null).length > 0 ? ['Some ability scores have no number yet'] : [] : []),
    ...(backgroundId ? [] : ['No background chosen']),
    ...(crewRoleIds.length ? [] : ['No crew role chosen']),
  ];
  const bookText = (current.book ?? []).map(bookStep).filter((s): s is SectionDef => Boolean(s));
  const stepHead = guided ? (
    <div className="builder-head">
      <div className="row wrap">
        <span className="chip" aria-live="polite">Step {at + 1} of {STEPS.length}</span>
        <select value={step} onChange={(e) => setStep(e.target.value as StepId)} aria-label="Go to step">
          {STEPS.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.title.replace(/^Step \d+: /, '')}</option>)}
        </select>
        <button type="button" className="btn" onClick={() => setGuided(false)}>All on one page</button>
      </div>
      <h3 className="builder-title">{current.title.replace(/^Step \d+: /, '')}</h3>
      {bookText.length > 0 && (
        <details className="feature">
          <summary>
            <span className="resource-name">What the handbook says · step{current.book!.length > 1 ? 's' : ''} {current.book!.join(', ')}</span>
            <span className="page-ref">{cite(HANDBOOKS[version], bookText[0]!.page)}</span>
          </summary>
          {bookText.map((s) => <RuleText key={s.name} text={bookText.length > 1 ? `${s.name}\n${s.text}` : s.text} tables={s.tables} book={HANDBOOKS[version]} />)}
        </details>
      )}
    </div>
  ) : (
    <div className="row wrap">
      <button type="button" className="btn" onClick={() => setGuided(true)}>Step by step</button>
    </div>
  );
  const dmStep = guided && step === 'dm' ? (
    <p className="notice">Your DM settles these four steps: your Devil Fruit or Haki, how the fruit scales, universal features and special reactions. Nothing to fill in here: your DM grants a Devil Fruit from the DM page once your character is in the campaign (Crew page), and Haki is added on the sheet with “+ Spirit Surge”.</p>
  ) : null;
  const describeStep = show('describe') ? (
    <label className="field">
      <span className="label">Description, backstory and dream (kept as the sheet’s notes)</span>
      <textarea rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} />
    </label>
  ) : null;
  const reviewStep = guided && step === 'review' ? (
    <div className="builder-review">
      <p><strong>{draftSheet.name || 'Unnamed'}</strong> · {draftSheet.summary}</p>
      <dl className="facts facts-plain">
        <dt>Hit points</dt><dd>{draftSheet.maxHp.value} <span className="page-ref">({draftSheet.maxHp.lines.map((line) => `${line.label} ${Number(line.value) < 0 ? '−' : ''}${Math.abs(Number(line.value))}`).join(' · ')})</span></dd>
        <dt>Armor Class</dt><dd>{draftSheet.ac.value}</dd>
        <dt>Speed</dt><dd>{speedLine(draftSheet)}</dd>
        <dt>Scores</dt><dd>{ABILITIES.map((a) => `${a.toUpperCase()} ${draftSheet.abilities[a].score}`).join(' · ')}</dd>
        <dt>Skills</dt><dd>{draftSheet.skills.filter((k) => k.proficient).map((k) => k.label).join(', ') || 'None'}</dd>
      </dl>
      {draftSheet.warnings.map((w) => <p key={w} className="notice">{w}</p>)}
      {open.length > 0
        ? <p className="notice">Still open: {open.join('; ')}. You can {initial ? 'save' : 'create the character'} now and finish these later in Edit.</p>
        : <p className="page-ref">Every step has an answer.</p>}
    </div>
  ) : null;
  const stepFoot = (
    <div className="row wrap dialog-actions builder-foot">
      <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      {guided && at > 0 && <button type="button" className="btn" onClick={() => setStep(STEPS[at - 1]!.id)}>Back</button>}
      {guided && at < STEPS.length - 1 && <button type="button" className="btn btn-primary" onClick={() => setStep(STEPS[at + 1]!.id)}>Next: {STEPS[at + 1]!.title.replace(/^Step \d+: /, '')}</button>}
      {(!guided || at === STEPS.length - 1 || initial) && <button type="submit" className={guided && at < STEPS.length - 1 ? 'btn' : 'btn btn-primary'}>{initial ? 'Save changes' : 'Create character'}</button>}
    </div>
  );

  return (
    <>
    <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      {stepHead}
      {show('basics') && (
        <>
      <label className="field">
        <span className="label">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
      </label>
      {initial ? (
        <p className="page-ref">
          Built with {VERSION_NAMES[version]}. A character stays on the handbook it was made with.{' '}
          {onCompare && <button type="button" className="btn" onClick={onCompare}>See what would change on {VERSION_NAMES[otherVersion(version)]}</button>}
        </p>
      ) : (
        <div className="field">
          <span className="label">Handbook</span>
          <div className="segmented" role="radiogroup" aria-label="Handbook">
            {(Object.keys(VERSION_NAMES) as RulesVersion[]).map((v) => (
              <button type="button" key={v} role="radio" aria-checked={version === v} className={version === v ? 'active' : ''} onClick={() => changeVersion(v)}>
                {VERSION_NAMES[v]}
              </button>
            ))}
          </div>
        </div>
      )}
        </>
      )}
      {dmStep}
      {show('race') && (
        <>
      <div className="grid-2">
        <label className="field">
          <span className="label">Race from the book</span>
          <select value={raceId} onChange={(e) => pickRace(e.target.value, '')}>
            <option value="">Typed in by hand</option>
            {races.map((race) => <option key={race.id} value={race.id}>{race.name}{race.optional ? ' (optional)' : ''}</option>)}
          </select>
        </label>
        {subraces.length > 0 && (
          <label className="field">
            <span className="label">Subrace</span>
            <select value={subraceId} onChange={(e) => pickRace(raceId, e.target.value)}>
              <option value="">Not chosen yet</option>
              {subraces.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <RaceChoiceFields
        choices={racePicks} picked={choices} onChange={(id, next) => setChoices({ ...choices, [id]: next })} withText
        under={(choiceId, optionId) => <RacePickFields picks={nestedPicks.filter((p) => p.key.startsWith(`pick.${choiceId}.${optionId}.`))} weapons={handbook.weapons.map((w) => w.name)} onChange={(pick, next) => setChoices({ ...choices, [pick.key]: next })} />}
      />
      <RacePickFields picks={nestedPicks.filter((p) => !isToolPick(p.key) && !racePicks.some((c) => p.key.startsWith(`pick.${c.id}.`)))} weapons={handbook.weapons.map((w) => w.name)} onChange={(pick, next) => setChoices({ ...choices, [pick.key]: next })} />
      <div className="grid-2">
        <label className="field">
          <span className="label">Race shown on the sheet</span>
          <input value={raceName} onChange={(e) => setRaceName(e.target.value)} maxLength={60} />
        </label>
        <label className="field">
          <span className="label">Base speed (ft)</span>
          <input type="number" inputMode="numeric" value={speed} onChange={(e) => setSpeed(clamp(Number(e.target.value), 0, 200))} />
        </label>
      </div>
        </>
      )}
      {show('class') && (
        <>
      <div className="grid-2">
        <label className="field">
          <span className="label">Class · {cite(cls.source.book, cls.source.page)}</span>
          <select value={cls.id} onChange={(e) => { setClassId(e.target.value); setSubclass(''); }}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">Level</span>
          <input type="number" inputMode="numeric" min={1} max={20} value={level} onChange={(e) => setLevel(clamp(Number(e.target.value), 1, 20))} />
        </label>
      </div>
      <div className="custom-classes">
        {customClasses.map((c) => (
          <div key={c.id} className="resource">
            <div>
              <div className="resource-name">{c.name || 'Custom class'}</div>
              <div className="page-ref">Your own class · d{c.hitDie} · {c.features.length} feature{c.features.length === 1 ? '' : 's'}</div>
            </div>
            <button type="button" className="btn" onClick={() => setClassEditor(c)}>Edit class</button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setClassEditor('new')}>Write a custom class</button>
      </div>
      <fieldset>
        <legend className="label">Multiclassing: levels in other classes · {cite(HANDBOOKS[version], version === 'dndf-10' ? 209 : 208)}</legend>
        <p className="page-ref">
          {version === 'dndf-10' ? '' : 'This handbook does not say what a second class gives; the v10 handbook’s rule (p.209) is used: '}
          “When you gain your first level in a class other than your initial class, you gain all of new class’s starting armor, weapon, and tool proficiencies.” Not its saving throws, and not its skills: those come from your first class only.
        </p>
        {otherClasses.map((other, i) => {
          const otherClass = classes.find((c) => c.id === other.id);
          const otherStyles = mainSubclasses(other.id);
          return (
            <div key={i} className="weapon-edit">
              <div className="grid-3">
                <label className="field">
                  <span className="label">Class</span>
                  <select value={other.id} onChange={(e) => setOther(i, { id: e.target.value, subclass: undefined })}>
                    {classes.filter((c) => c.id !== cls.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Levels</span>
                  <input type="number" inputMode="numeric" min={1} max={20} value={other.level} onChange={(e) => setOther(i, { level: clamp(Number(e.target.value), 1, 20) })} aria-label={`Levels in ${otherClass?.name ?? 'the other class'}`} />
                </label>
                {other.level >= (otherClass?.subclass?.level ?? 3) && otherStyles.length > 0 && (
                  <label className="field">
                    <span className="label">{otherClass?.subclass?.label ?? 'Subclass'}</span>
                    <select value={other.subclass ?? ''} onChange={(e) => setOther(i, { subclass: e.target.value || undefined })}>
                      <option value="">Not chosen yet</option>
                      {otherStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <button type="button" className="btn" onClick={() => setOtherClasses(otherClasses.filter((_, j) => j !== i))}>Remove this class</button>
            </div>
          );
        })}
        <button type="button" className="btn" onClick={() => setOtherClasses([...otherClasses, { id: classes.find((c) => c.id !== cls.id && !otherClasses.some((o) => o.id === c.id))?.id ?? classes[0]!.id, level: 1 }])}>
          Add another class
        </button>
        {otherClasses.length > 0 && <p className="page-ref">Total level {level + otherClasses.reduce((n, c) => n + c.level, 0)}. The class above is the first class: it gives the saving throws and the full first hit die.</p>}
      </fieldset>
        </>
      )}
      {show('scores') && (
        <>
      <AbilityScoresField origin={scoreOrigin} book={HANDBOOKS[version]} onChange={(next, origin) => { setScores(next); setScoreOrigin(origin); }} />
        </>
      )}
      {show('class') && (
        <>
      {level >= subclassLevel && styles.length > 0 && (
        <label className="field">
          <span className="label">{cls.subclass?.label ?? 'Subclass'} · level {subclassLevel}</span>
          <select value={subclass} onChange={(e) => setSubclass(e.target.value)}>
            <option value="">Not chosen yet</option>
            {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
          </select>
        </label>
      )}
      {picks.map((feature) => {
        const picked = choices[feature.choices.id] ?? [];
        const known = feature.known;
        return (
          <fieldset key={feature.choices.id}>
            <legend className="label">{feature.from === cls.name ? '' : `${feature.from}: `}{feature.name} options: {picked.length} of {known} · {cite(feature.book, feature.page)}</legend>
            {picked.length > known && <p className="notice">That is more than the {known} the rules give at this level. It's your call.</p>}
            {feature.options.map((option) => (
              <label key={option.id} className="check">
                <input type="checkbox" checked={picked.includes(option.id)} onChange={() => setChoices({ ...choices, [feature.choices.id]: toggle(picked, option.id) })} />
                <span>{option.name}</span>
              </label>
            ))}
          </fieldset>
        );
      })}
        </>
      )}
      {show('background') && (
        <>
      <div className="grid-2">
        <label className="field">
          <span className="label">Background</span>
          <select value={backgroundId} onChange={(e) => setBackgroundId(e.target.value)}>
            <option value="">None chosen</option>
            {backgrounds.map((bg) => <option key={bg.id} value={bg.id}>{bg.name}</option>)}
          </select>
        </label>
      </div>
        </>
      )}
      {show('crew') && (
        <>
      <fieldset>
        <legend className="label">Crew roles: {crewRoleIds.length}</legend>
        <div className="chips">
          {crewRoleIds.map((id) => (
            <button type="button" key={id} className="chip chip-btn chip-on" onClick={() => setCrewRoleIds(crewRoleIds.filter((r) => r !== id))} aria-label={`Remove ${rules.get(id)?.name ?? id}`}>
              {rules.get(id)?.name ?? id} ×
            </button>
          ))}
        </div>
        <select value="" onChange={(e) => e.target.value && setCrewRoleIds([...crewRoleIds, e.target.value])} aria-label="Add a crew role">
          <option value="">{crewRoleIds.length ? 'Add another crew role…' : 'Add a crew role…'}</option>
          {crewRoles.filter((role) => !crewRoleIds.includes(role.id)).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      </fieldset>
        </>
      )}
      {show('extras') && (
        <>
      <fieldset>
        <legend className="label">Feats: {feats.length}</legend>
        <div className="chips">
          {feats.map((id) => (
            <button type="button" key={id} className="chip chip-btn chip-on" onClick={() => setFeats(feats.filter((f) => f !== id))} aria-label={`Remove ${rules.get(id)?.name ?? id}`}>
              {rules.get(id)?.name ?? id} ×
            </button>
          ))}
        </div>
        <select value="" onChange={(e) => e.target.value && setFeats([...feats, e.target.value])} aria-label="Add a feat">
          <option value="">Add a feat…</option>
          {allFeats.filter((feat) => !feats.includes(feat.id)).map((feat) => (
            <option key={feat.id} value={feat.id}>{feat.name}{feat.prerequisite ? ` (needs ${feat.prerequisite})` : ''}</option>
          ))}
        </select>
      </fieldset>
        </>
      )}
      {show('class') && (
        <>
      <fieldset>
        <legend className="label">Skill proficiencies you chose (class and others)</legend>
        {skillHint && <p className="page-ref">{skillHint}</p>}
        {granted.length > 0 && <p className="page-ref">Added automatically: {granted.join(', ')}</p>}
        <div className="grid-checks">
          {SKILLS.map((skill) => (
            <label key={skill.id} className="check">
              <input type="checkbox" checked={skills.includes(skill.id)} onChange={() => setSkills(toggle(skills, skill.id))} />
              <span>{skill.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Tool proficiencies</legend>
        <p className="page-ref">{fixedTools.length ? `Added automatically: ${fixedTools.join(', ')}.` : 'Your background and crew roles name no tool outright.'} Your class’s own tools are added too.</p>
        <RacePickFields picks={nestedPicks.filter((p) => isToolPick(p.key))} weapons={handbook.weapons.map((w) => w.name)} onChange={(pick, next) => setChoices({ ...choices, [pick.key]: next })} />
      </fieldset>
      <fieldset>
        <legend className="label">Languages: {draftSheet.spoken.length} · {cite(HANDBOOKS[version], 20)}</legend>
        <p className="page-ref">
          The One Piece world uses one universal language, so backgrounds give none. If your DM adds languages, the book lets you swap one of your tool proficiencies for one: add it here and leave that tool unchosen.
        </p>
        <div className="chips">
          {draftSheet.spoken.filter((l) => l.from !== 'Added by you').map((l) => <span key={l.id} className="chip">{l.name}</span>)}
          {languages.map((language) => (
            <button type="button" key={language} className="chip chip-btn chip-on" onClick={() => setLanguages(languages.filter((l) => l !== language))} aria-label={`Remove ${language}`}>{language} ×</button>
          ))}
        </div>
        <div className="row">
          <input value={newLanguage} maxLength={60} onChange={(e) => setNewLanguage(e.target.value)} placeholder="A language your DM has added" aria-label="A language to add"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newLanguage.trim() && !languages.includes(newLanguage.trim())) setLanguages([...languages, newLanguage.trim()]); setNewLanguage(''); } }} />
          <button type="button" className="btn" disabled={!newLanguage.trim()} onClick={() => { if (!languages.includes(newLanguage.trim())) setLanguages([...languages, newLanguage.trim()]); setNewLanguage(''); }}>Add</button>
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Expertise (proficiency bonus doubled): {expertise.length}</legend>
        <div className="chips">
          {expertise.map((id) => (
            <button type="button" key={id} className="chip chip-btn chip-on" onClick={() => setExpertise(expertise.filter((x) => x !== id))} aria-label={`Remove expertise in ${SKILLS.find((k) => k.id === id)?.name ?? id}`}>
              {SKILLS.find((k) => k.id === id)?.name ?? id} ×
            </button>
          ))}
        </div>
        <select value="" onChange={(e) => e.target.value && setExpertise([...expertise, e.target.value])} aria-label="Add expertise in a skill">
          <option value="">Add expertise in a skill…</option>
          {SKILLS.filter((skill) => !expertise.includes(skill.id)).map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
        </select>
        <p className="page-ref">Expertise only counts for skills the character is proficient in.</p>
      </fieldset>
        </>
      )}
      {show('equipment') && (
        <>
      <fieldset>
        <legend className="label">Armor and shield</legend>
        <select
          value=""
          onChange={(e) => {
            const picked = rules.get(e.target.value);
            if (picked) setArmor(armorFromItem(picked));
          }}
          aria-label="Pick armor from the armory"
        >
          <option value="">Pick armor from the armory…</option>
          {armors.map((item) => {
            const worn = armorFromItem(item)!;
            return (
              <option key={item.id} value={item.id}>
                {item.name}: AC {worn.base}{worn.dexCap === null ? ' + Dex' : worn.dexCap ? ` + Dex (max ${worn.dexCap})` : ''}{item.strength ? `, Str ${item.strength}` : ''}
              </option>
            );
          })}
        </select>
        <label className="check">
          <input type="checkbox" checked={armor !== null} onChange={(e) => setArmor(e.target.checked ? { name: 'Custom armor', base: 11, dexCap: null } : null)} />
          <span>Wearing armor</span>
        </label>
        {armor && (
          <div className="grid-3">
            <label className="field">
              <span className="label">Armor</span>
              <input value={armor.name} onChange={(e) => setArmor({ ...armor, name: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Base AC</span>
              <input type="number" inputMode="numeric" value={armor.base} onChange={(e) => setArmor({ ...armor, base: clamp(Number(e.target.value), 0, 40) })} />
            </label>
            <label className="field">
              <span className="label">Max Dex (blank = none)</span>
              <input type="number" inputMode="numeric" value={armor.dexCap ?? ''} onChange={(e) => setArmor({ ...armor, dexCap: e.target.value === '' ? null : clamp(Number(e.target.value), 0, 10) })} />
            </label>
          </div>
        )}
        {armor && (
          <label className="field">
            <span className="label">Proficient with this armor</span>
            <select
              value={armor.proficient === undefined ? '' : armor.proficient ? 'yes' : 'no'}
              onChange={(e) => setArmor({ ...armor, proficient: e.target.value === '' ? undefined : e.target.value === 'yes' })}
            >
              <option value="">Use calculated (class, subclass and feats)</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={shield} onChange={(e) => setShield(e.target.checked)} />
          <span>Carrying a shield (+2)</span>
        </label>
      </fieldset>
      <fieldset>
        <legend className="label">Weapons (unarmed strike is always listed)</legend>
        {weapons.map((weapon, i) => (
          <div key={weapon.id} className="weapon-edit">
            <div className="grid-3">
              <label className="field">
                <span className="label">Name</span>
                <input value={weapon.name} onChange={(e) => setWeapon(i, { name: e.target.value })} />
              </label>
              <label className="field">
                <span className="label">Damage dice</span>
                <input value={weapon.damage} onChange={(e) => setWeapon(i, { damage: e.target.value })} pattern="\s*\d*d\d+(\s*[+\-]\s*\d+)?\s*" title="Like 1d6 or 2d6 + 1" />
              </label>
              <label className="field">
                <span className="label">Damage type</span>
                <input value={weapon.damageType} onChange={(e) => setWeapon(i, { damageType: e.target.value })} />
              </label>
            </div>
            <div className="row wrap">
              <select value={weapon.category} onChange={(e) => setWeapon(i, { category: e.target.value as WeaponDef['category'] })} aria-label="Weapon category">
                <option value="simple">Simple</option>
                <option value="martial">Martial</option>
                <option value="improvised">Improvised</option>
              </select>
              {(['ranged', 'finesse', 'twoHanded'] as const).map((flag) => (
                <label key={flag} className="check">
                  <input type="checkbox" checked={Boolean(weapon[flag])} onChange={(e) => setWeapon(i, { [flag]: e.target.checked })} />
                  <span>{flag === 'twoHanded' ? 'Two-handed' : flag[0]!.toUpperCase() + flag.slice(1)}</span>
                </label>
              ))}
              <label className="field-inline">
                <span className="label">Attacks with</span>
                <select className="wide-select" value={weapon.ability ?? ''} onChange={(e) => setWeapon(i, { ability: (e.target.value || undefined) as Ability | undefined })} aria-label={`Ability ${weapon.name} attacks with`}>
                  <option value="">Automatic</option>
                  {ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]}</option>)}
                </select>
              </label>
              <label className="field-inline">
                <span className="label">Bonus</span>
                <input type="number" inputMode="numeric" value={weapon.bonus ?? 0} onChange={(e) => setWeapon(i, { bonus: clamp(Number(e.target.value), -5, 10) })} />
              </label>
              <button type="button" className="btn" onClick={() => setWeapons(weapons.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        ))}
        <select
          value=""
          onChange={(e) => {
            const picked = rules.get(e.target.value);
            const weapon = picked && weaponFromItem(picked, crypto.randomUUID());
            if (weapon) setWeapons([...weapons, weapon]);
          }}
          aria-label="Add a weapon from the armory"
        >
          <option value="">Add a weapon from the armory…</option>
          {(['simple', 'martial'] as const).map((category) => (
            <optgroup key={category} label={category === 'simple' ? 'Simple weapons' : 'Martial weapons'}>
              {armory.filter((item) => item.category === category).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}: {String(item.damage)} {String(item.damageType)}{item.properties ? ` (${String(item.properties).toLowerCase()})` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => setWeapons([...weapons, { id: crypto.randomUUID(), name: 'Custom weapon', damage: '1d6', damageType: 'bludgeoning', category: 'simple' }])}>
          Add a custom weapon
        </button>
      </fieldset>
        </>
      )}
      {show('extras') && (
        <>
      {version === 'dndf-10' ? (
        <label className="field">
          <span className="label">Strengthen Self taken for Willpower, not counting any added with “+ Spirit Surge” (+2 each, total capped at 20) · {cite(HANDBOOKS[version], 222)}</span>
          <input type="number" inputMode="numeric" min={0} value={strengthenSelf} onChange={(e) => setStrengthenSelf(clamp(Number(e.target.value), 0, 10))} />
        </label>
      ) : (
        <p className="page-ref">In v8.8, Strengthen Self raises an ability score, not Willpower, so add it to the scores above · {cite(HANDBOOKS[version], 222)}</p>
      )}
        </>
      )}
      {describeStep}
      {reviewStep}
      {stepFoot}
    </form>
    {/* Outside the form, so Enter in the class editor cannot submit the character. */}
    {classEditor && (
      <CustomClassDialog
        initial={classEditor === 'new' ? undefined : classEditor}
        inUse={classEditor !== 'new' && [classId, ...otherClasses.map((o) => o.id)].includes(customClassId(classEditor.id))}
        onSave={(saved) => {
          const exists = customClasses.some((c) => c.id === saved.id);
          setCustomClasses(exists ? customClasses.map((c) => (c.id === saved.id ? saved : c)) : [...customClasses, saved]);
          if (!exists) { setClassId(customClassId(saved.id)); setSubclass(''); }
          setClassEditor(null);
        }}
        onDelete={classEditor === 'new' ? undefined : () => { setCustomClasses(customClasses.filter((c) => c.id !== classEditor.id)); setClassEditor(null); }}
        onClose={() => setClassEditor(null)}
      />
    )}
    </>
  );
}
