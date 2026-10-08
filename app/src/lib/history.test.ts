import { describe, expect, it } from 'vitest';
import { LOCAL_HISTORY_CAP, ago, canUndo, pushHistory, type HistoryEntry } from './history';

const entry = (n: number): HistoryEntry => ({ id: String(n), summary: `change ${n}`, at: new Date(2026, 0, 1, 12, n).toISOString() });

describe('history', () => {
  it('puts the newest line on top and keeps at most the cap', () => {
    let list: HistoryEntry[] = [];
    for (let n = 1; n <= LOCAL_HISTORY_CAP + 5; n++) list = pushHistory(list, entry(n));
    expect(list).toHaveLength(LOCAL_HISTORY_CAP);
    expect(list[0]!.summary).toBe(`change ${LOCAL_HISTORY_CAP + 5}`);
    expect(list.at(-1)!.summary).toBe('change 6');
  });

  it('says when a change was made in plain words', () => {
    const now = new Date('2026-03-10T12:00:00Z').getTime();
    expect(ago('2026-03-10T11:59:40Z', now)).toBe('just now');
    expect(ago('2026-03-10T11:55:00Z', now)).toBe('5 min ago');
    expect(ago('2026-03-10T09:00:00Z', now)).toBe('3 h ago');
    expect(ago('2026-03-01T09:00:00Z', now)).toMatch(/2026/);
  });

  it('a line can be undone only when it carries the character from before', () => {
    expect(canUndo(entry(1))).toBe(false);
    expect(canUndo({ ...entry(1), before: { schema: 1 } as never })).toBe(true);
  });
});

describe('keeping copies for undo', () => {
  it('small changes within twenty seconds of the last copy share it; later ones keep their own', async () => {
    const { SNAPSHOT_GAP_MS, shouldSnapshot } = await import('./history');
    expect(SNAPSHOT_GAP_MS).toBe(20_000);
    expect(shouldSnapshot(0, 1_700_000_000_000)).toBe(true); // the first change of a session
    expect(shouldSnapshot(1_000_000, 1_000_000 + 5_000)).toBe(false);
    expect(shouldSnapshot(1_000_000, 1_000_000 + 19_999)).toBe(false);
    expect(shouldSnapshot(1_000_000, 1_000_000 + 20_000)).toBe(true);
  });
});

describe('change logs older than 90 days', () => {
  it('are left out; newer ones stay', async () => {
    const { HISTORY_DAYS, withinHistory } = await import('./history');
    const now = new Date('2026-10-08T12:00:00Z').getTime();
    const at = (daysAgo: number) => ({ id: 'x', summary: 's', at: new Date(now - daysAgo * 86_400_000).toISOString() });
    expect(HISTORY_DAYS).toBe(90);
    expect([0, 1, 89, 90].map((d) => withinHistory(at(d), now))).toEqual([true, true, true, true]);
    expect([90.01, 91, 400].map((d) => withinHistory(at(d), now))).toEqual([false, false, false]);
  });
});
