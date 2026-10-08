import { cite, type CustomFeature } from '@dndf/engine';
import { useState } from 'react';
import { RuleText } from '../components/RuleText';
import type { LiveCharacter } from '../lib/useCharacter';
import { Dialog } from '../components/Dialog';
import { BorrowFeatureDialog, CustomFeatureDialog } from './CustomFeatures';
import { RaceChoiceFields } from './RaceChoiceFields';

/** "Warrior 5 · EH10 p.201", or just where a player's own feature comes from. */
export const featureRef = (feature: { book: string; from: string; page: number }) => (feature.book === 'Custom' ? `${feature.from} · your own` : `${feature.from} · ${cite(feature.book, feature.page)}`);

export function FeaturesTab({ live }: { live: LiveCharacter }) {
  const { doc, sheet } = live;
  const [editing, setEditing] = useState<CustomFeature | 'new' | null>(null);
  const [borrowing, setBorrowing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const customs = doc.customFeatures ?? [];
  const saveCustom = (feature: CustomFeature) => {
    const exists = customs.some((c) => c.id === feature.id);
    live.setDoc({ ...doc, customFeatures: exists ? customs.map((c) => (c.id === feature.id ? feature : c)) : [...customs, feature] }, `${exists ? 'Changed' : 'Added'} ${feature.name}`);
    setEditing(null);
  };
  const deleteCustom = (feature: CustomFeature) => {
    live.setDoc({ ...doc, customFeatures: customs.filter((c) => c.id !== feature.id) }, `Deleted ${feature.name}`);
    setEditing(null);
  };
  const takeOff = (key: string, name: string) => live.setDoc({ ...doc, removedFeatures: [...(doc.removedFeatures ?? []), key] }, `Took ${name} off the sheet`);
  const putBack = (key: string, name: string) => live.setDoc({ ...doc, removedFeatures: (doc.removedFeatures ?? []).filter((k) => k !== key) }, `Put ${name} back`);
  const unborrow = (key: string, name: string) =>
    live.setDoc({ ...doc, borrowedFeatures: (doc.borrowedFeatures ?? []).filter((b) => !(key.startsWith(`${b.entry}/`) && b.name === name)) }, `Gave back ${name}`);
  return (
    <section className="card">
      <h2>Features</h2>
      {sheet.warnings.map((warning) => (
        <p key={warning} className="notice">{warning}</p>
      ))}
      {sheet.raceChoices.map((choice) => (
        <div key={choice.id} className="resource">
          <div>
            <div className="resource-name">{choice.name}</div>
            <div className="page-ref">
              {choice.picked.length} of {choice.allowed} picked{choice.picked.length < choice.allowed ? ': you have more to choose' : ''} · {choice.from} · {cite(choice.book, choice.page)}
            </div>
          </div>
          <button className={choice.picked.length < choice.allowed ? 'btn btn-primary' : 'btn'} onClick={() => setChoosing(true)}>Choose</button>
        </div>
      ))}
      <div className="row wrap">
        <button className="btn" onClick={() => setEditing('new')}>Add your own feature</button>
        <button className="btn" onClick={() => setBorrowing(true)}>Borrow a feature</button>
      </div>
      {sheet.features.map((feature) => {
        const custom = feature.key.startsWith('custom/') ? customs.find((c) => `custom/${c.id}` === feature.key) : undefined;
        const borrowed = feature.from.endsWith('(borrowed)');
        return (
          <details key={feature.key} className="feature">
            <summary>
              <span className="resource-name">{feature.name}</span>
              <span className="page-ref">{featureRef(feature)}</span>
            </summary>
            <RuleText text={feature.text} sections={feature.sections} tables={feature.tables} book={feature.book} />
            {!custom && <p className="page-ref">{feature.book} ({cite(feature.book, feature.page)})</p>}
            {feature.completedFrom && (
              <p className="page-ref">This handbook’s page cuts the text off; the end is from {feature.completedFrom.book} ({cite(feature.completedFrom.book, feature.completedFrom.page)}).</p>
            )}
            {custom && <button className="btn" onClick={() => setEditing(custom)}>Edit or delete</button>}
            {borrowed && <button className="btn" onClick={() => unborrow(feature.key, feature.name)}>Give it back</button>}
            {!custom && !borrowed && feature.page > 0 && /^(class|subclass|optionGroup)\./.test(feature.key) && (
              <button className="btn" onClick={() => takeOff(feature.key, feature.name)}>Take it off this character</button>
            )}
          </details>
        );
      })}
      {sheet.takenOff.length > 0 && (
        <div className="taken-off">
          <h3>Taken off this character</h3>
          <p className="page-ref">These belong to your class but are not counted: no buttons, no counters, no numbers. To swap one for something else, borrow the replacement above.</p>
          {sheet.takenOff.map((f) => (
            <div key={f.key} className="resource">
              <div>
                <div className="resource-name">{f.name}</div>
                <div className="page-ref">{f.from} · {cite(f.book, f.page)}</div>
              </div>
              <button className="btn" onClick={() => putBack(f.key, f.name)}>Put it back</button>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <CustomFeatureDialog
          initial={editing === 'new' ? undefined : editing}
          onSave={(feature) => saveCustom(feature)}
          onDelete={editing === 'new' ? undefined : () => deleteCustom(editing)}
          onClose={() => setEditing(null)}
        />
      )}
      {borrowing && <BorrowFeatureDialog live={live} onClose={() => setBorrowing(false)} />}
      {choosing && (
        <Dialog title="Racial choices" onClose={() => setChoosing(false)}>
          <p className="page-ref">Changes are saved as you tick. You may swap one each time you level up; the sheet does not stop you swapping more.</p>
          <RaceChoiceFields
            choices={sheet.raceChoices}
            picked={doc.choices}
            withText
            onChange={(id, next) => {
              const choice = sheet.raceChoices.find((c) => c.id === id)!;
              const name = (optionId: string) => choice.options.find((o) => o.id === optionId)?.name ?? optionId;
              const added = next.filter((x) => !choice.picked.includes(x)).map(name);
              const dropped = choice.picked.filter((x) => !next.includes(x)).map(name);
              live.setDoc({ ...doc, choices: { ...doc.choices, [id]: next } }, `${choice.name}: ${[...added.map((n) => `added ${n}`), ...dropped.map((n) => `dropped ${n}`)].join(', ')}`);
            }}
          />
          <button className="btn btn-primary" onClick={() => setChoosing(false)}>Done</button>
        </Dialog>
      )}
    </section>
  );
}
