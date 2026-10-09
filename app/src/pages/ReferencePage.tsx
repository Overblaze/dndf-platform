import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { challengeOf, outlineOf, searchSrd, SRD52_NAME, SRD_KIND_LABEL, type SrdBlock, type SrdChapter, type SrdEntry, type SrdLibrary } from '../lib/srd52';
import { loadSrd52 } from '../lib/srd52Load';

const HOME = '/library/srd52';
const link = (id: string) => `${HOME}/${encodeURIComponent(id)}`;
const cite = (page: number) => `SRD 5.2.1 p.${page}`;

function useSrd(): { library?: SrdLibrary; failed: boolean; retry: () => void } {
  const [library, setLibrary] = useState<SrdLibrary>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    loadSrd52().then((found) => live && setLibrary(found), () => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);
  return { library, failed, retry: () => setAttempt((n) => n + 1) };
}

/** The attribution the licence asks for, with its two addresses as links. */
function Attribution({ note }: { note: string }) {
  const parts = note.split(/(https:\/\/[^\s,]+[a-z/])/);
  return (
    <p className="page-ref">
      {parts.map((part, i) => (part.startsWith('https://') ? <a key={i} href={part}>{part}</a> : part))}
    </p>
  );
}

function Lead({ text, lead }: { text: string; lead?: string }) {
  if (!lead || !text.startsWith(lead)) return <>{text}</>;
  return <><strong>{lead}</strong>{text.slice(lead.length)}</>;
}

function TableBlock({ block }: { block: Extract<SrdBlock, { t: 'table' }> }) {
  const header = block.head === false ? undefined : block.rows[0];
  const body = header ? block.rows.slice(1) : block.rows;
  const width = block.rows[0]?.length ?? 0;
  // Words read from the left; short numbers sit under their header.
  const wordy = Array.from({ length: width }, (_, c) => c === 0 || body.some((row) => (row[c] ?? '').length > 14));
  const over = block.over ?? [];
  return (
    <figure className="ref-table">
      {block.title && <figcaption>{block.title}</figcaption>}
      <div className="rule-table">
        <table>
          {header && (
            <thead>
              {over.length > 0 && (
                <tr>
                  {Array.from({ length: width }, (_, c) => {
                    const span = over.find((o) => o.from === c);
                    if (span) return <th key={c} colSpan={span.to - span.from + 1}>{span.text}</th>;
                    return over.some((o) => c > o.from && c <= o.to) ? null : <th key={c} />;
                  })}
                </tr>
              )}
              <tr>{header.map((cell, c) => <th key={c} className={wordy[c] ? 'left' : ''}>{cell}</th>)}</tr>
            </thead>
          )}
          <tbody>
            {body.map((row, r) => {
              // A row with only its first cell is a heading inside the table ("Simple Melee Weapons").
              const label = width > 1 && row.slice(1).every((cell) => !cell);
              return (
                <tr key={r}>
                  {label ? <th className="left" colSpan={width}>{row[0]}</th> : row.map((cell, c) => <td key={c} className={wordy[c] ? 'left' : ''}>{cell}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(block.notes ?? []).map((note, i) => <p key={i} className="page-ref">{note}</p>)}
    </figure>
  );
}

function Block({ block, anchor }: { block: SrdBlock; anchor?: (node: HTMLElement | null) => void }) {
  switch (block.t) {
    case 'h':
      if (block.level <= 2) return <h2 ref={anchor}>{block.text}</h2>;
      if (block.level === 3) return <h3 ref={anchor}>{block.text}</h3>;
      return block.level === 4 ? <h3 className="ref-stat-name">{block.text}</h3> : <h4 className="ref-stat-part">{block.text}</h4>;
    case 'p':
      return /^•\s/.test(block.text)
        ? <p className="feature-text ref-bullet">{block.text.replace(/^•\s+/, '')}</p>
        : <p className="feature-text"><Lead text={block.text} lead={block.lead} /></p>;
    case 'stat':
      return <p className="ref-stat"><Lead text={block.text} lead={block.lead} /></p>;
    case 'facts':
      return (
        <dl className="facts facts-plain">
          {block.rows.map(([name, value], i) => (
            <div key={i} className="ref-fact">
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      );
    case 'abilities':
      return (
        <div className="rule-table ref-abilities">
          <table>
            <thead>
              <tr><th />{block.rows.map(([name]) => <th key={name}>{name}</th>)}</tr>
            </thead>
            <tbody>
              {(['Score', 'Mod', 'Save'] as const).map((label, r) => (
                <tr key={label}>
                  <th className="left">{label}</th>
                  {block.rows.map((row) => <td key={row[0]}>{row[r + 1]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'sidebar':
      return (
        <aside className="ref-sidebar">
          <h4>{block.title}</h4>
          {block.text.split('\n').map((text, i) => <p key={i} className="feature-text">{text}</p>)}
        </aside>
      );
    case 'table':
      return <TableBlock block={block} />;
  }
}

function EntryView({ library, entry }: { library: SrdLibrary; entry: SrdEntry }) {
  const outline = useMemo(() => outlineOf(entry), [entry]);
  const anchors = useRef(new Map<number, HTMLElement>());
  const chapter = library.chapterOf.get(entry.id);
  // (In braces: newer browsers return a promise from scrollTo, and React would take it for a cleanup.)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [entry.id]);
  return (
    <>
      <section className="card">
        <p className="page-ref">
          <Link to="/library">Library</Link> · <Link to={HOME}>5th Edition rules, 2024</Link> · {chapter} · {SRD_KIND_LABEL[entry.kind]} · {cite(entry.page)}
        </p>
        <h1>{entry.name}</h1>
        {entry.subtitle && <p className="soft"><em>{entry.subtitle}</em></p>}
        {entry.group && entry.kind !== 'feat' && <p className="page-ref">{entry.group}</p>}
        {outline.length > 5 && (
          <details className="shelf ref-outline">
            <summary>
              <span className="label">Jump to</span>
              <span className="page-ref">{outline.length} headings</span>
            </summary>
            {outline.map((item) => (
              <button key={item.index} className={`btn ref-jump ${item.level === 3 ? 'ref-jump-in' : ''}`} onClick={() => anchors.current.get(item.index)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {item.text}
              </button>
            ))}
          </details>
        )}
        {entry.blocks.map((block, i) => (
          <Block key={i} block={block} anchor={block.t === 'h' ? (node) => { if (node) anchors.current.set(i, node); else anchors.current.delete(i); } : undefined} />
        ))}
      </section>
      <section className="card">
        <p className="page-ref">
          {SRD52_NAME}, page {entry.page}. These are the 2024 rules, here to look things up: characters on this site follow the DnDF handbooks, so nothing on this page changes a sheet.
        </p>
        <Attribution note={library.note} />
      </section>
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

function EntryLinks({ entries }: { entries: SrdEntry[] }) {
  return (
    <>
      {entries.map((entry) => (
        <Link key={entry.id} className="resource character-link" to={link(entry.id)}>
          <span className="resource-name">{entry.name}</span>
          <span className="page-ref">
            {[entry.kind === 'monster' ? `CR ${challengeOf(entry)}` : '', entry.subtitle ?? '', cite(entry.page)].filter(Boolean).join(' · ')}
          </span>
        </Link>
      ))}
    </>
  );
}

/** A chapter's entries under the headings the book groups them by, in the book's order. */
function ChapterShelf({ chapter }: { chapter: SrdChapter }) {
  const groups: { name: string; entries: SrdEntry[] }[] = [];
  for (const entry of chapter.entries) {
    const name = entry.kind === 'monster' ? '' : entry.kind === 'section' ? '' : entry.group ?? entry.section ?? '';
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.entries.push(entry);
    else groups.push({ name, entries: [entry] });
  }
  return (
    <Shelf title={chapter.chapter} count={chapter.entries.length}>
      {groups.map((group, i) => (
        <div key={i}>
          {group.name && groups.length > 1 && <h3>{group.name}</h3>}
          <EntryLinks entries={group.entries} />
        </div>
      ))}
    </Shelf>
  );
}

function Home({ library }: { library: SrdLibrary }) {
  const [query, setQuery] = useState('');
  const [words, setWords] = useState(false);
  const hits = useMemo(() => searchSrd(library, query, { words }), [library, query, words]);
  const total = library.chapters.reduce((n, chapter) => n + chapter.entries.length, 0);
  return (
    <>
      <section className="card">
        <p className="page-ref"><Link to="/library">Library</Link> · Other rulebooks</p>
        <h1>5th Edition rules, 2024</h1>
        <p className="soft">
          The {SRD52_NAME}: the free rules Wizards of the Coast publishes for the 2024 edition, word for word, with the page for everything. {total.toLocaleString()} entries.
        </p>
        <p className="page-ref">
          For looking things up. Characters on this site are built on the DnDF handbooks, which follow the 2014 rules, so a class, spell or feat here is not offered on the Build page and changes no sheet.
        </p>
        <label className="field">
          <span className="label">Search by name</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Fireball, Grappled, Goblin, Weapon Mastery, Bag of Holding…" />
        </label>
        <label className="check">
          <input type="checkbox" checked={words} onChange={(e) => setWords(e.target.checked)} />
          <span>Also look inside the text</span>
        </label>
        {query.trim().length >= 2 && hits.length === 0 && <p>Nothing {words ? 'says' : 'is called'} that in the SRD 5.2.1.{!words && ' Try looking inside the text.'}</p>}
        {hits.map((hit, i) => (
          <Link key={i} className="resource character-link" to={link(hit.id)}>
            <span className="resource-name">{hit.title}</span>
            <span className="page-ref">{hit.where} · {cite(hit.page)}</span>
            {hit.snippet && <span className="page-ref ref-snippet">{hit.snippet}</span>}
          </Link>
        ))}
      </section>
      {library.chapters.map((chapter) => <ChapterShelf key={chapter.chapter} chapter={chapter} />)}
      <section className="card">
        <Attribution note={library.note} />
      </section>
    </>
  );
}

export function ReferencePage() {
  const { id } = useParams();
  const { library, failed, retry } = useSrd();
  if (!library) {
    return (
      <section className="card">
        <p className="page-ref"><Link to="/library">Library</Link> · Other rulebooks</p>
        <h1>5th Edition rules, 2024</h1>
        {failed ? (
          <>
            <p>The rulebook could not be fetched. It needs a connection the first time it is opened on a device.</p>
            <button className="btn" onClick={retry}>Try again</button>
          </>
        ) : <p className="soft">Opening the book…</p>}
      </section>
    );
  }
  if (!id) return <Home library={library} />;
  const entry = library.byId.get(decodeURIComponent(id));
  if (!entry) {
    return (
      <section className="card">
        <h1>Not in the SRD 5.2.1</h1>
        <p>Nothing in the 2024 rules has that address.</p>
        <Link className="btn" to={HOME}>Back to the 2024 rules</Link>
      </section>
    );
  }
  return <EntryView library={library} entry={entry} />;
}
