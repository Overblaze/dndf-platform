import { cite, racePickOptions, toolSuggestions, type RacePick } from '@dndf/engine';
import { useEffect, useState } from 'react';

/** A name typed in: kept as it is typed, handed on when the box is left or Enter is pressed (one change, not one a letter). */
function NameInput({ value, onCommit, placeholder, list }: { value: string; onCommit: (next: string) => void; placeholder: string; list?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  const commit = () => {
    if (text.trim() !== value) onCommit(text.trim());
  };
  return <input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} placeholder={placeholder} list={list} />;
}

/**
 * What a racial trait or a picked upgrade leaves to choose: "one skill proficiency and one tool proficiency of
 * your choice". A skill or a weapon is picked from a list, a tool is typed. Nothing has to be picked.
 */
export function RacePickFields({ picks, weapons, onChange }: { picks: RacePick[]; weapons: string[]; onChange: (pick: RacePick, next: string[]) => void }) {
  if (picks.length === 0) return null;
  return (
    <>
      {picks.map((pick) => {
        const options = racePickOptions(pick);
        const slots = Array.from({ length: Math.max(pick.def.count, pick.picked.length) }, (_, i) => pick.picked[i] ?? '');
        const set = (i: number, value: string) => onChange(pick, slots.map((v, j) => (j === i ? value : v)).filter((v) => v !== ''));
        const left = pick.def.count - pick.picked.filter((v) => v !== 'tool:').length;
        return (
          <fieldset key={pick.key} className="race-pick">
            <legend className="label">{pick.from === 'Tools' ? pick.race : pick.from}: {pick.def.label}{left > 0 ? ` · ${left} to choose` : ''} · {cite(pick.book, pick.page)}</legend>
            {pick.def.kind === 'tool' && <datalist id={`tools-${pick.key}`}>{toolSuggestions(pick.def.label).map((tool) => <option key={tool} value={tool} />)}</datalist>}
            {slots.map((value, i) => {
              const name = pick.def.kind === 'tool' ? `Tool${slots.length > 1 ? ` ${i + 1}` : ''}` : `${pick.def.label}${slots.length > 1 ? ` ${i + 1}` : ''}`;
              const asTool = value.startsWith('tool:');
              if (pick.def.kind === 'tool') {
                return (
                  <label key={i} className="field">
                    <span className="label">{name}</span>
                    <NameInput value={value} onCommit={(next) => set(i, next)} placeholder="Pick from the list or type your own" list={`tools-${pick.key}`} />
                  </label>
                );
              }
              const list = pick.def.kind === 'weapon' ? weapons.map((w) => ({ id: w, name: w })) : options ?? [];
              // Something picked that the list no longer has (typed on another device, or from the other handbook) stays choosable.
              const known = value === '' || asTool || list.some((o) => o.id === value);
              return (
                <div key={i}>
                  <label className="field">
                    <span className="label">{name}</span>
                    <select value={asTool ? 'tool:' : value} onChange={(e) => set(i, e.target.value)}>
                      <option value="">Not chosen yet</option>
                      {!known && <option value={value}>{value}</option>}
                      {list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      {pick.def.orTool && <option value="tool:">{pick.def.orTool} instead…</option>}
                    </select>
                  </label>
                  {asTool && (
                    <label className="field">
                      <span className="label">{pick.def.orTool}</span>
                      <NameInput value={value.slice(5)} onCommit={(next) => set(i, `tool:${next}`)} placeholder="Which one?" />
                    </label>
                  )}
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </>
  );
}
