/** Filled pips for uses left, hollow for spent. Past 12 it switches to a count. */
export function Pips({ remaining, max, label }: { remaining: number; max: number; label: string }) {
  if (max > 12) {
    return (
      <span className="num" aria-label={`${label}: ${remaining} of ${max}`}>
        {remaining} / {max}
      </span>
    );
  }
  return (
    <span className="pips" role="img" aria-label={`${label}: ${remaining} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < remaining ? 'pip pip-full' : 'pip'} />
      ))}
    </span>
  );
}
