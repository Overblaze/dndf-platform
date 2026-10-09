import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: null }));
const { buildOf, deviceLine, draftProblem, fileProblem, keepDraft, megabytes, readDraft, REPORT_KINDS, REPORT_MAX, sendReport } = await import('./reports');

const store = () => {
  const kept = new Map<string, string>();
  return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k), kept };
};

describe('reports to the developer, on the site', () => {
  it('names the build from the page’s own script', () => {
    expect(buildOf(['https://overblaze.github.io/dndf-platform/assets/index-DOgJ3rQi.js'])).toBe('index-DOgJ3rQi');
    expect(buildOf(['https://example.com/other.js', '/dndf-platform/assets/index-a_b-9.js'])).toBe('index-a_b-9');
    expect(buildOf(['/src/main.tsx'])).toBe('development');
  });

  it('describes the device in a line, with nothing that identifies a person', () => {
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
    expect(deviceLine(android, 412, 915, true)).toBe('Android · Chrome · 412×915 · installed app');
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    expect(deviceLine(iphone, 390, 844, false)).toBe('iOS · Safari · 390×844');
    expect(deviceLine('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0', 1920, 1080, false)).toBe('Windows · Firefox · 1920×1080');
    expect(deviceLine('', 0, 0, false)).toBe('Unknown system · Unknown browser · 0×0');
  });

  it('wants a few words and no more than the database takes', () => {
    const draft = { kind: 'bug' as const, reporter: '', message: '' };
    expect(draftProblem(draft)).toBe('Write a few words first.');
    expect(draftProblem({ ...draft, message: '   hi   ' })).toBe('Write a few words first.');
    expect(draftProblem({ ...draft, message: 'The swim speed is missing.' })).toBeNull();
    expect(draftProblem({ ...draft, message: 'x'.repeat(REPORT_MAX) })).toBeNull();
    expect(draftProblem({ ...draft, message: 'x'.repeat(REPORT_MAX + 7) })).toBe(`That is 7 characters too long; ${REPORT_MAX} is the most.`);
  });

  it('keeps what was being written, and forgets it once sent', () => {
    const storage = store();
    expect(readDraft(storage)).toEqual({});
    keepDraft({ kind: 'idea', message: 'A dark theme', reporter: 'Ana' }, storage);
    expect(readDraft(storage)).toEqual({ kind: 'idea', message: 'A dark theme', reporter: 'Ana' });
    keepDraft(null, storage);
    expect(storage.kept.size).toBe(0);
    // Nothing written is nothing kept; and a damaged or foreign value is read as nothing.
    keepDraft({ kind: 'bug', message: '  ', reporter: '' }, storage);
    expect(storage.kept.size).toBe(0);
    expect(readDraft({ getItem: () => '{not json' })).toEqual({});
    expect(readDraft({ getItem: () => JSON.stringify({ kind: 'rant', message: 42 }) })).toEqual({ kind: undefined, message: undefined, reporter: undefined });
  });

  it('takes a PDF or a text file up to 50 MB, and says why not otherwise', () => {
    expect(fileProblem({ name: 'Book One.pdf', size: 4_000_000 })).toBeNull();
    expect(fileProblem({ name: 'house rules.TXT', size: 12 })).toBeNull();
    expect(fileProblem({ name: 'class.md', size: 12 })).toBeNull();
    expect(fileProblem({ name: 'map.png', size: 12 })).toBe('Only PDF and text files (.pdf, .txt, .md) can be sent.');
    expect(fileProblem({ name: 'book.pdf.exe', size: 12 })).toMatch(/Only PDF and text/);
    expect(fileProblem({ name: 'empty.pdf', size: 0 })).toBe('That file is empty.');
    expect(fileProblem({ name: 'huge.pdf', size: 51 * 1024 * 1024 })).toBe('That file is 51.0 MB; 50 MB is the most.');
    expect(megabytes(1536)).toBe('2 KB');
    expect(REPORT_KINDS.map((k) => k.id)).toEqual(['bug', 'idea', 'source', 'other']);
  });

  it('says so plainly on a copy of the site with no database', async () => {
    expect(await sendReport({ kind: 'bug', message: 'Hello there', reporter: '' }, '#/sheet')).toMatch(/not connected/);
  });
});
