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
            <span className="page-ref">{feature.from} · p.{feature.page}</span>
          </summary>
          <RuleText text={feature.text} sections={feature.sections} tables={feature.tables} />
          <p className="page-ref">{feature.book}, p.{feature.page}</p>
        </details>
      ))}
    </section>
  );
}
