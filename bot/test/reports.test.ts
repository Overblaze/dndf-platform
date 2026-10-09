import { describe, expect, it } from 'vitest';
import { openSummary, reportButton, reportMessage, type Report } from '../src/reports';
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
