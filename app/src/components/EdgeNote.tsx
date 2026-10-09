import { describeEdge, type RollEdge } from '@dndf/engine';

/** Says that a roll is made with advantage or disadvantage, and why. `short` is the three-letter mark for a crowded row. */
export function EdgeNote({ edge, short }: { edge: RollEdge; short?: boolean }) {
  const why = describeEdge(edge);
  const mark = edge.mode === 'advantage' ? 'ADV' : edge.mode === 'disadvantage' ? 'DIS' : '=';
  if (short) return <abbr className={`edge edge-${edge.mode}`} title={why} aria-label={why}>{mark}</abbr>;
  return <span className={`page-ref edge-line edge-${edge.mode}`}>{why.charAt(0).toUpperCase() + why.slice(1)}.</span>;
}
