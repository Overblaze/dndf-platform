import { rollD20, rollDice, type D20Result, type DiceResult, type RollMode } from '@dndf/engine';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { rng } from './rules';

export interface RollEntry {
  id: number;
  title: string;
  /** "14 + 7" */
  detail: string;
  total: number;
  flag?: 'crit' | 'fumble';
  /** d20 rolls can take a Dream Point's 1d6 afterwards. */
  d20: boolean;
  /** Damage to offer after an attack roll. */
  followUp?: { title: string; dice: string; type: string };
}

interface Rolls {
  entries: RollEntry[];
  mode: RollMode;
  setMode: (mode: RollMode) => void;
  d20: (title: string, bonus: number, followUp?: RollEntry['followUp']) => D20Result;
  dice: (title: string, dice: string, options?: { crit?: boolean }) => DiceResult;
  addTo: (id: number, label: string, amount: number) => void;
  clear: () => void;
}

const RollsContext = createContext<Rolls | null>(null);
let nextId = 1;
const KEEP = 20;

const signedPart = (n: number) => (n === 0 ? '' : n > 0 ? ` + ${n}` : ` − ${-n}`);

export function RollsProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<RollEntry[]>([]);
  const [mode, setMode] = useState<RollMode>('normal');
  const push = useCallback((entry: Omit<RollEntry, 'id'>) => setEntries((all) => [{ ...entry, id: nextId++ }, ...all].slice(0, KEEP)), []);

  const value = useMemo<Rolls>(
    () => ({
      entries,
      mode,
      setMode,
      d20(title, bonus, followUp) {
        const result = rollD20(bonus, rng, mode);
        const shown = result.dice.length > 1 ? `${result.die} (${result.dice.join(', ')}; ${mode})` : `${result.die}`;
        push({
          title,
          detail: `${shown}${signedPart(bonus)}`,
          total: result.total,
          flag: result.natural20 ? 'crit' : result.natural1 ? 'fumble' : undefined,
          d20: true,
          followUp,
        });
        setMode('normal');
        return result;
      },
      dice(title, dice, options) {
        // A critical hit rolls every damage die twice.
        const result = rollDice(options?.crit ? dice.replace(/(\d+)d(\d+)/g, (_, n: string, sides: string) => `${Number(n) * 2}d${sides}`) : dice, rng);
        const faces = result.rolls.map((r) => r.value).join(' + ');
        push({ title: options?.crit ? `${title} (critical)` : title, detail: `${faces || '0'}${signedPart(result.bonus)}`, total: result.total, d20: false });
        return result;
      },
      addTo(id, label, amount) {
        setEntries((all) => all.map((e) => (e.id === id ? { ...e, detail: `${e.detail} + ${amount} (${label})`, total: e.total + amount, d20: false } : e)));
      },
      clear: () => setEntries([]),
    }),
    [entries, mode, push],
  );
  return <RollsContext.Provider value={value}>{children}</RollsContext.Provider>;
}

export function useRolls(): Rolls {
  const value = useContext(RollsContext);
  if (!value) throw new Error('useRolls must be used inside <RollsProvider>');
  return value;
}
