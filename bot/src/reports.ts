// Reports to the developer (a bug, an idea, something needed), as they appear in the Discord channel kept
// for them. Plain functions: what a report looks like, what its button does. The sending and saving is in index.ts.

export type ReportKind = 'bug' | 'idea' | 'other';

export interface Report {
  id: string;
  createdAt: string;
  reporter: string;
  kind: ReportKind;
  message: string;
  page: string;
  appVersion: string;
  device: string;
  source: 'site' | 'discord';
  /** Whether it was sent from an account (false: signed out, or a Discord user the site does not know). */
  signedIn: boolean;
  status: 'new' | 'posted' | 'done';
  doneAt: string | null;
  doneBy: string | null;
}

export const KIND_LABEL: Record<ReportKind, string> = { bug: '🐞 Bug', idea: '💡 Idea', other: '📝 Something else' };
const OPEN_COLOR = 0xb5451b; // the site's rust
const DONE_COLOR = 0x4f7f6b; // and its sea green

const DONE = 'report-done:';
const REOPEN = 'report-open:';

/** What a press of a report's button asks for, or null for any other button. */
export function reportButton(customId: string): { id: string; done: boolean } | null {
  if (customId.startsWith(DONE)) return { id: customId.slice(DONE.length), done: true };
  if (customId.startsWith(REOPEN)) return { id: customId.slice(REOPEN.length), done: false };
  return null;
}

const day = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * The channel message for a report, as Discord's own JSON: the words, who sent them and from where,
 * and one button, "Mark completed", which becomes "Reopen" once it is done.
 * Nothing in it can ping anyone: it is an embed, and mentions are switched off.
 */
export function reportMessage(report: Report) {
  const done = report.status === 'done';
  const from = report.source === 'discord' ? 'Discord, with /report' : report.signedIn ? 'the website' : 'the website, signed out';
  const fields = [{ name: 'From', value: `${clip(report.reporter.trim() || 'Someone who gave no name', 60)} · ${from}`, inline: false }];
  if (report.page) fields.push({ name: 'Page', value: clip(report.page, 200), inline: true });
  if (report.appVersion) fields.push({ name: 'Site version', value: clip(report.appVersion, 40), inline: true });
  if (report.device) fields.push({ name: 'Device', value: clip(report.device, 300), inline: false });
  if (done) fields.push({ name: 'Completed', value: `${clip(report.doneBy ?? 'someone', 60)} · ${day(report.doneAt ?? report.createdAt)}`, inline: false });
  return {
    embeds: [{
      title: `${done ? '✅ Completed · ' : ''}${KIND_LABEL[report.kind]}`,
      description: clip(report.message.trim(), 4000),
      color: done ? DONE_COLOR : OPEN_COLOR,
      fields,
      footer: { text: `Report ${report.id.slice(0, 8)}` },
      timestamp: report.createdAt,
    }],
    components: [{
      type: 1,
      components: [done
        ? { type: 2, style: 2, label: 'Reopen', custom_id: `${REOPEN}${report.id}` }
        : { type: 2, style: 3, label: 'Mark completed', custom_id: `${DONE}${report.id}` }],
    }],
    // (discord.js's own name for it; an embed pings nobody in any case.)
    allowedMentions: { parse: [] as never[] },
  };
}

/** "3 open: 2 bugs, 1 idea" for the list command. */
export function openSummary(reports: Pick<Report, 'kind'>[]): string {
  if (reports.length === 0) return 'No open reports. Everything sent so far is marked completed.';
  const count = (kind: ReportKind, one: string, many: string) => {
    const n = reports.filter((r) => r.kind === kind).length;
    return n ? `${n} ${n === 1 ? one : many}` : '';
  };
  return `${reports.length} open: ${[count('bug', 'bug', 'bugs'), count('idea', 'idea', 'ideas'), count('other', 'other', 'others')].filter(Boolean).join(', ')}`;
}
