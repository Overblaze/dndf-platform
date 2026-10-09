// The version-switch report: what would change if this character were on the other handbook.
// The character itself is never changed here; the player can make a copy on the other handbook.
import { otherVersion, switchVersion, type CharacterDoc, type VersionSwitch } from '@dndf/engine';
import { useMemo, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { ruleSet, VERSION_NAMES } from '../lib/rules';

function List({ title, items, note }: { title: string; items: string[]; note?: string }) {
  if (items.length === 0) return null;
  return (
    <details className="rule-text" open={items.length <= 12}>
      <summary>{title} ({items.length})</summary>
      {note && <p className="page-ref">{note}</p>}
      <ul className="notes">{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </details>
  );
}

export function VersionSwitchDialog({ doc, hasFruit, onCopy, onClose }: { doc: CharacterDoc; hasFruit: boolean; onCopy: (copy: CharacterDoc) => Promise<void>; onClose: () => void }) {
  const to = otherVersion(doc.rulesVersion);
  const report: VersionSwitch = useMemo(() => switchVersion(doc, ruleSet(doc.rulesVersion).rules, ruleSet(to).rules, to), [doc, to]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const here = VERSION_NAMES[doc.rulesVersion];
  const there = VERSION_NAMES[to];
  const copy = () => {
    setBusy(true);
    onCopy({ ...report.doc, name: `${doc.name} (${there.replace('Rules ', '')})`.slice(0, 80) }).catch((e: Error) => { setProblem(e.message); setBusy(false); });
  };
  return (
    <Dialog title={`${doc.name} on ${there}`} onClose={onClose}>
      <p>
        {doc.name} was built with {here} and stays on it. This is what would be different on {there}.
        {report.same ? ' Nothing: both handbooks treat this character the same.' : ''}
      </p>

      {report.renamed.length > 0 && (
        <>
          <h3>Called something else in {there}</h3>
          <ul className="notes">{report.renamed.map((r) => <li key={`${r.what}/${r.from}`}>{r.what}: {r.from} → <strong>{r.to}</strong></li>)}</ul>
        </>
      )}
      {report.missing.length > 0 && (
        <>
          <h3>Not in {there}</h3>
          <ul className="notes">{report.missing.map((m) => <li key={`${m.what}/${m.name}`}>{m.what}: <strong>{m.name}</strong></li>)}</ul>
          <p className="page-ref">These would be left off a copy. You can pick replacements there with Edit, or add them back as your own features.</p>
        </>
      )}
      {report.numbers.length > 0 && (
        <>
          <h3>Numbers that change</h3>
          <table className="print-table switch-table">
            <thead><tr><th>What</th><th>{here}</th><th>{there}</th></tr></thead>
            <tbody>{report.numbers.map((n) => <tr key={n.label}><td>{n.label}</td><td>{n.before}</td><td><strong>{n.after}</strong></td></tr>)}</tbody>
          </table>
        </>
      )}
      {(report.gained.length > 0 || report.lost.length > 0 || report.reworded.length > 0) && <h3>Features</h3>}
      <List title={`Only in ${there}`} items={report.gained} />
      <List title={`Only in ${here}`} items={report.lost} />
      <List title="In both, with different words" items={report.reworded} note="Read each in the Library of both handbooks: the rule may work differently." />
      {report.unresolved.length > 0 && <List title="Needs a look" items={report.unresolved} />}

      {hasFruit && <p className="notice">A Devil Fruit is granted to a character, not to a copy of it. A copy starts without the fruit; your DM can grant it to the copy.</p>}
      {problem && <p className="notice" role="alert">{problem}</p>}
      <div className="row wrap">
        <button className="btn btn-primary" disabled={busy} onClick={copy}>{busy ? 'Copying…' : `Make a copy on ${there}`}</button>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
      <p className="page-ref">A copy is a new character: {doc.name} is not changed, and its history stays with it. Nothing is hidden or rounded off here: every difference the two handbooks’ sheets show is listed.</p>
    </Dialog>
  );
}
