// Reports to the developer: a bug, an idea, something needed. Sent from any page, signed in or not,
// to a table only the bot reads (supabase/migrations/0010_reports.sql); the bot posts each in a
// Discord channel kept for them. Nothing of a character is sent: only the words, the page, the
// site's build and what kind of device it was.
import { supabase } from './supabase';

export type ReportKind = 'bug' | 'idea' | 'other' | 'source';
export const REPORT_KINDS: { id: ReportKind; label: string; ask: string }[] = [
  { id: 'bug', label: 'Something is wrong', ask: 'What happened, and what did you expect? What were you doing just before?' },
  { id: 'idea', label: 'An idea', ask: 'What would you like the site or the bot to do?' },
  { id: 'source', label: 'Source material', ask: 'What is it, and where should it go? (A book, a page of house rules, a class to add…)' },
  { id: 'other', label: 'Something else', ask: 'What do you need?' },
];

/** Files taken with a report: a PDF or a text file, 50 MB at most. The bucket and the bot check the same. */
export const FILE_TYPES: Record<string, string> = { pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown' };
export const FILE_MAX_BYTES = 50 * 1024 * 1024;
export const megabytes = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const extensionOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? '';

/** Why a chosen file cannot be sent, or null when it can. */
export function fileProblem(file: { name: string; size: number }): string | null {
  if (!(extensionOf(file.name) in FILE_TYPES)) return 'Only PDF and text files (.pdf, .txt, .md) can be sent.';
  if (file.size <= 0) return 'That file is empty.';
  if (file.size > FILE_MAX_BYTES) return `That file is ${megabytes(file.size)}; 50 MB is the most.`;
  return null;
}
export const REPORT_MIN = 3;
export const REPORT_MAX = 2000;

export interface ReportDraft { kind: ReportKind; message: string; reporter: string }
export interface SentReport { id: string; createdAt: string; kind: ReportKind; message: string; done: boolean; /** A file sent with it, and whether it has reached Matt yet. */ fileName?: string; fileArrived?: boolean }

/** "index-DOgJ3rQi": the build the page is running, read from the name of its own script. */
export function buildOf(scriptSources: string[]): string {
  for (const src of scriptSources) {
    const match = /assets\/(index-[\w-]+)\.js/.exec(src);
    if (match) return match[1]!.slice(0, 40);
  }
  return 'development';
}

/** "Android · Chrome · 390×844 · installed app": enough to try the same thing on the same kind of device. */
export function deviceLine(userAgent: string, width: number, height: number, installed: boolean): string {
  const system = /Android/.test(userAgent) ? 'Android' : /iPhone|iPad|iPod/.test(userAgent) ? 'iOS' : /Windows/.test(userAgent) ? 'Windows' : /Mac OS X/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : 'Unknown system';
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Unknown browser';
  return [system, browser, `${Math.round(width)}×${Math.round(height)}`, installed ? 'installed app' : ''].filter(Boolean).join(' · ').slice(0, 300);
}

/** Why a draft cannot be sent yet, or null when it can. */
export function draftProblem(draft: ReportDraft): string | null {
  const length = draft.message.trim().length;
  if (length < REPORT_MIN) return 'Write a few words first.';
  if (length > REPORT_MAX) return `That is ${length - REPORT_MAX} characters too long; ${REPORT_MAX} is the most.`;
  return null;
}

const DRAFT_KEY = 'dndf.report-draft';
/** What was being written, kept so a closed dialog, a reload or a lost connection does not lose it. */
export function readDraft(storage: Pick<Storage, 'getItem'> = localStorage): Partial<ReportDraft> {
  try {
    const kept = JSON.parse(storage.getItem(DRAFT_KEY) ?? '{}') as Partial<ReportDraft>;
    return { kind: REPORT_KINDS.some((k) => k.id === kept.kind) ? kept.kind : undefined, message: typeof kept.message === 'string' ? kept.message.slice(0, REPORT_MAX * 2) : undefined, reporter: typeof kept.reporter === 'string' ? kept.reporter.slice(0, 60) : undefined };
  } catch {
    return {};
  }
}
export function keepDraft(draft: ReportDraft | null, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage): void {
  try {
    if (draft && (draft.message.trim() || draft.reporter.trim())) storage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else storage.removeItem(DRAFT_KEY);
  } catch {
    // Storage full or switched off: the draft simply is not kept.
  }
}

export const reportsAvailable = supabase !== null;

/** Sends a report. Gives null when it went, or the reason it did not, in words for the player. */
export async function sendReport(draft: ReportDraft, page: string, file?: File): Promise<string | null> {
  if (!supabase) return 'This copy of the site is not connected to the table’s database, so there is nowhere to send it.';
  const problem = draftProblem(draft);
  if (problem) return problem;
  const installed = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  // A file goes up first, into the sender's own folder; the report then says where it is.
  let attached: { file_path: string; file_name: string; file_size: number } | undefined;
  if (file) {
    const unfit = fileProblem(file);
    if (unfit) return unfit;
    const user = (await supabase.auth.getSession()).data.session?.user.id;
    if (!user) return 'Sign in to send a file. The words alone can be sent signed out.';
    const extension = extensionOf(file.name);
    const path = `${user}/${crypto.randomUUID()}.${extension}`;
    const sent = await supabase.storage.from('report-files').upload(path, file, { contentType: FILE_TYPES[extension] });
    if (sent.error) return /Failed to fetch|NetworkError|network/i.test(sent.error.message) ? 'No connection just now, so the file did not go. What you wrote is kept here.' : `The file could not be sent (${sent.error.message}). What you wrote is kept here.`;
    attached = { file_path: path, file_name: file.name.slice(0, 120), file_size: file.size };
  }
  const { error } = await supabase.from('reports').insert({
    ...attached,
    reporter: draft.reporter.trim().slice(0, 60),
    kind: draft.kind,
    message: draft.message.trim(),
    page: page.slice(0, 200),
    app_version: buildOf([...document.querySelectorAll('script[src]')].map((s) => (s as HTMLScriptElement).src)),
    device: deviceLine(navigator.userAgent, window.innerWidth, window.innerHeight, installed),
  });
  if (!error) return null;
  if (attached) void supabase.storage.from('report-files').remove([attached.file_path]);
  // The database's own words when it is holding reports back ("Too many reports just now…").
  if (/Too many reports/.test(error.message)) return error.message;
  if (/Failed to fetch|NetworkError|network/i.test(error.message)) return 'No connection just now. What you wrote is kept here: send it when you are back online.';
  return `It could not be sent (${error.message}). What you wrote is kept here.`;
}

/** The signed-in player's own reports, newest first, with whether each is done. Empty when signed out. */
export async function myReports(): Promise<SentReport[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(10);
  if (error || !data) return [];
  return data.map((row) => ({
    id: String(row.id), createdAt: String(row.created_at), kind: row.kind as ReportKind, message: String(row.message), done: row.status === 'done',
    ...(row.file_name ? { fileName: String(row.file_name), fileArrived: Boolean(row.file_saved) && !String(row.file_saved).startsWith('refused') } : {}),
  }));
}
