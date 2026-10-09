import { useEffect, useRef, useState } from 'react';

/** What was typed into a count: a new total ("500"), or a change to make to it ("-1500", "+200"). Null when it is neither. */
export function readQuantity(typed: string, current: number, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  const text = typed.replace(/[\s,]/g, '').replace('−', '-');
  const change = /^([+-])(\d+)$/.exec(text);
  const total = /^\d+$/.exec(text);
  if (!change && !total) return null;
  const next = change ? current + (change[1] === '-' ? -1 : 1) * Number(change[2]) : Number(text);
  return Math.max(min, Math.min(max, next));
}

/**
 * A count that can be typed as well as stepped: type the new total, or a change with a sign in front
 * ("-1500" spends 1,500; "+200" adds 200). It is applied on Enter or when the box is left.
 */
export function QuantityInput({ value, label, min = 0, max, onCommit }: { value: number; label: string; min?: number; max?: number; onCommit: (next: number) => void }) {
  const [typed, setTyped] = useState(String(value));
  const [focused, setFocused] = useState(false);
  // Follows the real count whenever the player is not in the middle of typing.
  useEffect(() => { if (!focused) setTyped(String(value)); }, [value, focused]);
  // Escape leaves the box without applying what was typed.
  const cancelled = useRef(false);
  const commit = () => {
    if (cancelled.current) { cancelled.current = false; setTyped(String(value)); return; }
    const next = readQuantity(typed, value, min, max);
    if (next !== null && next !== value) onCommit(next);
    setTyped(String(next ?? value));
  };
  return (
    <input
      className="quantity num"
      type="text"
      inputMode="text"
      autoComplete="off"
      enterKeyHint="done"
      aria-label={`${label}: type a new count, or a change like -1500 or +200`}
      title="Type a new count, or a change like -1500 or +200"
      // Wide enough for what is in it: a count can run to millions of berries' worth of rations.
      style={{ width: `${Math.max(3, typed.length) + 1.8}ch` }}
      value={typed}
      onChange={(e) => setTyped(e.target.value)}
      onFocus={(e) => { setFocused(true); e.target.select(); }}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') { e.stopPropagation(); cancelled.current = true; (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}
