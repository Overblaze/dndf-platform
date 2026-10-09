import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: null }));
vi.mock('./image', () => ({ shrinkImage: async () => ({ blob: new Blob(), width: 1, height: 1 }) }));
const { keepBackground, keptBackground } = await import('./appBackground');

const store = () => {
  const kept = new Map<string, string>();
  return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k), kept };
};

describe('the table’s picture, remembered on the device', () => {
  it('keeps the address for next time and for when there is no connection', () => {
    const storage = store();
    expect(keptBackground(storage)).toBeNull();
    keepBackground('https://proj.supabase.co/storage/v1/object/public/app-background/abc.jpg', storage);
    expect(keptBackground(storage)).toBe('https://proj.supabase.co/storage/v1/object/public/app-background/abc.jpg');
    keepBackground(null, storage);
    expect(keptBackground(storage)).toBeNull();
  });

  it('only ever hands back a plain https address', () => {
    for (const bad of ['javascript:alert(1)', 'http://plain.example/a.jpg', 'https://x.example/a.jpg") , url("https://evil.example/', 'https://x.example/a b.jpg', '']) {
      expect(keptBackground({ getItem: () => bad }), bad).toBeNull();
    }
    expect(keptBackground({ getItem: () => { throw new Error('storage is off'); } })).toBeNull();
  });
});
