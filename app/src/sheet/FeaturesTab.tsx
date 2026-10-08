import { cite, type CustomFeature } from '@dndf/engine';
import { useState } from 'react';
import { RuleText } from '../components/RuleText';
import type { LiveCharacter } from '../lib/useCharacter';
import { BorrowFeatureDialog, CustomFeatureDialog } from './CustomFeatures';

/** "Warrior 5 · EH10 p.201", or just where a player's own feature comes from. */
export const featureRef = (feature: { book: string; from: string; page: number }) => (feature.book === 'Custom' ? `${feature.from} · your own` : `${feature.from} · ${cite(feature.book, feature.page)}`);

export function FeaturesTab({ live }: { live: LiveCharacter }) {
  const { doc, sheet } = live;
  const [editing, setEditing] = useState<CustomFeature | 'new' | null>(null);
  const [borrowing, setBorrowing] = useState(false);
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
  const unborrow = (key: string, name: string) =>
    live.setDoc({ ...doc, borrowedFeatures: (doc.borrowedFeatures ?? []).filter((b) => !(key.startsWith(`${b.entry}/`) && b.name === name)) }, `Gave back ${name}`);
  return (
    <section className="card">
      <h2>Features</h2>
      {sheet.warnings.map((warning) => (
        <p key={warning} className="notice">{warning}</p>
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
          </details>
        );
      })}
      {editing && (
        <CustomFeatureDialog
          initial={editing === 'new' ? undefined : editing}
          onSave={saveCustom}
          onDelete={editing === 'new' ? undefined : () => deleteCustom(editing)}
          onClose={() => setEditing(null)}
        />
      )}
      {borrowing && <BorrowFeatureDialog live={live} onClose={() => setBorrowing(false)} />}
    </section>
  );
}
