// Reports to the developer (a bug, an idea, something needed), as they appear in the Discord channel kept
// for them. Plain functions: what a report looks like, what its button does. The sending and saving is in index.ts.

export type ReportKind = 'bug' | 'idea' | 'other' | 'source';

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
  /** A file sent with it: its name and size as sent, where it still waits in storage, and what the bot did with it. */
  fileName?: string | null;
  fileSize?: number | null;
  filePath?: string | null;
  /** The name of the bot's own copy in its inbox folder, or "refused: …" when the file was not kept. */
  fileSaved?: string | null;
}

export const KIND_LABEL: Record<ReportKind, string> = { bug: '🐞 Bug', idea: '💡 Idea', other: '📝 Something else', source: '📚 Source material' };
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
export function reportMessage(report: Report, options: { attached?: boolean } = {}) {
  const done = report.status === 'done';
  const from = report.source === 'discord' ? 'Discord, with /report' : report.signedIn ? 'the website' : 'the website, signed out';
  const fields = [{ name: 'From', value: `${clip(report.reporter.trim() || 'Someone who gave no name', 60)} · ${from}`, inline: false }];
  if (report.page) fields.push({ name: 'Page', value: clip(report.page, 200), inline: true });
  if (report.appVersion) fields.push({ name: 'Site version', value: clip(report.appVersion, 40), inline: true });
  if (report.device) fields.push({ name: 'Device', value: clip(report.device, 300), inline: false });
  if (report.fileName) fields.push({ name: 'File', value: clip(fileLine(report, options.attached ?? false), 400), inline: false });
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
  return `${reports.length} open: ${[count('bug', 'bug', 'bugs'), count('idea', 'idea', 'ideas'), count('source', 'source file', 'source files'), count('other', 'other', 'others')].filter(Boolean).join(', ')}`;
}

// Files sent with a report: a PDF or a text file of source material.

export const FILE_TYPES: Record<string, string> = { pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown' };
export const FILE_MAX_BYTES = 50 * 1024 * 1024;
export const REFUSED = 'refused: ';

export const megabytes = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** The kind of file a name says it is, or null for one that is not taken. */
export function fileKind(name: string): keyof typeof FILE_TYPES | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? '';
  return ext in FILE_TYPES ? ext : null;
}

/** Why a file is not taken, or null when it is: a PDF or text file, not empty, 50 MB at most. */
export function fileProblem(name: string, size: number): string | null {
  if (!fileKind(name)) return 'Only PDF and text files (.pdf, .txt, .md) are taken.';
  if (size <= 0) return 'That file is empty.';
  if (size > FILE_MAX_BYTES) return `That file is ${megabytes(size)}; 50 MB is the most.`;
  return null;
}

/** A name that is safe to give a file on disk: no folders, no odd characters, its extension kept. */
export function safeFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  const ext = fileKind(base) ?? 'txt';
  const stem = base.replace(/\.[a-z0-9]+$/i, '').normalize('NFKD').replace(/[^\w .()-]+/g, '').replace(/\s+/g, '-').replace(/^[.-]+/, '').slice(0, 70) || 'file';
  return `${stem}.${ext}`;
}

/** What the bot calls its copy: the day, the report, the file. Sorted by name they are in the order they came. */
export function inboxName(reportId: string, fileName: string, day: string): string {
  return `${day}-${reportId.slice(0, 8)}-${safeFileName(fileName)}`;
}

/** Whether the bytes are what the name says: a PDF starts "%PDF", text holds no zero bytes. */
export function looksLike(name: string, start: Uint8Array): boolean {
  if (fileKind(name) === 'pdf') return start.length >= 4 && start[0] === 0x25 && start[1] === 0x50 && start[2] === 0x44 && start[3] === 0x46;
  return fileKind(name) !== null && !start.subarray(0, 8192).includes(0);
}

/** The largest file the bot may attach in a server: 10 MB, or 50 and 100 MB at boost levels 2 and 3. */
export function attachLimit(premiumTier: number): number {
  return (premiumTier >= 3 ? 100 : premiumTier === 2 ? 50 : 10) * 1024 * 1024;
}

/** The "File" line under a report: its name and size, and what became of it. */
export function fileLine(report: Pick<Report, 'fileName' | 'fileSize' | 'fileSaved' | 'filePath'>, attached: boolean): string {
  const what = `${report.fileName}${report.fileSize ? ` · ${megabytes(report.fileSize)}` : ''}`;
  if (report.fileSaved?.startsWith(REFUSED)) return `${what} · not kept: ${report.fileSaved.slice(REFUSED.length)}`;
  if (!report.fileSaved) return `${what} · ${report.filePath ? 'waiting to be fetched' : 'no longer held'}`;
  return `${what} · ${attached ? 'attached here' : 'too large to attach here'} · kept on the bot’s machine as ${report.fileSaved}`;
}
