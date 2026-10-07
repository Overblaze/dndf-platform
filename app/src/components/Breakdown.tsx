import type { Derived } from '@dndf/engine';

/** The "how this number was worked out" box: line items, then a bold total. */
export function Breakdown({ label, result, format = String }: { label: string; result: Derived; format?: (n: number) => string }) {
  return (
    <div className="breakdown">
      <div className="breakdown-head">
        <span className="label">{label}</span>
        {result.page !== undefined && <span className="page-ref">p.{result.page}</span>}
      </div>
      <ul>
        {result.lines.map((line, i) => (
          <li key={i}>
            <span>{line.label}</span>
            <span className="num">{line.value}</span>
          </li>
        ))}
        <li className="breakdown-total">
          <span>Total</span>
          <span className="num">{format(result.value)}</span>
        </li>
      </ul>
    </div>
  );
}
