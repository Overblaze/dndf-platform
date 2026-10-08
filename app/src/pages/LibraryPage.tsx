import { ABILITY_NAMES, SRD_BOOK, cite, columnLabel, proficiencyBonus, signed, spellEntryFor, type Ability, type ClassEntry, type FeatureDef, type OptionDef, type RuleEntry, type SectionDef, type TableDef, type TraitDef } from '@dndf/engine';
import { createContext, Fragment, useContext, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { RuleText } from '../components/RuleText';
import { HomebrewSpells } from './HomebrewSpells';
import { ruleSet, VERSION_NAMES, type RuleSet } from '../lib/rules';

// The handbook being read. It travels in the address ("?v=8.8") so links and reloads keep it.
const SetContext = createContext<RuleSet>(ruleSet('dndf-10'));
const useSet = () => useContext(SetContext);
function useLink() {
  const { version } = useSet();
  return (id: string) => `/library/${encodeURIComponent(id)}${version === 'dndf-8.8' ? '?v=8.8' : ''}`;
}
function useHome() {
  return useSet().version === 'dndf-8.8' ? '/library?v=8.8' : '/library';
}
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

function Feature({ feature, book }: { feature: FeatureDef | OptionDef; book: string }) {
  const level = typeof feature.level === 'number' ? `Level ${feature.level} · ` : '';
  const uses = feature.uses as { max: number | string; recharge: string } | string | undefined;
  const { rules } = useSet();
  // A feature whose sub-headed parts became a list to pick from still shows them here, as the book prints them.
  const completedFrom = (feature as FeatureDef).completedFrom as { book: string; page: number } | undefined;
  const choices = (feature as FeatureDef).choices;
  const options = choices ? ((rules.get(choices.from)?.options ?? []) as OptionDef[]) : [];
  const tabled = new Set(((feature as FeatureDef).tables ?? []).flatMap((t) => t.rows.map((row) => String(row[0]))));
  const inText = (option: OptionDef) => feature.text.includes(`${option.name}. `) || tabled.has(option.name);
  const sections = (feature as FeatureDef).sections ?? options.filter((o) => !inText(o)).map((o) => ({ name: o.name, text: o.text, page: o.page, tables: o.tables }));
  return (
    <details className="feature">
      <summary>
        <span className="resource-name">{feature.name}</span>
        <span className="page-ref">{level}{cite(book, feature.page)}</span>
      </summary>
      <RuleText text={feature.text} sections={sections.length ? (sections as FeatureDef['sections']) : undefined} tables={(feature as FeatureDef).tables} book={book} />
      {uses && typeof uses === 'object' && (
        <p className="page-ref">Tracked on the sheet: {uses.max === 'prof' ? 'proficiency bonus' : uses.max} use{uses.max === 1 ? '' : 's'} per {uses.recharge} rest</p>
      )}
      <p className="page-ref">{book} ({cite(book, feature.page)})</p>
      {completedFrom && <p className="page-ref">This handbook’s page cuts the text off; the end is from {completedFrom.book} ({cite(completedFrom.book, completedFrom.page)}).</p>}
    </details>
  );
}

function ClassTable({ cls }: { cls: ClassEntry }) {
  const columns = Object.entries(cls.progression?.columns ?? {});
  const subclassLevels = new Set(cls.subclass?.featureLevels ?? []);
  return (
    <div className="rule-table class-table">
      <table>
        <thead>
          <tr>
            <th>Level</th>
            <th>Prof.</th>
            <th className="left">Features</th>
            {columns.map(([key]) => <th key={key}>{/^slots\d$/.test(key) ? ordinal(Number(key.slice(5))) : columnLabel(key)}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 20 }, (_, i) => i + 1).map((level) => {
            const names = cls.features.filter((f) => f.level === level).map((f) => f.name);
            if (subclassLevels.has(level) && level !== cls.subclass?.level) names.push(`${cls.subclass!.label} feature`);
            return (
              <tr key={level}>
                <td>{ordinal(level)}</td>
                <td>{signed(proficiencyBonus(level))}</td>
                <td className="left">{names.join(', ') || '—'}</td>
                {columns.map(([key, values]) => <td key={key}>{values[level - 1] === 0 ? '—' : values[level - 1]}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClassView({ cls }: { cls: ClassEntry }) {
  const { subclassesOf, optionGroupsOf } = useSet();
  const link = useLink();
  const home = useHome();
  const book = cls.source.book;
  const prof = cls.proficiencies as { armor?: string[]; weapons?: string[]; tools?: string[]; skills?: { choose?: number; from?: string[] | string; text?: string } } | undefined;
  const show = (list?: string[]) => (list?.length ? list.map((x) => x.replace(/_/g, ' ')).join(', ') : 'None');
  const skills = prof?.skills?.choose
    ? `Choose ${prof.skills.choose} from ${Array.isArray(prof.skills.from) ? prof.skills.from.map((x) => x.replace(/_/g, ' ')).join(', ') : 'any skills'}`
    : prof?.skills?.text ?? '';
  const subs = subclassesOf(cls.id);
  const groups = [...new Set(subs.map((s) => String(s.group ?? 'Subclasses')))];
  return (
    <>
      <section className="card">
        <p className="page-ref"><Link to={home}>Library</Link> · Class · {book} ({cite(book, cls.source.page)})</p>
        <h1>{cls.name}</h1>
        {typeof cls.quote === 'string' && <p className="quote">{cls.quote}</p>}
        {typeof cls.flavor === 'string' && <p className="feature-text">{cls.flavor}</p>}
        <dl className="facts">
          <dt>Hit die</dt><dd>d{cls.hitDie}</dd>
          <dt>Saving throws</dt><dd>{(cls.savingThrows ?? []).map((a: Ability) => ABILITY_NAMES[a]).join(', ')}</dd>
          <dt>Armor</dt><dd>{show(prof?.armor)}</dd>
          <dt>Weapons</dt><dd>{show(prof?.weapons)}</dd>
          <dt>Tools</dt><dd>{show(prof?.tools)}</dd>
          <dt>Skills</dt><dd>{skills}</dd>
          <dt>Equipment</dt><dd>{((cls.startingEquipment ?? []) as unknown[]).filter((x): x is string => typeof x === 'string').join(' · ') || 'See the book'}</dd>
        </dl>
      </section>
      <section className="card">
        <h2>The {cls.name} table</h2>
        <ClassTable cls={cls} />
      </section>
      <section className="card">
        <h2>Class features</h2>
        {cls.features.map((feature) => <Feature key={`${feature.level}/${feature.name}`} feature={feature} book={book} />)}
      </section>
      {groups.map((group) => (
        <section key={group} className="card">
          <h2>{group}</h2>
          {subs.filter((s) => String(s.group ?? 'Subclasses') === group).map((sub) => (
            <Link key={sub.id} className="resource character-link" to={link(sub.id)}>
              <span className="resource-name">{sub.name}</span>
              <span className="page-ref">{sub.features?.length} features · {cite(sub.source.book, sub.source.page)}</span>
            </Link>
          ))}
        </section>
      ))}
      {optionGroupsOf(cls.id.slice(6)).map((group) => (
        <section key={group.id} className="card">
          <h2>Options</h2>
          <Link className="resource character-link" to={link(group.id)}>
            <span className="resource-name">{group.name}</span>
            <span className="page-ref">{(group.options as OptionDef[]).length} options · {cite(group.source.book, group.source.page)}</span>
          </Link>
        </section>
      ))}
    </>
  );
}

const KIND_LABEL: Record<string, string> = {
  race: 'Race', subrace: 'Subrace', background: 'Background', feat: 'Feat', crewRole: 'Crew role', rule: 'Rules', subclass: 'Subclass', optionGroup: 'Options', class: 'Class',
  hakiFeature: 'Haki', surgeAdvancement: 'Standard advancement', spell: 'Spell', spellList: 'Spell list', item: 'Armory', shipType: 'Ship', shipUpgrade: 'Ship upgrade',
};

const FACTS: [string, string][] = [
  ['typeLine', 'Type'], ['prerequisite', 'Prerequisite'], ['size', 'Size'], ['skillProficiencies', 'Skill proficiencies'], ['toolProficiencies', 'Tool proficiencies'],
  ['languages', 'Languages'], ['equipment', 'Equipment'], ['castingTime', 'Casting time'], ['range', 'Range'], ['components', 'Components'], ['duration', 'Duration'],
  ['damage', 'Damage'], ['damageType', 'Damage type'], ['properties', 'Properties'], ['weight', 'Weight'],
];

const COLOR_NAMES: Record<string, string> = { armament: 'Color of Armament', observation: 'Color of Observation', supremeKing: 'Color of the Supreme King' };
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary'];
const byRarity = (a: RuleEntry, b: RuleEntry) => RARITY_ORDER.indexOf(String(a.rarity)) - RARITY_ORDER.indexOf(String(b.rarity));
const berries = (amount: unknown) => (typeof amount === 'number' ? `฿${amount.toLocaleString('en-US')}` : '');
const levelName = (level: string) => (level === '0' ? 'Cantrips' : `${ordinal(Number(level))} level`);

function EntryView({ entry }: { entry: RuleEntry }) {
  const { rules, subracesOf } = useSet();
  const link = useLink();
  const home = useHome();
  if (entry.kind === 'class') return <ClassView cls={entry as ClassEntry} />;
  const parent = typeof entry.parent === 'string' ? rules.get(entry.parent) : undefined;
  const options = (entry.options ?? []) as OptionDef[];
  const optionGroups = [...new Set(options.map((o) => String(o.group ?? '')))];
  const traits = (entry.traits ?? []) as TraitDef[];
  const subraces = entry.kind === 'race' ? subracesOf(entry.id) : [];
  const facts = FACTS.filter(([key]) => typeof entry[key] === 'string');
  const uses = entry.uses as { max: number | string; recharge: string } | undefined;
  // Backgrounds repeat their proficiency lines as their text; those are shown as facts.
  const text = entry.kind === 'background' || entry.kind === 'spellList' ? '' : typeof entry.text === 'string' ? entry.text : '';
  return (
    <>
      <section className="card">
        <p className="page-ref">
          <Link to={home}>Library</Link>
          {parent && <> · <Link to={link(parent.id)}>{parent.name}</Link></>} · {KIND_LABEL[entry.kind] ?? entry.kind}
          {entry.optional === true && ' (optional)'} · {entry.source.book} ({cite(entry.source.book, entry.source.page)})
        </p>
        <h1>{entry.name}</h1>
        {(facts.length > 0 || typeof entry.speed === 'number' || entry.kind === 'item') && (
          <dl className="facts facts-plain">
            {typeof entry.speed === 'number' && <><dt>Walking speed</dt><dd>{entry.speed} ft</dd></>}
            {typeof entry.cost === 'number' && <><dt>Cost</dt><dd>{berries(entry.cost)}</dd></>}
            {entry.kind === 'item' && typeof entry.ac === 'object' && entry.ac !== null && <><dt>Armor class</dt><dd>{describeAc(entry)}</dd></>}
            {typeof entry.strength === 'number' && <><dt>Strength needed</dt><dd>{entry.strength}</dd></>}
            {entry.stealthDisadvantage === true && <><dt>Stealth</dt><dd>Disadvantage</dd></>}
            {facts.map(([key, label]) => (
              <Fragment key={key}>
                <dt>{label}</dt>
                <dd>{String(entry[key])}</dd>
              </Fragment>
            ))}
          </dl>
        )}
        {entry.kind === 'shipType' && (
          <>
            {entry.special === true && <p className="page-ref">A special vehicle: not sold by ordinary vendors.</p>}
            {entry.abilities !== null && typeof entry.abilities === 'object' && (
              <p className="feature-text">{Object.entries(entry.abilities as Record<string, number>).map(([a, score]) => `${a.toUpperCase()} ${score}${score ? ` (${signed(Math.floor((score - 10) / 2))})` : ''}`).join(' · ')}</p>
            )}
          </>
        )}
        {typeof entry.flavor === 'string' && <p className="feature-text">{entry.flavor}</p>}
        {Boolean(text || entry.sections || entry.tables) && (
          <RuleText text={text} sections={(entry.sections ?? []) as SectionDef[]} tables={(entry.tables ?? []) as TableDef[]} book={entry.source.book} />
        )}
        {entry.kind === 'shipType' && Array.isArray(entry.components) && (entry.components as { name: string; text: string }[]).map((component) => (
          <div key={component.name} className="rule-section">
            <h3>{component.name}</h3>
            <p className="feature-text">{component.text}</p>
          </div>
        ))}
        {entry.kind === 'shipType' && typeof entry.actions === 'string' && entry.actions && (
          <div className="rule-section"><h3>Actions</h3><p className="feature-text">{entry.actions}</p></div>
        )}
        {entry.kind === 'spellList' && Object.entries(entry.levels as Record<string, string[]>).map(([level, names]) => (
          <div key={level} className="rule-section">
            <h3>{levelName(level)} <span className="page-ref">{names.length}</span></h3>
            <p className="feature-text">
              {names.map((name, i) => {
                const held = spellEntryFor(name, rules);
                return <Fragment key={name}>{i > 0 && ', '}{held ? <Link to={link(held.id)}>{name}</Link> : name}</Fragment>;
              })}
            </p>
          </div>
        ))}
        {entry.kind === 'spellList' && <p className="page-ref">A linked name opens the spell’s text. The others are from 5th Edition books outside the free rules, so only their names are here.</p>}
        {entry.kind === 'spell' && entry.source.book === SRD_BOOK && (
          <p className="page-ref">From the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC, licensed under the Creative Commons Attribution 4.0 International License.</p>
        )}
        {uses && typeof uses === 'object' && (
          <p className="page-ref">Tracked on the sheet: {uses.max === 'prof' ? 'proficiency bonus' : uses.max} use{uses.max === 1 ? '' : 's'} per {uses.recharge} rest</p>
        )}
        {(entry.features ?? []).map((feature) => <Feature key={`${feature.level}/${feature.name}`} feature={feature} book={entry.source.book} />)}
        {optionGroups.map((group) => (
          <div key={group}>
            {group && <h2>{group}</h2>}
            {options.filter((o) => String(o.group ?? '') === group).map((option) => <Feature key={option.id} feature={option} book={entry.source.book} />)}
          </div>
        ))}
      </section>
      {traits.length > 0 && (
        <section className="card">
          <h2>Traits</h2>
          {traits.map((trait) => (
            <div key={trait.name} className="rule-section">
              <h3>{trait.name} <span className="page-ref">{cite(entry.source.book, trait.page)}</span></h3>
              <RuleText text={trait.text} tables={trait.tables} book={entry.source.book} />
            </div>
          ))}
        </section>
      )}
      {subraces.length > 0 && (
        <section className="card">
          <h2>Subraces</h2>
          <EntryLinks entries={subraces} detail={(sub) => `${(sub.traits as TraitDef[]).length} traits`} />
        </section>
      )}
    </>
  );
}

function describeAc(item: RuleEntry): string {
  const ac = item.ac as { base?: number; dex?: string; bonus?: number };
  if (typeof ac.bonus === 'number') return `+${ac.bonus}`;
  return `${ac.base}${ac.dex === 'full' ? ' + Dex modifier' : ac.dex === 'max2' ? ' + Dex modifier (max 2)' : ''}`;
}

function EntryLinks({ entries, detail }: { entries: RuleEntry[]; detail?: (entry: RuleEntry) => string }) {
  const link = useLink();
  return (
    <>
      {entries.map((entry) => (
        <Link key={entry.id} className="resource character-link" to={link(entry.id)}>
          <span className="resource-name">{entry.name}</span>
          <span className="page-ref">{[detail?.(entry), cite(entry.source.book, entry.source.page)].filter(Boolean).join(' · ')}</span>
        </Link>
      ))}
    </>
  );
}

function Shelf({ title, count, children }: { title: string; count: number | string; children: ReactNode }) {
  return (
    <section className="card">
      <details className="shelf">
        <summary>
          <h2>{title}</h2>
          <span className="page-ref">{count}</span>
        </summary>
        {children}
      </details>
    </section>
  );
}

interface Hit {
  id: string;
  title: string;
  where: string;
  page: number;
  book: string;
}

function search(query: string, rules: RuleSet['rules']): Hit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: Hit[] = [];
  for (const entry of rules.values()) {
    const parent = typeof entry.parent === 'string' ? rules.get(entry.parent)?.name : undefined;
    const kind = [parent, KIND_LABEL[entry.kind] ?? entry.kind].filter(Boolean).join(' ').replace(/ Subclass$/, ' subclass');
    if (entry.name.toLowerCase().includes(q)) hits.push({ id: entry.id, title: entry.name, where: kind, page: entry.source.page, book: entry.source.book });
    const parts = [...(entry.features ?? []), ...((entry.options ?? []) as OptionDef[]), ...((entry.traits ?? []) as TraitDef[]), ...((entry.sections ?? []) as SectionDef[])];
    for (const item of parts) {
      if (item.name.toLowerCase().includes(q)) hits.push({ id: entry.id, title: item.name, where: parent ? `${parent}: ${entry.name}` : entry.name, page: item.page, book: entry.source.book });
    }
  }
  return hits.slice(0, 80);
}

function LibraryHome() {
  const { version, rules, classes, races, backgrounds, crewRoles, feats, generalRules, subclassesOf, subracesOf, hakiFeatures, surgeAdvancements, spellLists, spells } = useSet();
  const items = [...rules.values()].filter((e) => e.kind === 'item');
  const armoryRules = generalRules.filter((e) => e.id.startsWith('rule.armory_'));
  const shipRules = generalRules.filter((e) => e.id.startsWith('rule.ships_'));
  const shipTypes = [...rules.values()].filter((e) => e.kind === 'shipType');
  const shipUpgrades = [...rules.values()].filter((e) => e.kind === 'shipUpgrade');
  const otherRules = generalRules.filter((e) => !e.id.startsWith('rule.armory_') && !e.id.startsWith('rule.ships_'));
  const surgeDetail = (e: RuleEntry) => [String(e.rarity), e.amateur ? 'Amateur' : '', typeof e.tier === 'number' ? `Tier ${e.tier}` : ''].filter(Boolean).join(' · ');
  const link = useLink();
  const [, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const hits = useMemo(() => search(query, rules), [query, rules]);
  return (
    <>
      <section className="card">
        <h1>Library</h1>
        <p className="soft">The player chapters of the DnDF Expanded Handbook, word for word, with the page for everything.</p>
        <div className="segmented" role="radiogroup" aria-label="Handbook">
          {(Object.keys(VERSION_NAMES) as (keyof typeof VERSION_NAMES)[]).map((v) => (
            <button key={v} role="radio" aria-checked={version === v} className={version === v ? 'active' : ''} onClick={() => setParams(v === 'dndf-8.8' ? { v: '8.8' } : {})}>
              {VERSION_NAMES[v]}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="label">Search everything by name</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ki, Mink, Shipwright, Alert, Parry Blow…" />
        </label>
        {query.trim().length >= 2 && hits.length === 0 && <p>Nothing called that in this handbook.</p>}
        {hits.map((hit, i) => (
          <Link key={i} className="resource character-link" to={link(hit.id)}>
            <span className="resource-name">{hit.title}</span>
            <span className="page-ref">{hit.where} · {cite(hit.book, hit.page)}</span>
          </Link>
        ))}
      </section>
      <section className="card">
        <h2>Classes</h2>
        {classes.map((cls) => (
          <Link key={cls.id} className="resource character-link" to={link(cls.id)}>
            <span className="resource-name">{cls.name}</span>
            <span className="page-ref">
              d{cls.hitDie} · {(cls.savingThrows ?? []).map((a) => ABILITY_NAMES[a]).join(' and ')} saves · {subclassesOf(cls.id).length} subclasses · {cite(cls.source.book, cls.source.page)}
            </span>
          </Link>
        ))}
      </section>
      <Shelf title="Races" count={races.length}>
        <EntryLinks entries={races} detail={(race) => [race.optional ? 'optional' : '', subracesOf(race.id).length ? `${subracesOf(race.id).length} subraces` : ''].filter(Boolean).join(' · ')} />
      </Shelf>
      <Shelf title="Backgrounds" count={backgrounds.length}>
        <EntryLinks entries={backgrounds} detail={(bg) => String(bg.skillProficiencies ?? '')} />
      </Shelf>
      <Shelf title="Crew roles" count={crewRoles.length}>
        <EntryLinks entries={crewRoles} />
      </Shelf>
      <Shelf title="Feats" count={feats.length}>
        <EntryLinks entries={feats} detail={(feat) => (feat.prerequisite ? `needs ${feat.prerequisite}` : '')} />
      </Shelf>
      <Shelf title="Haki and Spirit Surges" count={hakiFeatures.length + surgeAdvancements.length}>
        <h3>Standard advancements</h3>
        <EntryLinks entries={[...surgeAdvancements].sort(byRarity)} detail={surgeDetail} />
        {Object.entries(COLOR_NAMES).map(([color, name]) => (
          <Fragment key={color}>
            <h3>{name}</h3>
            <EntryLinks entries={hakiFeatures.filter((f) => f.color === color).sort(byRarity)} detail={surgeDetail} />
          </Fragment>
        ))}
      </Shelf>
      <Shelf title="Spell lists and spells" count={spellLists.length + spells.length}>
        <EntryLinks entries={spellLists} detail={(list) => `${Object.values(list.levels as Record<string, string[]>).reduce((n, names) => n + names.length, 0)} spells`} />
        <h3>Custom spells</h3>
        <EntryLinks entries={spells.filter((spell) => spell.source.book !== SRD_BOOK)} detail={(spell) => `${spell.level === 0 ? 'cantrip' : `${ordinal(Number(spell.level))} level`} ${String(spell.school ?? '')}`} />
        <h3>Spells from the free 5th Edition rules (SRD 5.1)</h3>
        <p className="page-ref">
          This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at{' '}
          <a href="https://dnd.wizards.com/resources/systems-reference-document">https://dnd.wizards.com/resources/systems-reference-document</a>. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0
          International License available at <a href="https://creativecommons.org/licenses/by/4.0/legalcode">https://creativecommons.org/licenses/by/4.0/legalcode</a>.
          Spells the class lists name from other 5th Edition books are listed by name only.
        </p>
        <EntryLinks entries={spells.filter((spell) => spell.source.book === SRD_BOOK)} detail={(spell) => `${spell.level === 0 ? 'cantrip' : `${ordinal(Number(spell.level))} level`} ${String(spell.school ?? '')}${spell.ritual === true ? ' (ritual)' : ''}`} />
      </Shelf>
      <Shelf title="Your spells" count="write your own">
        <HomebrewSpells />
      </Shelf>
      <Shelf title="Ships and sailing" count={shipRules.length + shipTypes.length + shipUpgrades.length}>
        <p className="page-ref">From Chapter 2 of the DnDF DM Guide. Page numbers are the PDF’s.</p>
        <EntryLinks entries={shipRules} />
        <h3>Ships</h3>
        <EntryLinks entries={shipTypes} detail={(ship) => [String(ship.size ?? ''), typeof ship.cost === 'number' ? berries(ship.cost) : '', typeof ship.crew === 'number' ? `crew ${ship.crew}` : '', typeof ship.upgradeSlots === 'number' ? `${ship.upgradeSlots} upgrade slots` : ''].filter(Boolean).join(' · ')} />
        {[...new Set(shipUpgrades.map((u) => String(u.group ?? 'Upgrades')))].map((group) => (
          <Fragment key={group}>
            <h3>{group}</h3>
            <EntryLinks entries={shipUpgrades.filter((u) => String(u.group ?? 'Upgrades') === group)} detail={(u) => [typeof u.slots === 'number' ? `${u.slots} slot${u.slots === 1 ? '' : 's'}` : '', String(u.costText ?? '')].filter(Boolean).join(' · ')} />
          </Fragment>
        ))}
      </Shelf>
      <Shelf title="Armory" count={items.length + armoryRules.length}>
        <EntryLinks entries={armoryRules} />
        <h3>Armor and shields</h3>
        <EntryLinks entries={items.filter((i) => i.itemType !== 'weapon')} detail={(i) => `AC ${describeAc(i)} · ${berries(i.cost)}`} />
        <h3>Weapons</h3>
        <EntryLinks entries={items.filter((i) => i.itemType === 'weapon')} detail={(i) => [i.damage ? `${String(i.damage)} ${String(i.damageType)}` : '', String(i.category), berries(i.cost)].filter(Boolean).join(' · ')} />
      </Shelf>
      <Shelf title="General rules" count={otherRules.length}>
        <EntryLinks entries={otherRules} />
      </Shelf>
      <section className="card">
        <p className="page-ref">Not here: Devil Fruits and their advancements, which only the DM can hand out, and the medical log.</p>
      </section>
    </>
  );
}

export function LibraryPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const set = ruleSet(params.get('v') === '8.8' ? 'dndf-8.8' : 'dndf-10');
  const entry = id ? set.rules.get(decodeURIComponent(id)) : undefined;
  return (
    <SetContext.Provider value={set}>
      {!id ? <LibraryHome /> : entry ? <EntryView entry={entry} /> : (
        <section className="card">
          <h1>Not in this handbook</h1>
          <p>Nothing in {VERSION_NAMES[set.version]} is called that. It may be in the other handbook.</p>
          <Link className="btn" to={set.version === 'dndf-8.8' ? '/library?v=8.8' : '/library'}>Back to the library</Link>
        </section>
      )}
    </SetContext.Provider>
  );
}
