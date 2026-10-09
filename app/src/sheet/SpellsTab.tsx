import { CUSTOM_SPELL_BOOK, SRD_BOOK, castSpell, cite, gainTempHp, learnCustomSpell, ordinal, spellLevelName, spellLists, spendResource, type CustomSpell, type KnownSpell, type SheetSpell, type SpellChoice } from '@dndf/engine';
import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { RuleText } from '../components/RuleText';
import { useRolls } from '../lib/rolls';
import { useAuth } from '../lib/auth';
import { spellLibraryFor, type LibrarySpell } from '../lib/homebrew';
import type { LiveCharacter } from '../lib/useCharacter';
import { SpellEditor } from './SpellEditor';
import { Tile, type OpenStat } from './Vitals';


/** Pick spells from a class list, or write one in by name. */
function AddSpellsDialog({ live, onClose }: { live: LiveCharacter; onClose: () => void }) {
  const { doc, rules } = live;
  const lists = useMemo(() => spellLists(doc, rules), [doc, rules]);
  const [listId, setListId] = useState(lists[0]?.id ?? '');
  const [level, setLevel] = useState<number | null>(null);
  const [text, setText] = useState('');
  const { session } = useAuth();
  const library = useMemo(() => spellLibraryFor(session?.user.id ?? null), [session?.user.id]);
  const [mine, setMine] = useState<LibrarySpell[]>([]);
  const [libraryProblem, setLibraryProblem] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [keep, setKeep] = useState(true);
  const loadMine = () => library.list().then((found) => { setMine(found); setLibraryProblem(null); }, (e: Error) => setLibraryProblem(e.message));
  useEffect(() => { void loadMine(); }, [library]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = lists.find((l) => l.id === listId);
  const known = doc.spells ?? [];
  // With more than one casting class, a spell from another class's list (or your own) needs saying which class it counts for.
  const casters = live.sheet.spellbook.classes;
  const fromList = casters.find((c) => c.list === listId);
  const [chosenClass, setChosenClass] = useState('');
  const countsFor = fromList ? '' : casters.length > 1 ? chosenClass : '';
  const has = (spell: SpellChoice) => known.some((k) => k.name === spell.name);
  const levels = [...new Set((list?.spells ?? []).map((s) => s.level))].sort((a, b) => a - b);
  const shown = (list?.spells ?? []).filter((s) => (level === null || s.level === level) && s.name.toLowerCase().includes(text.trim().toLowerCase()));
  const toggle = (spell: SpellChoice) => {
    if (has(spell)) live.setDoc({ ...doc, spells: known.filter((k) => k.name !== spell.name) }, `Forgot ${spell.name}`);
    else live.setDoc({ ...doc, spells: [...known, { id: crypto.randomUUID(), name: spell.name, level: spell.level, list: spell.list, entry: spell.entry, cls: countsFor || undefined }] }, `Learned ${spell.name}`);
  };
  const knows = (spell: CustomSpell) => known.some((k) => k.name === spell.name && k.own);
  const toggleMine = (spell: CustomSpell) => {
    if (knows(spell)) live.setDoc({ ...doc, spells: known.filter((k) => !(k.name === spell.name && k.own)) }, `Forgot ${spell.name}`);
    else live.setDoc({ ...doc, spells: [...known, { ...learnCustomSpell(spell, crypto.randomUUID()), cls: countsFor || undefined }] }, `Learned ${spell.name}`);
  };
  // A spell written here goes on this character at once, and into the library too unless the box is unticked.
  const write = (spell: CustomSpell) => {
    live.setDoc({ ...doc, spells: [...known, { ...learnCustomSpell(spell, crypto.randomUUID()), cls: countsFor || undefined }] }, `Learned ${spell.name}`);
    setWriting(false);
    if (keep) library.save(spell, null).then(loadMine, (e: Error) => setLibraryProblem(`${spell.name} is on this character, but was not kept in your library: ${e.message}`));
  };
  const shownMine = mine.filter((s) => (level === null || s.level === level) && s.name.toLowerCase().includes(text.trim().toLowerCase()));
  if (writing) {
    return (
      <SpellEditor
        title="Write a spell"
        onSave={write}
        onClose={() => setWriting(false)}
        extra={(
          <label className="check">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            <span>Also keep it in my spell library, for other characters{library.local ? ' (in this browser)' : ''}</span>
          </label>
        )}
      />
    );
  }
  return (
    <Dialog title="Add spells" onClose={onClose}>
      <label className="field">
        <span className="label">Spell list</span>
        <select value={listId} onChange={(e) => { setListId(e.target.value); setLevel(null); }}>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}{l.own ? ' (your class)' : ''}</option>)}
          <option value="mine">Your spells{mine.length ? ` (${mine.length})` : ''}</option>
        </select>
      </label>
      {list && <p className="page-ref">{list.spells.length} spells · {cite(list.book, list.page)} · {list.spells.filter((x) => x.entry).length} with their text (the handbook’s own, and the ones in the free 5e rules); the rest are in other 5th Edition books and are listed by name.</p>}
      {listId === 'mine' && (
        <>
          <p className="page-ref">Spells you wrote, and any your table has shared. They are copied onto the character, so later changes to the library do not change this sheet.</p>
          {libraryProblem && <p className="notice" role="alert">{libraryProblem}</p>}
        </>
      )}
      {casters.length > 0 && !fromList && (
        <p className="page-ref">
          {casters.length === 1
            ? `This is not the ${casters[0]!.name}’s own spell list. You can add anything from here: it counts as a ${casters[0]!.name} spell and is marked * as an override.`
            : 'This is not one of your classes’ own spell lists. You can add anything from here: it counts for the class you choose below and is marked * as an override.'}
        </p>
      )}
      {casters.length > 1 && !fromList && (
        <label className="field">
          <span className="label">Spells added from this list count for</span>
          <select value={chosenClass} onChange={(e) => setChosenClass(e.target.value)}>
            <option value="">No class (decide later on the spell)</option>
            {casters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <div className="row wrap">
        <button className="btn" onClick={() => setWriting(true)}>Write a new spell</button>
      </div>
      <div className="segmented surge-tabs" role="tablist" aria-label="Spell level">
        <button role="tab" aria-selected={level === null} className={level === null ? 'active' : ''} onClick={() => setLevel(null)}>All</button>
        {(listId === 'mine' ? [...new Set(mine.map((m) => m.level))].sort((a, b) => a - b) : levels).map((l) => (
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
      {listId === 'mine' && shownMine.map((spell) => (
        <label key={spell.id} className="check">
          <input type="checkbox" checked={knows(spell)} onChange={() => toggleMine(spell)} />
          <span>{spell.name} <span className="page-ref">{spell.level === 0 ? 'cantrip' : `${ordinal(spell.level)} level`}{spell.mine ? '' : ' · shared by a crewmate'}</span></span>
        </label>
      ))}
      {(listId === 'mine' ? shownMine.length : shown.length) === 0 && <p className="soft">{listId === 'mine' && mine.length === 0 ? 'You have not written any spells yet. “Write a new spell” starts one.' : 'Nothing by that name at that level in this list.'}</p>}

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
  const [editing, setEditing] = useState(false);
  const { classes } = sheet.spellbook;
  const hasSlots = sheet.spellbook.slots.some((s) => Number(s.id.slice(5)) >= spell.level);
  return (
    <div className="action">
      <div className="action-head">
        <div>
          <div className="resource-name">{spell.name}{spell.override && <abbr className="override-mark" title={`Override: not on the ${spell.clsName} spell list`}> *</abbr>}</div>
          <div className="page-ref">
            {[spell.item ? `from ${spell.item}` : '', spell.clsName ? `${spell.clsName}${spell.mode === 'prepared' ? '' : ' · known'}` : '', spell.school, spell.ritual ? 'ritual' : '', spell.castingTime, spell.range, spell.duration, spell.page && spell.book ? cite(spell.book, spell.page) : ''].filter(Boolean).join(' · ') || (spell.level === 0 ? 'At will' : `${ordinal(spell.level)} level`)}
          </div>
        </div>
        {spell.level > 0 && spell.mode === 'prepared' && (
          <label className="check">
            <input type="checkbox" checked={spell.prepared === true} onChange={(e) => change({ prepared: e.target.checked || undefined }, `${spell.name}: ${e.target.checked ? 'prepared' : 'not prepared'}`)} />
            <span className="page-ref">Prepared</span>
          </label>
        )}
        {spell.level > 0 && spell.mode === 'known' && <span className="chip">Known</span>}
      </div>
      <div className="row wrap">
        {spell.level > 0 && spell.castableWith.length > 1 && (
          <select value={use} onChange={(e) => setSlot(Number(e.target.value))} aria-label={`Slot level for ${spell.name}`}>
            {spell.castableWith.map((l) => <option key={l} value={l}>{ordinal(l)}-level slot</option>)}
          </select>
        )}
        {spell.level > 0 && hasSlots && (
          <button className={spell.ready ? 'btn btn-primary' : 'btn'} onClick={cast}>
            {spell.castableWith.length ? `Cast (${ordinal(use!)}-level slot)` : 'Cast anyway: no slot left'}{spell.ready ? '' : ', not prepared'}
          </button>
        )}
        {spell.rolls.map((r) => (
          <button key={r.label} className="btn" onClick={() => roll(r)}>{r.label} <span className="num">{r.dice}</span></button>
        ))}
      </div>
      {spell.override && <p className="page-ref">* Override: this spell is not on the {spell.clsName} list. It counts as a {spell.clsName} spell because you added it.</p>}
      {spell.tooHigh && <p className="page-ref held-why">Higher than {spell.clsName} can {spell.mode === 'prepared' ? 'prepare' : 'learn'} at its level. It stays on the sheet; that is your call.</p>}
      <details className="rule-text">
        <summary>{spell.text ? 'Rules text and notes' : 'Notes'}</summary>
        {classes.length > 1 && (
          <label className="field">
            <span className="label">Counts for (its class’s ability, DC and limits are used)</span>
            <select value={spell.cls ?? ''} onChange={(e) => change({ cls: e.target.value || undefined }, `${spell.name}: counts for ${classes.find((c) => c.id === e.target.value)?.name ?? 'no class'}`)}>
              <option value="">No class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        {spell.text
          ? <RuleText text={[spell.components ? `Components: ${spell.components}` : '', spell.text].filter(Boolean).join('\n')} tables={spell.tables} book={spell.book} />
          : spell.own
            ? <p className="page-ref">{spell.components ? `Components: ${spell.components}. ` : ''}You have not written what this spell does yet.</p>
            : <p className="page-ref">This spell is from a 5th Edition book outside the free rules (the SRD), so its text cannot be shown here. Keep what you need to remember in the notes, or write its details yourself.</p>}
        {spell.book === CUSTOM_SPELL_BOOK && <p className="page-ref">Your own spell.</p>}
        {spell.book === SRD_BOOK && <p className="page-ref">From the System Reference Document 5.1 by Wizards of the Coast LLC, CC-BY-4.0 ({cite(spell.book, spell.page ?? 0)}).</p>}
        {spell.item ? <p className="page-ref">Granted by {spell.item} while it is in use. It counts against no class; put the item away and the spell goes with it.</p> : (
          <>
        <label className="field">
          <span className="label">Your notes</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (spell.notes ?? '') && change({ notes: notes || undefined }, `Notes on ${spell.name}`)} placeholder="Range, damage, what it does…" />
        </label>
        <div className="row wrap">
          {(spell.own || !spell.text) && <button className="btn" onClick={() => setEditing(true)}>{spell.own ? 'Change this spell' : 'Write its details yourself'}</button>}
          <button className="btn" onClick={() => live.setDoc({ ...doc, spells: known.filter((k) => k.id !== spell.id) }, `Forgot ${spell.name}`)}>Forget this spell</button>
        </div>
          </>
        )}
      </details>
      {editing && (
        <SpellEditor
          initial={{ id: spell.id, name: spell.name, level: spell.level, ...(spell.own ?? { text: '' }) }}
          title={`Change ${spell.name}`}
          onClose={() => setEditing(false)}
          onSave={(next) => { const { id: _id, name, level, ...own } = next; change({ name, level, own }, `Changed ${name}`); setEditing(false); }}
          extra={<p className="page-ref">This changes the spell on this character only.</p>}
        />
      )}
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
        {book.classes.map((c) => {
          const count = (have: number, max: number | undefined, what: string) => (max === undefined ? null : (
            <span className={have > max ? 'chip chip-lg chip-damage' : 'chip chip-lg'}>{what} <strong className="num">{have}</strong> of {max}</span>
          ));
          return (
            <div key={c.id} className="spell-class">
              <h3>{c.name} {c.level} <span className="chip">{c.mode === 'prepared' ? 'Prepares spells' : 'Learns spells'}</span></h3>
              <div className="tiles">
                {c.dc && <Tile stat={c.dc} kind="plain" onOpen={onOpen} />}
                {c.attack && <Tile stat={c.attack} kind="mod" onOpen={onOpen} rollable />}
              </div>
              <div className="chips">
                {count(c.cantrips, c.cantripsMax, 'Cantrips')}
                {c.mode === 'prepared' ? count(c.prepared, c.preparedMax, 'Prepared') : count(c.known, c.knownMax, 'Known')}
                {c.maxSpellLevel !== undefined && <span className="chip chip-lg">Spells up to <strong className="num">{ordinal(c.maxSpellLevel)}</strong> level</span>}
              </div>
              <p className="page-ref">
                {c.mode === 'prepared'
                  ? `Each long rest, prepare up to ${c.preparedMax ?? '?'} ${c.name} spells from its whole list (ability modifier + ${c.name} level, at least 1). Only prepared spells can be cast; cantrips are always ready. ${c.known} on this sheet to choose from.`
                  : `Knows a fixed number of ${c.name} spells, set by its table. Every one it knows is always ready; nothing is prepared. One can be swapped when you gain a ${c.name} level.`}
              </p>
            </div>
          );
        })}
        {book.classes.length > 1 && (
          <p className="notice">
            More than one class casts. Each spell counts for one class and uses that class’s ability; what each class knows or prepares is worked out at its own level, as if it were your only class.
            {book.pooledSlots ? ' Your slots come from the Multiclass Spellcaster table for your combined levels, so some can be of a higher level than any spell you can know or prepare: use them to cast lower-level spells at a higher level.' : ''}
            {' '}<span className="page-ref">{cite(sheet.book, doc.rulesVersion === 'dndf-10' ? 210 : 209)}</span>
          </p>
        )}
        {book.known.some((k) => k.override) && <p className="page-ref">* marks an override: a spell given to a class that does not have it on its own list.</p>}
        <p className="page-ref">
          On this sheet in all: {book.cantrips} cantrip{book.cantrips === 1 ? '' : 's'}, {book.leveled} of 1st level or higher. Going over a class’s number is your call; nothing is blocked.
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
