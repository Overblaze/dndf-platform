import { describe, expect, it } from 'vitest';
import { REFUSED, attachLimit, fileKind, fileLine, fileProblem, inboxName, looksLike, megabytes, openSummary, reportButton, reportMessage, safeFileName, type Report } from '../src/reports';
import { COMMANDS as commands } from '../src/slash';

const report: Report = {
  id: '0b6f7c1e-1111-4222-8333-444455556666', createdAt: '2026-10-09T14:30:00.000Z', reporter: 'Ana', kind: 'bug',
  message: 'Propeller Body shows no swim speed.', page: '#/sheet/abc', appVersion: 'a1b2c3d', device: 'Android phone, Chrome',
  source: 'site', signedIn: true, status: 'posted', doneAt: null, doneBy: null,
};

describe('reports in the Discord channel', () => {
  it('shows the words, who sent them and from where, with one button to mark it completed', () => {
    const message = reportMessage(report);
    const embed = message.embeds[0]!;
    expect(embed.title).toBe('🐞 Bug');
    expect(embed.description).toBe('Propeller Body shows no swim speed.');
    expect(embed.fields).toEqual([
      { name: 'From', value: 'Ana · the website', inline: false },
      { name: 'Page', value: '#/sheet/abc', inline: true },
      { name: 'Site version', value: 'a1b2c3d', inline: true },
      { name: 'Device', value: 'Android phone, Chrome', inline: false },
    ]);
    expect(embed.footer.text).toBe('Report 0b6f7c1e');
    expect(message.components).toEqual([{ type: 1, components: [{ type: 2, style: 3, label: 'Mark completed', custom_id: 'report-done:0b6f7c1e-1111-4222-8333-444455556666' }] }]);
  });

  it('once completed says who and when, and the button reopens it', () => {
    const done = reportMessage({ ...report, status: 'done', doneAt: '2026-10-11T09:00:00.000Z', doneBy: 'Matt' });
    expect(done.embeds[0]!.title).toBe('✅ Completed · 🐞 Bug');
    expect(done.embeds[0]!.fields.at(-1)).toEqual({ name: 'Completed', value: 'Matt · 2026-10-11', inline: false });
    expect(done.embeds[0]!.color).not.toBe(reportMessage(report).embeds[0]!.color);
    expect(done.components[0]!.components[0]).toEqual({ type: 2, style: 2, label: 'Reopen', custom_id: 'report-open:0b6f7c1e-1111-4222-8333-444455556666' });
  });

  it('says how it came in: signed out, or from Discord, and copes with no name', () => {
    expect(reportMessage({ ...report, signedIn: false, reporter: '' }).embeds[0]!.fields[0]!.value).toBe('Someone who gave no name · the website, signed out');
    const discord = reportMessage({ ...report, source: 'discord', page: '', appVersion: '', device: '', kind: 'idea' });
    expect(discord.embeds[0]!.title).toBe('💡 Idea');
    expect(discord.embeds[0]!.fields).toEqual([{ name: 'From', value: 'Ana · Discord, with /report', inline: false }]);
  });

  it('cannot ping anyone or outgrow what Discord allows', () => {
    const loud = reportMessage({ ...report, message: `@everyone ${'x'.repeat(5000)}`, reporter: 'r'.repeat(200), page: 'p'.repeat(500), device: 'd'.repeat(900) });
    expect(loud.allowedMentions).toEqual({ parse: [] });
    expect(loud.embeds[0]!.description.length).toBeLessThanOrEqual(4096);
    for (const field of loud.embeds[0]!.fields) expect(field.value.length).toBeLessThanOrEqual(1024);
    expect(JSON.stringify(loud.embeds).length).toBeLessThan(6000);
    expect(loud.components[0]!.components[0]!.custom_id.length).toBeLessThanOrEqual(100);
  });

  it('reads its own buttons and leaves any other alone', () => {
    expect(reportButton('report-done:abc')).toEqual({ id: 'abc', done: true });
    expect(reportButton('report-open:abc')).toEqual({ id: 'abc', done: false });
    expect(reportButton('something-else')).toBeNull();
    const pressed = reportButton(reportMessage(report).components[0]!.components[0]!.custom_id);
    expect(pressed).toEqual({ id: report.id, done: true });
  });

  it('sums up what is open', () => {
    expect(openSummary([])).toMatch(/^No open reports/);
    expect(openSummary([{ kind: 'bug' }, { kind: 'bug' }, { kind: 'idea' }])).toBe('3 open: 2 bugs, 1 idea');
    expect(openSummary([{ kind: 'other' }])).toBe('1 open: 1 other');
  });

  it('/report has a send that asks for the words and a list for whoever looks after them', () => {
    const command = commands.find((c) => c.name === 'report')!;
    expect(command.options!.map((o) => o.name)).toEqual(['send', 'open']);
    const send = command.options![0] as { options: { name: string; required?: boolean; max_length?: number }[] };
    expect(send.options[0]).toMatchObject({ name: 'message', required: true, max_length: 2000 });
  });
});


describe('files sent with a report', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

  it('takes PDFs and text files up to 50 MB, and says why not otherwise', () => {
    expect(fileProblem('Book One.pdf', 3_000_000)).toBeNull();
    expect(fileProblem('notes.TXT', 10)).toBeNull();
    expect(fileProblem('rules.md', 10)).toBeNull();
    expect(fileProblem('map.png', 10)).toBe('Only PDF and text files (.pdf, .txt, .md) are taken.');
    expect(fileProblem('book.pdf.exe', 10)).toMatch(/Only PDF and text/);
    expect(fileProblem('noextension', 10)).toMatch(/Only PDF and text/);
    expect(fileProblem('empty.pdf', 0)).toBe('That file is empty.');
    expect(fileProblem('huge.pdf', 60 * 1024 * 1024)).toBe('That file is 60.0 MB; 50 MB is the most.');
    expect(fileKind('A.PDF')).toBe('pdf');
  });

  it('checks the file is what its name says', () => {
    expect(looksLike('book.pdf', pdf)).toBe(true);
    expect(looksLike('book.pdf', new TextEncoder().encode('MZ this is a program'))).toBe(false);
    expect(looksLike('notes.txt', new TextEncoder().encode('Plain words, and ünïcödé.'))).toBe(true);
    expect(looksLike('notes.txt', new Uint8Array([0x4d, 0x5a, 0x00, 0x03]))).toBe(false); // a program renamed .txt
    expect(looksLike('book.pdf', new Uint8Array([]))).toBe(false);
    expect(looksLike('picture.png', pdf)).toBe(false);
  });

  it('gives its own copy a safe name that sorts by day', () => {
    expect(safeFileName('Book One (v2).pdf')).toBe('Book-One-(v2).pdf');
    expect(safeFileName('../../etc/passwd.txt')).toBe('passwd.txt');
    expect(safeFileName('C:\\\\Users\\\\me\\\\..\\\\secret.md')).toBe('secret.md');
    expect(safeFileName('.hidden.pdf')).toBe('hidden.pdf');
    expect(safeFileName('💀💀.pdf')).toBe('file.pdf');
    expect(safeFileName(`${'long'.repeat(60)}.pdf`).length).toBeLessThanOrEqual(74);
    expect(safeFileName('no-extension')).toBe('no-extension.txt');
    expect(inboxName('0b6f7c1e-1111-4222-8333-444455556666', 'Book One.pdf', '2026-10-09')).toBe('2026-10-09-0b6f7c1e-Book-One.pdf');
    expect(inboxName('0b6f7c1e-1111-4222-8333-444455556666', '../x/../y.pdf', '2026-10-09')).not.toMatch(/[/\\\\]/);
  });

  it('attaches what the server allows: 10 MB, or 50 and 100 at boost levels 2 and 3', () => {
    expect([attachLimit(0), attachLimit(1), attachLimit(2), attachLimit(3)].map((n) => n / 1024 / 1024)).toEqual([10, 10, 50, 100]);
    expect([megabytes(900), megabytes(2048), megabytes(5 * 1024 * 1024)]).toEqual(['1 KB', '2 KB', '5.0 MB']);
  });

  it('says under the report what became of the file', () => {
    const base = { fileName: 'Book One.pdf', fileSize: 3 * 1024 * 1024, filePath: null as string | null, fileSaved: '2026-10-09-0b6f7c1e-Book-One.pdf' };
    expect(fileLine(base, true)).toBe('Book One.pdf · 3.0 MB · attached here · kept on the bot’s machine as 2026-10-09-0b6f7c1e-Book-One.pdf');
    expect(fileLine(base, false)).toBe('Book One.pdf · 3.0 MB · too large to attach here · kept on the bot’s machine as 2026-10-09-0b6f7c1e-Book-One.pdf');
    expect(fileLine({ ...base, fileSaved: `${REFUSED}it is not the kind of file its name says` }, false)).toBe('Book One.pdf · 3.0 MB · not kept: it is not the kind of file its name says');
    expect(fileLine({ ...base, fileSaved: null, filePath: 'u/x.pdf' }, false)).toMatch(/waiting to be fetched$/);
    const message = reportMessage({ ...report, kind: 'source', ...base }, { attached: true });
    expect(message.embeds[0]!.title).toBe('📚 Source material');
    expect(message.embeds[0]!.fields.find((f) => f.name === 'File')!.value).toMatch(/attached here/);
    // A report without a file has no File line.
    expect(reportMessage(report).embeds[0]!.fields.some((f) => f.name === 'File')).toBe(false);
  });

  it('/report send takes a file', () => {
    const send = (commands.find((c) => c.name === 'report')!.options![0] as { options: { name: string; type: number }[] }).options;
    expect(send.map((o) => o.name)).toEqual(['message', 'kind', 'file']);
    expect(send[2]!.type).toBe(11); // an attachment
  });
});
