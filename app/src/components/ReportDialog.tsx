import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useOnline } from '../lib/online';
import { draftProblem, fileProblem, keepDraft, megabytes, myReports, readDraft, REPORT_KINDS, REPORT_MAX, reportsAvailable, sendReport, type ReportKind, type SentReport } from '../lib/reports';
import { Dialog } from './Dialog';

/** A few words to Matt about a bug, an idea or a need. What is being written survives closing the dialog. */
export function ReportDialog({ onClose, about }: { onClose: () => void; /** A fault the app caught, put at the top of the report. */ about?: string }) {
  const { session, name } = useAuth();
  const online = useOnline();
  const kept = useState(() => readDraft())[0];
  const [kind, setKind] = useState<ReportKind>(about ? 'bug' : kept.kind ?? 'bug');
  const [message, setMessage] = useState(kept.message ?? '');
  const [reporter, setReporter] = useState(kept.reporter ?? '');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<SentReport[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const unfit = file ? fileProblem(file) : null;
  const who = session ? name ?? '' : reporter;
  // A file can go with only its name for words: "Source material: Book One.pdf".
  const words = message.trim() || (file && !about ? `${REPORT_KINDS.find((k) => k.id === kind)!.label}: ${file.name}` : '');
  const draft = { kind, message: about ? `${message.trim()}\n\nThe page said: ${about}`.trim() : words, reporter: who };
  const problem = draftProblem({ ...draft, message: words });
  const page = window.location.hash || '#/';

  useEffect(() => {
    if (!sent) keepDraft({ kind, message, reporter });
  }, [kind, message, reporter, sent]);
  useEffect(() => {
    if (session) void myReports().then(setMine);
  }, [session, sent]);

  const send = async () => {
    setBusy(true);
    setFailed(null);
    const why = await sendReport(draft, page, file ?? undefined);
    setBusy(false);
    if (why) return setFailed(why);
    keepDraft(null);
    setMessage('');
    setFile(null);
    setSent(true);
  };

  return (
    <Dialog title="Tell Matt" onClose={onClose}>
      {sent ? (
        <>
          <p role="status">Sent. Thank you: it is on Matt’s list now.</p>
          <div className="row wrap">
            <button className="btn" onClick={() => setSent(false)}>Send another</button>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </>
      ) : (
        <>
          <p className="page-ref">A bug, an idea, or something you need. It goes to Matt only, not to the table’s chat.</p>
          <div className="segmented" role="radiogroup" aria-label="What kind of report">
            {REPORT_KINDS.map((k) => (
              <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={kind === k.id ? 'active' : ''} onClick={() => setKind(k.id)}>{k.label}</button>
            ))}
          </div>
          {about && <p className="notice">The page said: {about}</p>}
          <label className="field">
            <span className="label">{REPORT_KINDS.find((k) => k.id === kind)!.ask}</span>
            <textarea rows={6} value={message} maxLength={REPORT_MAX * 2} onChange={(e) => setMessage(e.target.value)} placeholder={about ? 'What were you doing when it broke?' : ''} />
          </label>
          <p className="page-ref">{message.trim().length} of {REPORT_MAX} characters</p>
          <fieldset>
            <legend className="label">A file to go with it (PDF or text, up to 50 MB)</legend>
            {session ? (
              <>
                <input ref={picker} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setFailed(null); if (e.target.files?.[0] && kind === 'bug' && !about && !message.trim()) setKind('source'); }} />
                <div className="row wrap">
                  <button type="button" className="btn" onClick={() => picker.current?.click()}>{file ? 'Choose another file' : 'Attach a file'}</button>
                  {file && <button type="button" className="btn" onClick={() => { setFile(null); if (picker.current) picker.current.value = ''; }}>Take it off</button>}
                </div>
                {file && <p className={unfit ? 'notice' : 'page-ref'} role={unfit ? 'alert' : undefined}>{unfit ?? `${file.name} · ${megabytes(file.size)}. It goes to Matt only and is not kept on the site once he has it.`}</p>}
              </>
            ) : <p className="page-ref">Sign in to send a file. The words alone can be sent signed out.</p>}
          </fieldset>
          {!session && (
            <label className="field">
              <span className="label">Your name (so Matt can ask you about it)</span>
              <input value={reporter} maxLength={60} onChange={(e) => setReporter(e.target.value)} placeholder="Optional" />
            </label>
          )}
          <p className="page-ref">
            Sent with it: {session ? `your name (${who || 'none set'}), ` : ''}this page ({page.slice(0, 40)}), the site’s version, and the kind of device and browser. Nothing of your character is sent.
          </p>
          {!online && <p className="notice">You are offline. What you write is kept on this device; send it when you are back online.</p>}
          {failed && <p className="notice" role="alert">{failed}</p>}
          <div className="row wrap">
            <button className="btn" onClick={onClose}>Close</button>
            <button className="btn btn-primary" disabled={busy || !online || !reportsAvailable || unfit !== null || (problem !== null && !about)} onClick={() => void send()}>{busy ? (file ? 'Sending the file…' : 'Sending…') : 'Send to Matt'}</button>
          </div>
          {!reportsAvailable && <p className="notice">This copy of the site is not connected to the table’s database, so reports cannot be sent from it.</p>}
        </>
      )}
      {mine.length > 0 && (
        <>
          <h3>What you have sent</h3>
          {mine.map((report) => (
            <div key={report.id} className="resource">
              <div>
                <div className="resource-name">{report.message.split('\n')[0]!.slice(0, 80)}</div>
                <div className="page-ref">
                  {REPORT_KINDS.find((k) => k.id === report.kind)?.label} · {report.createdAt.slice(0, 10)} · {report.done ? 'completed' : 'with Matt'}
                  {report.fileName ? ` · ${report.fileName}: ${report.fileArrived ? 'arrived' : 'on its way'}` : ''}
                </div>
              </div>
              {report.done && <span className="badge">Done</span>}
            </div>
          ))}
        </>
      )}
    </Dialog>
  );
}

/** The button that opens it. `about` carries a fault the app caught. */
export function ReportButton({ about, label = 'Report a problem or idea', primary }: { about?: string; label?: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={primary ? 'btn btn-primary' : 'btn'} onClick={() => setOpen(true)}>{label}</button>
      {open && <ReportDialog about={about} onClose={() => setOpen(false)} />}
    </>
  );
}
