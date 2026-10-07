import { ABILITY_NAMES, columnLabel, proficiencyBonus, signed, type Ability, type ClassEntry, type FeatureDef, type OptionDef, type RuleEntry } from '@dndf/engine';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RuleText } from '../components/RuleText';
import { classes, optionGroupsOf, rules, subclassesOf } from '../lib/rules';

const link = (id: string) => `/library/${encodeURIComponent(id)}`;
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

function Feature({ feature, book }: { feature: FeatureDef | OptionDef; book: string }) {
  const level = typeof feature.level === 'number' ? `Level ${feature.level} · ` : '';
  const uses = feature.uses as { max: number | string; recharge: string } | string | undefined;
  return (
    <details className="feature">
      <summary>
        <span className="resource-name">{feature.name}</span>
        <span className="page-ref">{level}p.{feature.page}</span>
      </summary>
      <RuleText text={feature.text} sections={(feature as FeatureDef).sections} tables={(feature as FeatureDef).tables} />
      {uses && typeof uses === 'object' && (
        <p className="page-ref">Tracked on the sheet: {uses.max === 'prof' ? 'proficiency bonus' : uses.max} use{uses.max === 1 ? '' : 's'} per {uses.recharge} rest</p>
      )}
      <p className="page-ref">{book}, p.{feature.page}</p>
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
        <p className="page-ref"><Link to="/library">Library</Link> · Class · {book}, p.{cls.source.page}</p>
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
              <span className="page-ref">{sub.features?.length} features · p.{sub.source.page}</span>
            </Link>
          ))}
        </section>
      ))}
      {optionGroupsOf(cls.id.slice(6)).map((group) => (
        <section key={group.id} className="card">
          <h2>Options</h2>
          <Link className="resource character-link" to={link(group.id)}>
            <span className="resource-name">{group.name}</span>
            <span className="page-ref">{(group.options as OptionDef[]).length} options · p.{group.source.page}</span>
          </Link>
        </section>
      ))}
    </>
  );
}

function EntryView({ entry }: { entry: RuleEntry }) {
  if (entry.kind === 'class') return <ClassView cls={entry as ClassEntry} />;
  const parent = typeof entry.parent === 'string' ? rules.get(entry.parent) : undefined;
  const options = (entry.options ?? []) as OptionDef[];
  const optionGroups = [...new Set(options.map((o) => String(o.group ?? '')))];
  return (
    <section className="card">
      <p className="page-ref">
        <Link to="/library">Library</Link>
        {parent && <> · <Link to={link(parent.id)}>{parent.name}</Link></>} · {entry.source.book}, p.{entry.source.page}
      </p>
      <h1>{entry.name}</h1>
      {typeof entry.flavor === 'string' && <p className="feature-text">{entry.flavor}</p>}
      {typeof entry.text === 'string' && <p className="feature-text">{entry.text}</p>}
      {(entry.features ?? []).map((feature) => <Feature key={`${feature.level}/${feature.name}`} feature={feature} book={entry.source.book} />)}
      {optionGroups.map((group) => (
        <div key={group}>
          {group && <h2>{group}</h2>}
          {options.filter((o) => String(o.group ?? '') === group).map((option) => <Feature key={option.id} feature={option} book={entry.source.book} />)}
        </div>
      ))}
    </section>
  );
}

interface Hit {
  id: string;
  title: string;
  where: string;
  page: number;
}

function search(query: string): Hit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: Hit[] = [];
  for (const entry of rules.values()) {
    const kind = entry.kind === 'optionGroup' ? 'Options' : entry.kind === 'subclass' ? `${rules.get(String(entry.parent))?.name ?? ''} subclass` : 'Class';
    if (entry.name.toLowerCase().includes(q)) hits.push({ id: entry.id, title: entry.name, where: kind, page: entry.source.page });
    for (const item of [...(entry.features ?? []), ...((entry.options ?? []) as OptionDef[])]) {
      if (item.name.toLowerCase().includes(q)) hits.push({ id: entry.id, title: item.name, where: entry.name, page: item.page });
    }
  }
  return hits.slice(0, 60);
}

export function LibraryPage() {
  const { id } = useParams();
  const [query, setQuery] = useState('');
  const hits = useMemo(() => search(query), [query]);
  const entry = id ? rules.get(decodeURIComponent(id)) : undefined;

  if (id) {
    return entry ? <EntryView entry={entry} /> : (
      <section className="card">
        <h1>Not in the library</h1>
        <p>Nothing here is called that.</p>
        <Link className="btn" to="/library">Back to the library</Link>
      </section>
    );
  }
  return (
    <>
      <section className="card">
        <h1>Library</h1>
        <p className="soft">The classes of the DnDF Expanded Handbook v10, word for word, with the page for every feature.</p>
        <label className="field">
          <span className="label">Search classes, subclasses and features</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ki, Brawling Style, Extra Attack…" />
        </label>
        {query.trim().length >= 2 && hits.length === 0 && <p>Nothing called that yet.</p>}
        {hits.map((hit, i) => (
          <Link key={i} className="resource character-link" to={link(hit.id)}>
            <span className="resource-name">{hit.title}</span>
            <span className="page-ref">{hit.where} · p.{hit.page}</span>
          </Link>
        ))}
      </section>
      <section className="card">
        <h2>Classes</h2>
        {classes.map((cls) => (
          <Link key={cls.id} className="resource character-link" to={link(cls.id)}>
            <span className="resource-name">{cls.name}</span>
            <span className="page-ref">
              d{cls.hitDie} · {(cls.savingThrows ?? []).map((a) => ABILITY_NAMES[a]).join(' and ')} saves · {subclassesOf(cls.id).length} subclasses · p.{cls.source.page}
            </span>
          </Link>
        ))}
        <p className="page-ref">Races, backgrounds, feats, crew roles, Haki and the armory are still to be added, as is the v8.8 handbook.</p>
      </section>
    </>
  );
}
