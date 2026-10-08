import { SRD_BOOK, castSpell, cite, gainTempHp, ordinal, spellLevelName, spellLists, spendResource, type KnownSpell, type SheetSpell, type SpellChoice } from '@dndf/engine';
import { useMemo, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { RuleText } from '../components/RuleText';
import { useRolls } from '../lib/rolls';
import type { LiveCharacter } from '../lib/useCharacter';
import { Tile, type OpenStat } from './Vitals';

const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Pick spells from a class list, or write one in by name. */
function AddSpellsDialog({ live, onClose }: { live: LiveCharacter; onClose: () => void }) {
  const { doc, rules } = live;
  const lists = useMemo(() => spellLists(doc, rules), [doc, rules]);
  const [listId, setListId] = useState(lists[0]?.id ?? '');
  const [level, setLevel] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [own, setOwn] = useState({ name: '', level: 0 });
  const list = lists.find((l) => l.id === listId);
  const known = doc.spells ?? [];
  const has = (spell: SpellChoice) => known.some((k) => k.name === spell.name);
  const levels = [...new Set((list?.spells ?? []).map((s) => s.level))].sort((a, b) => a - b);
  const shown = (list?.spells ?? []).filter((s) => (level === null || s.level === level) && s.name.toLowerCase().includes(text.trim().toLowerCase()));
  const toggle = (spell: SpellChoice) => {
    if (has(spell)) live.setDoc({ ...doc, spells: known.filter((k) => k.name !== spell.name) }, `Forgot ${spell.name}`);
    else live.setDoc({ ...doc, spells: [...known, { id: crypto.randomUUID(), name: spell.name, level: spell.level, list: spell.list, entry: spell.entry }] }, `Learned ${spell.name}`);
  };
  const addOwn = () => {
    const name = own.name.trim();
    if (!name) return;
    live.setDoc({ ...doc, spells: [...known, { id: crypto.randomUUID(), name, level: own.level }] }, `Learned ${name}`);
    setOwn({ name: '', level: own.level });
  };
  return (
    <Dialog title="Add spells" onClose={onClose}>
      <label className="field">
        <span className="label">Spell list</span>
        <select value={listId} onChange={(e) => { setListId(e.target.value); setLevel(null); }}>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}{l.own ? ' (your class)' : ''}</option>)}
        </select>
      </label>
      {list && <p className="page-ref">{list.spells.length} spells · {cite(list.book, list.page)} · {list.spells.filter((x) => x.entry).length} with their text (the handbook’s own, and the ones in the free 5e rules); the rest are in other 5th Edition books and are listed by name.</p>}
      <div className="segmented surge-tabs" role="tablist" aria-label="Spell level">
        <button role="tab" aria-selected={level === null} className={level === null ? 'active' : ''} onClick={() => setLevel(null)}>All</button>
        {levels.map((l) => (
          <button key={l} role="tab" aria-selected={level === l} className={level === l ? 'active' : ''} onClick={() => setLevel(l)}>{l === 0 ? 'Cantrip' : ordinal(l)}</button>
        ))}
      </div>
      <label className="field">
        <span className="label">Find</span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Part of a name" />
      </label>
      {shown.map((spell) => (
        <label key={`${spell.level}/${spell.name}`} className="check">
          <input type="checkbox" checked={has(spell)} onChange={() => toggle(spell)} />
          <span>{spell.name} <span className="page-ref">{spell.level === 0 ? 'cantrip' : `${ordinal(spell.level)} level`}{spell.entry ? ' · with text' : ' · name only'}</span></span>
        </label>
      ))}
      {shown.length === 0 && <p className="soft">Nothing by that name at that level in this list.</p>}

      <fieldset>
        <legend className="label">Or write one in</legend>
        <div className="grid-2">
          <label className="field">
            <span className="label">Name</span>
            <input value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} maxLength={80} />
          </label>
          <label className="field">
            <span className="label">Level</span>
            <select value={own.level} onChange={(e) => setOwn({ ...own, level: Number(e.target.value) })}>
              {LEVELS.map((l) => <option key={l} value={l}>{l === 0 ? 'Cantrip' : ordinal(l)}</option>)}
            </select>
          </label>
        </div>
        <button className="btn" disabled={!own.name.trim()} onClick={addOwn}>Add it</button>
      </fieldset>
      <button className="btn btn-primary" onClick={onClose}>Done</button>
    </Dialog>
  );
}

function SpellRow({ spell, live }: { spell: SheetSpell; live: LiveCharacter }) {
  const { doc, sheet } = live;
  const rolls = useRolls();
  const [slot, setSlot] = useState<number | null>(null);
  const [notes, setNotes] = useState(spell.notes ?? '');
  const known = doc.spells ?? [];
  const change = (patch: Partial<KnownSpell>, log?: string) => live.setDoc({ ...doc, spells: known.map((k) => (k.id === spell.id ? { ...k, ...patch } : k)) }, log);
  const use = spell.castableWith.includes(slot ?? -1) ? slot! : spell.castableWith[0];
  const cast = () => {
    const result = castSpell(doc.state, sheet, spell, use ?? spell.level);
    live.setState(result.state, result.warning ? `${result.summary} (${result.warning})` : result.summary);
  };
  const roll = (r: SheetSpell['rolls'][number]) => {
    const result = rolls.dice(`${spell.name}: ${r.label}`, r.dice);
    if (r.kind === 'tempHp') live.setState(gainTempHp(live.doc.state, result.total), `${spell.name}: temporary hit points`);
  };
  const hasSlots = sheet.spellbook.slots.some((s) => Number(s.id.slice(5)) >= spell.level);
  return (
    <div className="action">
      <div className="action-head">
        <div>
          <div className="resource-name">{spell.name}</div>
          <div className="page-ref">
            {[spell.school, spell.ritual ? 'ritual' : '', spell.castingTime, spell.range, spell.duration, spell.page && spell.book ? cite(spell.book, spell.page) : ''].filter(Boolean).join(' · ') || (spell.level === 0 ? 'At will' : `${ordinal(spell.level)} level`)}
          </div>
        </div>
        {spell.level > 0 && (
          <label className="check">
            <input type="checkbox" checked={spell.prepared === true} onChange={(e) => change({ prepared: e.target.checked || undefined }, `${spell.name}: ${e.target.checked ? 'prepared' : 'not prepared'}`)} />
            <span className="page-ref">Prepared</span>
          </label>
        )}
      </div>
      <div className="row wrap">
        {spell.level > 0 && spell.castableWith.length > 1 && (
          <select value={use} onChange={(e) => setSlot(Number(e.target.value))} aria-label={`Slot level for ${spell.name}`}>
            {spell.castableWith.map((l) => <option key={l} value={l}>{ordinal(l)}-level slot</option>)}
          </select>
        )}
        {spell.level > 0 && hasSlots && <button className="btn btn-primary" onClick={cast}>{spell.castableWith.length ? `Cast (${ordinal(use!)}-level slot)` : 'Cast anyway: no slot left'}</button>}
        {spell.rolls.map((r) => (
          <button key={r.label} className="btn" onClick={() => roll(r)}>{r.label} <span className="num">{r.dice}</span></button>
        ))}
      </div>
      <details className="rule-text">
        <summary>{spell.text ? 'Rules text and notes' : 'Notes'}</summary>
        {spell.text
          ? <RuleText text={[spell.components ? `Components: ${spell.components}` : '', spell.text].filter(Boolean).join('\n')} tables={spell.tables} book={spell.book} />
          : <p className="page-ref">This spell is from a 5th Edition book outside the free rules (the SRD), so its text cannot be shown here. Keep what you need to remember in the notes.</p>}
        {spell.book === SRD_BOOK && <p className="page-ref">From the System Reference Document 5.1 by Wizards of the Coast LLC, CC-BY-4.0 ({cite(spell.book, spell.page ?? 0)}).</p>}
        <label className="field">
          <span className="label">Your notes</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (spell.notes ?? '') && change({ notes: notes || undefined }, `Notes on ${spell.name}`)} placeholder="Range, damage, what it does…" />
        </label>
        <button className="btn" onClick={() => live.setDoc({ ...doc, spells: known.filter((k) => k.id !== spell.id) }, `Forgot ${spell.name}`)}>Forget this spell</button>
      </details>
    </div>
  );
}

/** Spell slots, casting numbers and every spell the character knows. */
export function SpellsTab({ live, onOpen }: { live: LiveCharacter; onOpen: OpenStat }) {
  const { doc, sheet } = live;
  const [adding, setAdding] = useState(false);
  const book = sheet.spellbook;
  const spend = (id: string, by: number) => {
    const result = spendResource(doc.state, sheet, id, by);
    live.setState(result.state, result.warning ? `${result.summary} (${result.warning})` : result.summary);
  };
  const levels = [...new Set(book.known.map((k) => k.level))];
  return (
    <>
      <section className="card">
        <h2>Spells</h2>
        {book.casting.length === 0 && book.slots.length === 0 && <p className="soft">This character’s classes do not cast spells. You can still add spells you have from somewhere else (a Spirit Surge, a racial trait, a Devil Fruit).</p>}
        {book.casting.map((c) => (
          <div key={c.from} className="tiles">
            {c.dc && <Tile stat={c.dc} kind="plain" sub={c.from} onOpen={onOpen} />}
            {c.attack && <Tile stat={c.attack} kind="mod" sub={c.from} onOpen={onOpen} rollable />}
          </div>
        ))}
        {book.limits.length > 0 && (
          <div className="chips">
            {book.limits.map((l) => <span key={`${l.from}/${l.label}`} className="chip chip-lg">{l.label} <strong className="num">{l.value}</strong></span>)}
          </div>
        )}
        <p className="page-ref">
          On this sheet: {book.cantrips} cantrip{book.cantrips === 1 ? '' : 's'}, {book.leveled} of 1st level or higher, {book.prepared} prepared. The numbers above are what your class table gives; going over is your call.
        </p>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>Add spells</button>
      </section>

      {book.slots.length > 0 && (
        <section className="card">
          <h2>Slots</h2>
          {book.slots.map((slot) => (
            <div key={slot.id} className="resource">
              <div>
                <div className="resource-name">{slot.name}</div>
                <div className="page-ref">back on a {slot.recharge} rest</div>
              </div>
              <span className="big num">{slot.remaining}<span className="soft"> / {slot.max}</span></span>
              <div className="row">
                <button className="btn" onClick={() => spend(slot.id, 1)} disabled={slot.remaining <= 0} aria-label={`Spend one of ${slot.name}`}>−</button>
                <button className="btn" onClick={() => spend(slot.id, -1)} disabled={slot.remaining >= slot.max} aria-label={`Give back one of ${slot.name}`}>+</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {levels.map((level) => (
        <section key={level} className="card">
          <h2>{spellLevelName(level)}</h2>
          {book.known.filter((k) => k.level === level).map((spell) => <SpellRow key={spell.id} spell={spell} live={live} />)}
        </section>
      ))}

      {adding && <AddSpellsDialog live={live} onClose={() => setAdding(false)} />}
    </>
  );
}
