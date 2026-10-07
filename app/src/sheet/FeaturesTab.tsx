import { cite } from '@dndf/engine';
import { RuleText } from '../components/RuleText';
import type { LiveCharacter } from '../lib/useCharacter';

export function FeaturesTab({ live }: { live: LiveCharacter }) {
  const { sheet } = live;
  return (
    <section className="card">
      <h2>Features</h2>
      {sheet.warnings.map((warning) => (
        <p key={warning} className="notice">{warning}</p>
      ))}
      {sheet.features.map((feature) => (
        <details key={feature.key} className="feature">
          <summary>
            <span className="resource-name">{feature.name}</span>
            <span className="page-ref">{feature.from} · {cite(feature.book, feature.page)}</span>
          </summary>
          <RuleText text={feature.text} sections={feature.sections} tables={feature.tables} book={feature.book} />
          <p className="page-ref">{feature.book} ({cite(feature.book, feature.page)})</p>
        </details>
      ))}
    </section>
  );
}
