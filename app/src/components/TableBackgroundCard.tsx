import { useRef, useState } from 'react';
import { useAppBackground } from '../lib/appBackground';

/** For the table's DM: the picture behind every page of the site. */
export function TableBackgroundCard() {
  const { url, upload, remove } = useAppBackground();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);

  const run = async (work: () => Promise<string | null>, done: string) => {
    setBusy(true);
    setSaid(null);
    const why = await work();
    setBusy(false);
    setSaid(why ? { text: why, bad: true } : { text: done, bad: false });
    if (file.current) file.current.value = '';
  };

  return (
    <section className="card">
      <h2>The table’s background</h2>
      <p className="page-ref">
        One picture behind every page of the site, for everyone who opens it, signed in or not. A character with a background of its own keeps it on its sheet.
        The picture is shrunk before it is sent and is public: anyone with the site’s address can see it.
      </p>
      {url ? <div className="table-bg-preview" style={{ backgroundImage: `url("${url}")` }} role="img" aria-label="The table’s background picture" /> : <p>No picture yet: pages show the plain sea chart.</p>}
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const chosen = e.target.files?.[0]; if (chosen) void run(() => upload(chosen), 'The picture is up. Everyone sees it the next time they open the site.'); }} />
      <div className="row wrap">
        <button className="btn btn-primary" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'Working…' : url ? 'Replace the picture' : 'Choose a picture'}</button>
        {url && <button className="btn" disabled={busy} onClick={() => void run(remove, 'The picture is removed. Pages show the plain sea chart again.')}>Remove it</button>}
      </div>
      {said && <p className={said.bad ? 'notice' : 'page-ref'} role={said.bad ? 'alert' : 'status'}>{said.text}</p>}
    </section>
  );
}
