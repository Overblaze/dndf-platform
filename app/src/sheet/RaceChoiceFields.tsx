import { cite, type RaceChoice } from '@dndf/engine';
import type { ReactNode } from 'react';

/**
 * The pick-lists of a race (Cyborg Upgrades, a Mink's Animal Characteristics): tick what the character has.
 * More than the level gives is allowed and said; an upgrade without the one it builds on is said too.
 */
export function RaceChoiceFields({ choices, picked, onChange, withText, under }: { choices: RaceChoice[]; picked: Record<string, string[]>; onChange: (id: string, next: string[]) => void; withText?: boolean; /** What a ticked option leaves to choose, shown right under it. */ under?: (choiceId: string, optionId: string) => ReactNode }) {
  return (
    <>
      {choices.map((choice) => {
        const have = picked[choice.id] ?? [];
        const toggle = (id: string) => onChange(choice.id, have.includes(id) ? have.filter((x) => x !== id) : [...have, id]);
        const orphans = choice.options.filter((o) => have.includes(o.id) && o.requires && !have.includes(o.requires));
        return (
          <fieldset key={choice.id}>
            <legend className="label">{choice.from}: {choice.name}: {have.length} of {choice.allowed} · {cite(choice.book, choice.page)}</legend>
            {have.length > choice.allowed && <p className="notice">That is more than the {choice.allowed} the rules give at this level. It's your call.</p>}
            {orphans.map((o) => (
              <p key={o.id} className="notice">{o.name} is an upgrade of {choice.options.find((x) => x.id === o.requires)?.name ?? o.requires}, which is not picked.</p>
            ))}
            {choice.options.map((option) => (
              <div key={option.id}>
                <label className="check">
                  <input type="checkbox" checked={have.includes(option.id)} onChange={() => toggle(option.id)} />
                  <span>{option.name}{option.requires ? <span className="page-ref"> · upgrades {choice.options.find((x) => x.id === option.requires)?.name}</span> : null}</span>
                </label>
                {withText && <p className="page-ref option-text">{option.text}</p>}
                {have.includes(option.id) && under?.(choice.id, option.id)}
              </div>
            ))}
          </fieldset>
        );
      })}
    </>
  );
}
