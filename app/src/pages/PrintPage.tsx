import { ABILITIES, ABILITY_NAMES, cite, deriveSheet, exactBerries, signed, spellLevelName, type CharacterDoc, type Sheet } from '@dndf/engine';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ruleSet, VERSION_NAMES } from '../lib/rules';
import { storeFor } from '../lib/store';

const RECHARGE: Record<string, string> = { short: 'short rest', long: 'long rest', dawn: 'dawn' };
/** Empty boxes to tick off in pencil; a big pool gets a line to write on instead. */
const Boxes = ({ count }: { count: number }) =>
  count > 24 ? <span className="print-line">{count} / ______</span> : <span className="print-boxes" aria-label={`${count} boxes`}>{Array.from({ length: count }, (_, i) => <i key={i} />)}</span>;

function Paper({ doc, sheet, withText }: { doc: CharacterDoc; sheet: Sheet; withText: boolean }) {
  const ref = (f: { book: string; from: string; page: number }) => (f.book === 'Custom' ? `${f.from} · your own` : `${f.from} · ${cite(f.book, f.page)}`);
  const pools = sheet.resources.filter((r) => !r.id.startsWith('sr.'));
  const book = sheet.spellbook;
  const spellLevels = [...new Set(book.known.map((k) => k.level))];
  return (
    <article className="paper">
      <header className="print-head">
        <div>
          <h1>{sheet.name}</h1>
          <p>{sheet.summary}</p>
        </div>
        <p className="print-meta">{VERSION_NAMES[doc.rulesVersion]} · level {sheet.level} · proficiency {signed(sheet.prof.value)}</p>
      </header>

      <section className="print-vitals">
        {[
          ['Armor Class', sheet.ac.value], ['Hit points', `____ / ${sheet.maxHp.value}`], ['Temp HP', '____'], ['Speed', `${sheet.speed.value} ft`],
          ['Initiative', signed(sheet.initiative.value)], ['Passive Perception', sheet.passivePerception.value], ['Willpower', sheet.willpower.value], ['Haki save DC', sheet.hakiSaveDc.value],
        ].map(([label, value]) => (
          <div key={label} className="print-box"><span>{label}</span><b>{value}</b></div>
        ))}
      </section>

      <div className="print-columns">
        <section>
          <h2>Abilities and saves</h2>
          <table className="print-table">
            <thead><tr><th>Ability</th><th>Score</th><th>Mod</th><th>Save</th></tr></thead>
            <tbody>
              {ABILITIES.map((a) => (
                <tr key={a}>
                  <td>{ABILITY_NAMES[a]}</td><td>{sheet.abilities[a].score}</td><td>{signed(sheet.abilities[a].mod)}</td>
                  <td>{sheet.saves[a].proficient ? '● ' : '○ '}{signed(sheet.saves[a].value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Hit dice and rests</h2>
          <p>{sheet.hitDice.pool.map((p) => `${p.count}d${p.die}`).join(' + ')} <Boxes count={sheet.hitDice.total} /></p>
          <p>Dream Points <Boxes count={sheet.dreamPoints.max} /></p>
          <p>Death saves: successes <Boxes count={3} /> failures <Boxes count={3} /></p>
          <h2>Proficiencies</h2>
          {(['armor', 'weapons', 'tools'] as const).map((kind) => (
            <p key={kind}><b>{kind[0]!.toUpperCase() + kind.slice(1)}:</b> {sheet.proficiencies[kind].map((p) => p.name).join(', ') || 'None'}</p>
          ))}
        </section>
        <section>
          <h2>Skills</h2>
          <table className="print-table print-skills">
            <tbody>
              {sheet.skills.map((skill) => (
                <tr key={skill.id}><td>{skill.expertise ? '◆' : skill.proficient ? '●' : '○'}</td><td>{skill.label} <small>({skill.ability})</small></td><td>{signed(skill.value)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="print-small">● proficient · ◆ expertise</p>
        </section>
      </div>

      <section>
        <h2>Attacks{sheet.attacksPerAction > 1 ? ` · ${sheet.attacksPerAction} per Attack action` : ''}</h2>
        <table className="print-table">
          <thead><tr><th>Attack</th><th>To hit</th><th>Damage</th><th>Notes</th></tr></thead>
          <tbody>
            {sheet.attacks.map((attack) => (
              <tr key={attack.id}><td>{attack.name}</td><td>{signed(attack.toHit.value)}</td><td>{attack.damage} {attack.damageType}</td><td>{attack.notes.join('; ')}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      {(pools.length > 0 || sheet.trackers.length > 0 || sheet.formulas.length > 0) && (
        <section>
          <h2>Pools and numbers</h2>
          <div className="print-pools">
            {pools.map((r) => (
              <p key={r.id}><b>{r.name}</b> <small>({r.max}, {RECHARGE[r.recharge] ?? r.recharge})</small> <Boxes count={r.max} /></p>
            ))}
            {sheet.trackers.map((t) => <p key={t.id}><b>{t.name}</b> <small>(up to {t.max})</small> <span className="print-line">______</span></p>)}
            {sheet.formulas.map((f) => <p key={f.key}><b>{f.label}</b> {f.label.includes('modifier') ? signed(f.value) : f.value}</p>)}
            {sheet.classTable.map((c) => <p key={`${c.from}/${c.key}`}><b>{c.label}</b> {c.value}</p>)}
          </div>
        </section>
      )}

      {sheet.notes.length > 0 && (
        <section>
          <h2>In effect</h2>
          <ul className="print-list">{sheet.notes.map((n, i) => <li key={i}>{n.label} <small>({n.from})</small></li>)}</ul>
        </section>
      )}

      <section className="print-features">
        <h2>Features</h2>
        {sheet.features.map((f) => (
          <div key={f.key} className={withText ? 'print-feature' : 'print-feature print-feature-short'}>
            <p><b>{f.name}</b> <small>{ref(f)}{f.action ? ` · ${f.action === 'bonus' ? 'bonus action' : f.action}` : ''}{f.rolls.length ? ` · ${f.rolls.map((r) => r.dice).join(', ')}` : ''}</small></p>
            {withText && f.text && <p className="print-text">{f.text}</p>}
            {withText && f.sections.map((s) => <p key={s.name} className="print-text"><i>{s.name}.</i> {s.text}</p>)}
          </div>
        ))}
      </section>

      {(book.known.length > 0 || book.casting.length > 0) && (
        <section>
          <h2>Spells</h2>
          {book.casting.map((c) => (
            <p key={c.from}><b>{c.from}:</b> {[c.dc ? `save DC ${c.dc.value}` : '', c.attack ? `attack ${signed(c.attack.value)}` : ''].filter(Boolean).join(', ')}</p>
          ))}
          {spellLevels.map((level) => (
            <p key={level}>
              <b>{spellLevelName(level)}:</b>{' '}
              {book.known.filter((k) => k.level === level).map((k) => `${level > 0 ? (k.prepared ? '● ' : '○ ') : ''}${k.name}${k.notes ? ` (${k.notes})` : ''}`).join(' · ')}
            </p>
          ))}
          {book.known.some((k) => k.level > 0) && <p className="print-small">● prepared</p>}
          {withText && book.known.filter((k) => k.text).map((k) => (
            <div key={k.id} className="print-feature">
              <p><b>{k.name}</b> <small>{[k.school, k.castingTime, k.range, k.components, k.duration, k.book && k.page ? cite(k.book, k.page) : ''].filter(Boolean).join(' · ')}</small></p>
              <p className="print-text">{k.text}</p>
            </div>
          ))}
        </section>
      )}

      {(sheet.gear.lines.length > 0 || sheet.money !== 0) && (
        <section>
          <h2>Gear</h2>
          <p><b>Berries:</b> {exactBerries(sheet.money)} · <b>Carried:</b> {sheet.gear.carried} lb of {sheet.gear.capacity} lb</p>
          <table className="print-table">
            <thead><tr><th>Item</th><th>Count</th><th>Weight</th><th>Notes</th></tr></thead>
            <tbody>
              {sheet.gear.lines.map((line) => (
                <tr key={line.id}><td>{line.name}{line.carried ? '' : ' (stowed)'}</td><td>{line.qty}</td><td>{line.weight !== undefined ? `${line.total} lb` : ''}</td><td>{line.notes ?? ''}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {doc.notes.trim() && (
        <section>
          <h2>Notes</h2>
          <p className="print-text">{doc.notes}</p>
        </section>
      )}
      <footer className="print-foot">{sheet.name} · {sheet.book} · printed {new Date().toLocaleDateString()}</footer>
    </article>
  );
}

/** A character laid out for paper or a PDF: the numbers, boxes to tick, and the features with or without their text. */
export function PrintPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { loading, session } = useAuth();
  const userId = session?.user.id ?? null;
  const store = useMemo(() => storeFor(userId), [userId]);
  const [doc, setDoc] = useState<CharacterDoc | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // "?text=0" opens on the short sheet (the bot asks for it that way); the tick box changes it from there.
  const [withText, setWithText] = useState(params.get('text') !== '0');

  useEffect(() => {
    if (loading || !id) return;
    let current = true;
    store.get(id).then(
      (stored) => current && (stored ? setDoc(stored.doc) : setProblem('No such character. It may have been deleted, or it belongs to someone else.')),
      (error: Error) => current && setProblem(error.message),
    );
    return () => { current = false; };
  }, [store, id, loading]);

  const sheet = useMemo(() => (doc ? deriveSheet(doc, ruleSet(doc.rulesVersion).rules) : null), [doc]);
  useEffect(() => { if (sheet) document.title = `${sheet.name} · character sheet`; }, [sheet]);

  if (problem) return <p className="notice" role="alert">{problem}</p>;
  if (!doc || !sheet) return <p>Laying out the sheet…</p>;
  return (
    <div className="print-page">
      <div className="print-bar no-print">
        <Link className="btn" to={`/sheet/${id}`}>Back to the sheet</Link>
        <label className="check">
          <input type="checkbox" checked={withText} onChange={(e) => setWithText(e.target.checked)} />
          <span>Include the text of each feature</span>
        </label>
        <button className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <Paper doc={doc} sheet={sheet} withText={withText} />
    </div>
  );
}
