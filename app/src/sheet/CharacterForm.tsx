import { ABILITIES, ABILITY_NAMES, SKILLS, deriveSheet, levelUp, newBruiser, proficiencyBonus, type AbilityScores, type CharacterDoc, type WeaponDef } from '@dndf/engine';
import { useState } from 'react';
import { bruiserStyles, furyOptions, rules } from '../lib/rules';

const BLANK_SCORES: AbilityScores = { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 };
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number.isFinite(n) ? n : min)));

/** Create a Bruiser or edit one. The full builder (every class, the book's 12 steps) comes in phase 4. */
export function CharacterForm({ initial, onSave, onCancel }: { initial: CharacterDoc | null; onSave: (doc: CharacterDoc, log: string) => void; onCancel: () => void }) {
  const first = initial?.classes[0];
  const [name, setName] = useState(initial?.name ?? '');
  const [raceName, setRaceName] = useState(initial?.race.name ?? 'Human (Standard)');
  const [speed, setSpeed] = useState(initial?.race.speed ?? 30);
  const [level, setLevel] = useState(first?.level ?? 1);
  const [scores, setScores] = useState<AbilityScores>(initial?.scores ?? BLANK_SCORES);
  const [subclass, setSubclass] = useState(first?.subclass ?? '');
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? []);
  const [fury, setFury] = useState<string[]>(initial?.choices.furyFeatures ?? []);
  const [armor, setArmor] = useState(initial?.armor ?? null);
  const [shield, setShield] = useState(initial?.shield ?? false);
  const [weapons, setWeapons] = useState<WeaponDef[]>(initial?.weapons ?? []);
  const [strengthenSelf, setStrengthenSelf] = useState(initial?.willpower.strengthenSelf ?? 0);

  const furyKnown = level >= 2 ? proficiencyBonus(level) : 0;
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const setWeapon = (i: number, patch: Partial<WeaponDef>) => setWeapons(weapons.map((w, j) => (j === i ? { ...w, ...patch } : w)));

  const save = () => {
    const shared = { name: name.trim() || 'Unnamed', level, scores, raceName: raceName.trim() || 'Human', speed, subclass: subclass || undefined, skills, furyFeatures: fury };
    if (!initial) {
      const doc = { ...newBruiser(shared, rules), armor, shield, weapons, willpower: { strengthenSelf } };
      doc.state.hp = deriveSheet(doc, rules).maxHp.value;
      return onSave(doc, `Created ${doc.name}`);
    }
    const oldMax = deriveSheet(initial, rules).maxHp.value;
    // Going up exactly one level is a level-up (Dream Points reset); anything else is a plain edit.
    const base = level === first!.level + 1 ? levelUp(initial) : initial;
    const doc: CharacterDoc = {
      ...base,
      name: shared.name,
      race: { ...initial.race, name: shared.raceName, speed },
      classes: [{ ...base.classes[0]!, level, subclass: level >= 3 ? shared.subclass : undefined }, ...base.classes.slice(1)],
      scores,
      skills,
      choices: { ...initial.choices, furyFeatures: level >= 2 ? fury : [] },
      armor,
      shield,
      weapons,
      willpower: { ...initial.willpower, strengthenSelf },
    };
    const newMax = deriveSheet(doc, rules).maxHp.value;
    // A character at full health stays at full health when the maximum changes.
    if (initial.state.hp === oldMax) doc.state = { ...doc.state, hp: newMax };
    onSave(doc, level !== first!.level ? `Level ${first!.level} → ${level}` : 'Character edited');
  };

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label className="field">
        <span className="label">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
      </label>
      <div className="grid-2">
        <label className="field">
          <span className="label">Race</span>
          <input value={raceName} onChange={(e) => setRaceName(e.target.value)} maxLength={60} />
        </label>
        <label className="field">
          <span className="label">Base speed (ft)</span>
          <input type="number" inputMode="numeric" value={speed} onChange={(e) => setSpeed(clamp(Number(e.target.value), 0, 200))} />
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          <span className="label">Class</span>
          <input value="Bruiser (rules v10)" disabled />
        </label>
        <label className="field">
          <span className="label">Level</span>
          <input type="number" inputMode="numeric" min={1} max={20} value={level} onChange={(e) => setLevel(clamp(Number(e.target.value), 1, 20))} />
        </label>
      </div>
      <fieldset>
        <legend className="label">Ability scores (after race and improvements)</legend>
        <div className="grid-6">
          {ABILITIES.map((a) => (
            <label key={a} className="field">
              <span className="label" title={ABILITY_NAMES[a]}>{a}</span>
              <input type="number" inputMode="numeric" value={scores[a]} onChange={(e) => setScores({ ...scores, [a]: clamp(Number(e.target.value), 1, 40) })} aria-label={ABILITY_NAMES[a]} />
            </label>
          ))}
        </div>
      </fieldset>
      {level >= 3 && (
        <label className="field">
          <span className="label">Brawling Style · p.87</span>
          <select value={subclass} onChange={(e) => setSubclass(e.target.value)}>
            <option value="">Not chosen yet</option>
            {bruiserStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
          </select>
        </label>
      )}
      {level >= 2 && (
        <fieldset>
          <legend className="label">Fury features: {fury.length} of {furyKnown} · p.86</legend>
          {fury.length > furyKnown && <p className="notice">That is more than the {furyKnown} the rules give at this level. It's your call.</p>}
          {furyOptions.map((option) => (
            <label key={option.id} className="check">
              <input type="checkbox" checked={fury.includes(option.id)} onChange={() => setFury(toggle(fury, option.id))} />
              <span>{option.name}</span>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend className="label">Skill proficiencies (class, background and others)</legend>
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
        <legend className="label">Armor and shield</legend>
        <label className="check">
          <input type="checkbox" checked={armor !== null} onChange={(e) => setArmor(e.target.checked ? { name: 'Leather', base: 11, dexCap: null } : null)} />
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
                <span className="label">Bonus</span>
                <input type="number" inputMode="numeric" value={weapon.bonus ?? 0} onChange={(e) => setWeapon(i, { bonus: clamp(Number(e.target.value), -5, 10) })} />
              </label>
              <button type="button" className="btn" onClick={() => setWeapons(weapons.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setWeapons([...weapons, { id: crypto.randomUUID(), name: 'Club', damage: '1d4', damageType: 'bludgeoning', category: 'simple' }])}>
          Add a weapon
        </button>
      </fieldset>
      <label className="field">
        <span className="label">Strengthen Self taken (+2 Willpower each) · p.221</span>
        <input type="number" inputMode="numeric" min={0} value={strengthenSelf} onChange={(e) => setStrengthenSelf(clamp(Number(e.target.value), 0, 10))} />
      </label>
      <div className="row">
        <button type="submit" className="btn btn-primary">{initial ? 'Save changes' : 'Create character'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
