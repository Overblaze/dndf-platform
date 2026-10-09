import {
  SHIP_ABILITIES, UPGRADE_SOURCES, cite, damageComponent, deriveShip, exactBerries, formatBerries, newShip, shipLog, signed, upgradePrice, upgradeWorth, voyage,
  type HoldItem, type RuleEntry, type ShipPicture, type ShipComponent, type ShipDoc, type ShipRole, type ShipUpgrade, type UpgradeSource,
} from '@dndf/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Dialog } from '../components/Dialog';
import { useAuth } from '../lib/auth';
import { campaignApi, type Campaign } from '../lib/campaigns';
import { ruleSet } from '../lib/rules';
import { ShipChanged, shipStoreFor, type ShipStore, type StoredShip } from '../lib/ships';
import { shipPicturesFor, type ShipPictureStore } from '../lib/shipPictures';
import { supabase } from '../lib/supabase';
import { PictureDialog, ShipCover, ShipPicturesCard } from './ShipPictures';

const BOOK = 'DnDF DM Guide';
const ROLE_NAMES: Record<ShipRole, string> = { hull: 'Hull', control: 'Control', movement: 'Movement', weapon: 'Weapons', other: 'Other parts' };
const SOURCES = Object.keys(UPGRADE_SOURCES) as UpgradeSource[];
const SOURCE_NAMES: Record<UpgradeSource, string> = { bought: 'Bought', gift: 'A gift', plunder: 'Plundered or salvaged', built: 'Built by the crew', reward: 'A reward', other: 'Another way' };
const rule = (id: string) => ruleSet('dndf-10').rules.get(id);
const optional = (raw: string) => (raw.trim() === '' ? undefined : whole(raw));
const today = () => new Date().toISOString().slice(0, 10);
const whole = (raw: string, fallback = 0) => { const n = Math.round(Number(raw)); return raw.trim() !== '' && Number.isFinite(n) ? Math.max(0, n) : fallback; };
const decimal = (raw: string) => { const n = Number(raw); return raw.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined; };

function useCampaigns(userId: string | null) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  useEffect(() => {
    if (!userId || !supabase) { setCampaigns([]); return; }
    campaignApi(supabase).myCampaigns(userId).then(setCampaigns, () => setCampaigns([]));
  }, [userId]);
  return campaigns;
}

/** Your ships and your crew's, and launching a new one from the book's stat blocks or from nothing. */
function ShipList({ store, campaigns }: { store: ShipStore; campaigns: Campaign[] }) {
  const navigate = useNavigate();
  const types = useMemo(() => [...ruleSet('dndf-10').rules.values()].filter((e) => e.kind === 'shipType'), []);
  const [ships, setShips] = useState<StoredShip[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [campaign, setCampaign] = useState('');
  useEffect(() => { store.list().then(setShips, (e: Error) => { setShips([]); setProblem(e.message); }); }, [store]);
  const launch = () => {
    const entry = types.find((t) => t.id === type) ?? null;
    store.create(newShip(entry, name, () => crypto.randomUUID()), campaign || null).then((made) => navigate(`/ship/${made.id}`), (e: Error) => setProblem(e.message));
  };
  return (
    <>
      <section className="card">
        <h1>Ship</h1>
        {store.local && <p className="notice">You are not signed in, so ships here are kept only in this browser. Sign in to share a ship with your crew.</p>}
        {problem && <p className="notice" role="alert">{problem}</p>}
        {!ships && !problem && <p>Scanning the harbour…</p>}
        {ships?.length === 0 && !problem && <p>No ships yet.</p>}
        {ships?.map((ship) => {
          const sheet = deriveShip(ship.doc, rule);
          return (
            <div key={ship.id} className="resource">
              <Link className="character-link" to={`/ship/${ship.id}`}>
                <span className="resource-name">{sheet.name}</span>
                <span className="page-ref">{[sheet.summary, ship.campaignId ? `shared with ${campaigns.find((c) => c.id === ship.campaignId)?.name ?? 'your campaign'}` : store.local ? 'this browser' : 'only you', ship.mine ? '' : 'a crewmate’s'].filter(Boolean).join(' · ')}</span>
              </Link>
            </div>
          );
        })}
      </section>
      <section className="card">
        <h2>Launch a ship</h2>
        <label className="field">
          <span className="label">Start from · {cite(BOOK, 13)}</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">A blank ship (fill everything in yourself)</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name} · {String(t.size)} · {formatBerries(Number(t.cost))} · crew {String(t.crew)}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">Her name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Going Merry" maxLength={80} />
        </label>
        {!store.local && (
          <label className="field">
            <span className="label">Who sails her</span>
            <select value={campaign} onChange={(e) => setCampaign(e.target.value)}>
              <option value="">Only you</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>The crew of {c.name}: everyone can open and change her</option>)}
            </select>
          </label>
        )}
        <button className="btn btn-primary" onClick={launch}>Launch</button>
        <p className="page-ref">Every number can be changed afterwards. The book’s ships and upgrades are in the <Link to="/library">Library</Link> under “Ships and sailing”.</p>
      </section>
    </>
  );
}

function Counter({ label, value, sub, onChange }: { label: string; value: number; sub?: string; onChange: (next: number) => void }) {
  return (
    <div className="resource">
      <div>
        <div className="resource-name">{label}</div>
        {sub && <div className="page-ref">{sub}</div>}
      </div>
      <span className="big num">{value}</span>
      <div className="row">
        <button className="btn" onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`One fewer: ${label}`}>−</button>
        <button className="btn" onClick={() => onChange(value + 1)} aria-label={`One more: ${label}`}>+</button>
      </div>
    </div>
  );
}

/** Change one component, or add one of your own. */
function ComponentDialog({ initial, onSave, onDelete, onClose }: { initial?: ShipComponent; onSave: (c: ShipComponent) => void; onDelete?: () => void; onClose: () => void }) {
  const [c, setC] = useState<ShipComponent>(initial ?? { id: crypto.randomUUID(), name: '', role: 'weapon', damage: 0 });
  const opt = (raw: string) => (raw.trim() === '' ? undefined : whole(raw));
  return (
    <Dialog title={initial ? `Change ${initial.name}` : 'Add a component'} onClose={onClose}>
      <label className="field"><span className="label">Name</span><input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Weapon: Harpoon Cannon" maxLength={80} /></label>
      <label className="field">
        <span className="label">What it is</span>
        <select value={c.role} onChange={(e) => setC({ ...c, role: e.target.value as ShipRole })}>
          {(Object.keys(ROLE_NAMES) as ShipRole[]).map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
        </select>
      </label>
      <div className="grid-2">
        <label className="field"><span className="label">Armor Class</span><input type="number" inputMode="numeric" value={c.ac ?? ''} onChange={(e) => setC({ ...c, ac: opt(e.target.value) })} /></label>
        <label className="field"><span className="label">Hit points</span><input type="number" inputMode="numeric" value={c.maxHp ?? ''} onChange={(e) => setC({ ...c, maxHp: opt(e.target.value) })} /></label>
        <label className="field"><span className="label">Damage threshold</span><input type="number" inputMode="numeric" value={c.threshold ?? ''} onChange={(e) => setC({ ...c, threshold: opt(e.target.value) })} /></label>
        <label className="field"><span className="label">Speed it gives (ft)</span><input type="number" inputMode="numeric" value={c.speed ?? ''} onChange={(e) => setC({ ...c, speed: opt(e.target.value) })} /></label>
      </div>
      <label className="field"><span className="label">Its text</span><textarea rows={5} value={c.text ?? ''} onChange={(e) => setC({ ...c, text: e.target.value || undefined })} /></label>
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => onSave({ ...c, name: c.name.trim() || 'Component' })}>Save</button>
        <button className="btn" onClick={onClose}>Cancel</button>
        {onDelete && <button className="btn btn-damage" onClick={onDelete}>Remove it</button>}
      </div>
    </Dialog>
  );
}

/** Add an upgrade from the book or one of your own: bought from the treasury, or come by any other way. */
function UpgradeDialog({ doc, onAdd, onClose }: { doc: ShipDoc; onAdd: (upgrade: ShipUpgrade, pay: number, component: ShipComponent | null) => void; onClose: () => void }) {
  const catalogue = useMemo(() => [...ruleSet('dndf-10').rules.values()].filter((e) => e.kind === 'shipUpgrade'), []);
  const [own, setOwn] = useState({ name: '', slots: 1, text: '', worth: '' });
  const [how, setHow] = useState<UpgradeSource>('gift');
  const [note, setNote] = useState('');
  const groups = [...new Set(catalogue.map((u) => String(u.group ?? 'Upgrades')))];
  const story = note.trim() || undefined;
  const add = (entry: RuleEntry, source: UpgradeSource, pay: boolean) => {
    const price = upgradePrice(entry, doc.cost);
    // An upgrade with an Armor Class and hit points is a part of the ship that can be shot at.
    const role: ShipRole = /Movement/.test(String(entry.group)) ? 'movement' : /Control/.test(String(entry.group)) ? 'control' : /Weapon/.test(String(entry.group)) ? 'weapon' : 'other';
    const speed = /speed (\d+) ft|(\d+) ft\. while/.exec(String(entry.text ?? ''));
    const component: ShipComponent | null = typeof entry.ac === 'number' && typeof entry.hp === 'number'
      ? { id: crypto.randomUUID(), name: entry.name.replace(/ Upgrade$/, ''), role, ac: entry.ac, maxHp: entry.hp, speed: role === 'movement' && speed ? Number(speed[1] ?? speed[2]) : undefined, text: String(entry.text ?? ''), damage: 0 }
      : null;
    onAdd({ id: crypto.randomUUID(), entry: entry.id, name: entry.name, slots: Number(entry.slots) || 0, how: source, paid: pay ? price : undefined, note: story }, pay ? price : 0, component);
  };
  return (
    <Dialog title="Add an upgrade" onClose={onClose}>
      <p className="page-ref">Prices are for this ship: the flat price plus the share of her own cost ({exactBerries(doc.cost)}) the book gives · {cite(BOOK, 23)}. The treasury holds {exactBerries(doc.treasury)}.</p>
      <div className="grid-2">
        <label className="field">
          <span className="label">If the treasury didn’t pay, how she came by it</span>
          <select value={how} onChange={(e) => setHow(e.target.value as UpgradeSource)}>
            {SOURCES.map((key) => <option key={key} value={key}>{key === 'bought' ? 'Bought, but not from the treasury' : SOURCE_NAMES[key]}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">The story (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Taken off a Marine frigate" maxLength={200} /></label>
      </div>
      {groups.map((group) => (
        <div key={group}>
          <h3>{group}</h3>
          {catalogue.filter((u) => String(u.group ?? 'Upgrades') === group).map((entry) => {
            const price = upgradePrice(entry, doc.cost);
            return (
              <div key={entry.id} className="tracker">
                <div className="resource">
                  <div>
                    <div className="resource-name">{entry.name}</div>
                    <div className="page-ref">{[`${String(entry.slots)} slot${entry.slots === 1 ? '' : 's'}`, exactBerries(price), typeof entry.upgradeDc === 'number' ? `install DC ${entry.upgradeDc}` : '', cite(BOOK, entry.source.page)].filter(Boolean).join(' · ')}</div>
                    {typeof entry.requirement === 'string' && <div className="page-ref held-why">Requires: {entry.requirement}</div>}
                    {price > doc.treasury && <div className="page-ref held-why">More than the treasury holds. You can still buy it.</div>}
                  </div>
                </div>
                <div className="row wrap">
                  <button className="btn btn-primary" onClick={() => add(entry, 'bought', true)}>Buy</button>
                  <button className="btn" onClick={() => add(entry, how, false)} aria-label={`Add ${entry.name} without paying: ${SOURCE_NAMES[how]}`}>Add without paying</button>
                  <Link className="btn" to={`/library/${entry.id}`}>Read it</Link>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <fieldset>
        <legend className="label">Or one of your own</legend>
        <div className="grid-2">
          <label className="field"><span className="label">Name</span><input value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} maxLength={80} /></label>
          <label className="field"><span className="label">Slots it takes</span><input type="number" inputMode="numeric" min={0} value={own.slots} onChange={(e) => setOwn({ ...own, slots: whole(e.target.value) })} /></label>
          <label className="field"><span className="label">What it is worth (฿, optional)</span><input type="number" inputMode="numeric" min={0} value={own.worth} onChange={(e) => setOwn({ ...own, worth: e.target.value })} /></label>
        </div>
        <label className="field"><span className="label">What it does (optional)</span><textarea rows={3} value={own.text} onChange={(e) => setOwn({ ...own, text: e.target.value })} maxLength={4000} /></label>
        <button className="btn" disabled={!own.name.trim()} onClick={() => onAdd({ id: crypto.randomUUID(), name: own.name.trim(), slots: own.slots, how, worth: optional(own.worth), note: story, text: own.text.trim() || undefined }, 0, null)}>Add it</button>
        <p className="page-ref">It is added the way chosen at the top ({SOURCE_NAMES[how].toLowerCase()}); nothing leaves the treasury. If it can be shot at, add it under “Add a component” too.</p>
      </fieldset>
    </Dialog>
  );
}

/** Change an upgrade that is already fitted: what it is called, how it was come by, what was paid and what it is worth. */
function UpgradeEditDialog({ doc, initial, onSave, onRemove, onClose }: { doc: ShipDoc; initial: ShipUpgrade; onSave: (u: ShipUpgrade) => void; onRemove: () => void; onClose: () => void }) {
  const [u, setU] = useState<ShipUpgrade>(initial);
  const entry = u.entry ? rule(u.entry) : undefined;
  const calculated = upgradeWorth({ ...u, worth: undefined }, doc.cost, entry);
  return (
    <Dialog title={`Change ${initial.name}`} onClose={onClose}>
      <label className="field"><span className="label">Name</span><input value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} maxLength={80} /></label>
      <div className="grid-2">
        <label className="field"><span className="label">Slots it takes</span><input type="number" inputMode="numeric" min={0} value={u.slots} onChange={(e) => setU({ ...u, slots: whole(e.target.value) })} /></label>
        <label className="field">
          <span className="label">How she came by it</span>
          <select value={u.how} onChange={(e) => setU({ ...u, how: e.target.value as UpgradeSource })}>
            {SOURCES.map((key) => <option key={key} value={key}>{SOURCE_NAMES[key]}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">What was paid (฿)</span><input type="number" inputMode="numeric" min={0} value={u.paid ?? ''} onChange={(e) => setU({ ...u, paid: optional(e.target.value) })} /></label>
        <label className="field"><span className="label">What it is worth (฿)</span><input type="number" inputMode="numeric" min={0} value={u.worth ?? ''} placeholder={String(calculated.value)} onChange={(e) => setU({ ...u, worth: optional(e.target.value) })} /></label>
      </div>
      <p className="page-ref">
        Calculated worth: {exactBerries(calculated.value)} ({calculated.from === 'paid' ? 'what was paid' : calculated.from === 'book' ? `the book’s price for this ship · ${cite(BOOK, entry!.source.page)}` : 'nothing paid and no book price'}).{' '}
        {u.worth !== undefined && <button className="btn" onClick={() => setU({ ...u, worth: undefined })}>Use calculated</button>}
      </p>
      <label className="field"><span className="label">The story</span><input value={u.note ?? ''} onChange={(e) => setU({ ...u, note: e.target.value || undefined })} placeholder="Taken off a Marine frigate" maxLength={200} /></label>
      {entry
        ? <p className="page-ref"><Link to={`/library/${entry.id}`}>Read {entry.name} in the Library</Link></p>
        : <label className="field"><span className="label">What it does</span><textarea rows={4} value={u.text ?? ''} onChange={(e) => setU({ ...u, text: e.target.value || undefined })} maxLength={4000} /></label>}
      <p className="page-ref">Changing what was paid here does not move berries in or out of the treasury.</p>
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => onSave({ ...u, name: u.name.trim() || initial.name })}>Save</button>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-damage" onClick={onRemove}>Remove it</button>
      </div>
    </Dialog>
  );
}

function ShipSheetView({ store, pictures, id, campaigns }: { store: ShipStore; pictures: ShipPictureStore; id: string; campaigns: Campaign[] }) {
  const navigate = useNavigate();
  const [ship, setShip] = useState<StoredShip | null>(null);
  const [doc, setDocState] = useState<ShipDoc | null>(null);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [problem, setProblem] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  // Something to tell the player that is not a failure (a hit that did not get through): a save finishing must not wipe it.
  const [info, setInfo] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'upgrade' | 'part' | 'edit' | 'delete' | ShipComponent | null>(null);
  const [editing, setEditing] = useState<ShipUpgrade | null>(null);
  const [looking, setLooking] = useState<string | null>(null);
  // The ship as she is now, for work that finishes later (an upload) and must not put back an older her.
  const latest = useRef<ShipDoc | null>(null);
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [miles, setMiles] = useState('');
  const [cargo, setCargo] = useState({ name: '', qty: '1', tons: '' });
  const [purse, setPurse] = useState({ amount: '', why: '' });
  const stored = useRef<StoredShip | null>(null);
  const pending = useRef<ShipDoc | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const flushNow = useRef<() => void>(() => {});

  const adopt = useCallback((next: StoredShip) => { stored.current = next; setShip(next); setDocState(next.doc); }, []);
  useEffect(() => {
    let current = true;
    store.get(id).then((found) => { if (!current) return; if (found) adopt(found); else setMissing(true); }, (e: Error) => current && setProblem(e.message));
    // A crewmate may have changed her while this tab was in the background.
    const refresh = () => {
      // Leaving the tab: a change still waiting out its short delay is saved now, not lost.
      if (document.visibilityState === 'hidden') { window.clearTimeout(timer.current); flushNow.current(); return; }
      if (!pending.current) void store.get(id).then((found) => current && found && found.updatedAt !== stored.current?.updatedAt && adopt(found), () => {});
    };
    document.addEventListener('visibilitychange', refresh);
    // Leaving the page for another (All ships, the Library) saves it too.
    return () => { current = false; document.removeEventListener('visibilitychange', refresh); window.clearTimeout(timer.current); flushNow.current(); };
  }, [store, id, adopt]);

  const flush = useCallback(() => {
    const next = pending.current;
    if (!next || !stored.current) return;
    pending.current = null;
    store.save(stored.current, next).then(
      (saved) => { stored.current = saved; setShip(saved); if (!pending.current) setStatus('saved'); setProblem(null); },
      (e: Error) => {
        if (e instanceof ShipChanged) {
          adopt(e.current);
          setStatus('saved');
          setProblem('A crewmate changed the ship at the same moment, so your last change was not saved. This is the ship as it is now; make the change again if it is still needed.');
        } else { pending.current ??= next; setStatus('error'); setProblem(e.message); }
      },
    );
  }, [store, adopt]);
  flushNow.current = flush;
  const setDoc = useCallback((next: ShipDoc) => {
    setDocState(next); pending.current = next; setStatus('saving');
    window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, 600);
  }, [flush]);

  if (missing) return <section className="card"><h1>No such ship</h1><p>{store.local ? 'She isn’t kept in this browser. If she is on your account, sign in to see her.' : 'She may have been scuttled, or taken out of your campaign.'}</p><Link className="btn" to="/ship">All ships</Link></section>;
  if (!doc || !ship) return problem ? <p className="notice" role="alert">{problem}</p> : <p>Rowing out to her…</p>;

  latest.current = doc;
  const sheet = deriveShip(doc, rule);
  const coverPicture = doc.pictures.find((p) => p.id === doc.cover);
  const lookingAt = doc.pictures.find((p) => p.id === looking);
  const log = (next: ShipDoc, line: string) => setDoc(shipLog(next, line, today()));
  const hit = (part: ShipComponent, sign: 1 | -1) => {
    const n = whole(amount[part.id] ?? '');
    if (!n) return;
    const result = damageComponent(doc, part.id, sign * n);
    setAmount({ ...amount, [part.id]: '' });
    if (result.doc !== doc) { setInfo(null); log(result.doc, result.summary); } else setInfo(result.summary);
  };
  const saveComponent = (c: ShipComponent) => { setDoc({ ...doc, components: doc.components.some((x) => x.id === c.id) ? doc.components.map((x) => (x.id === c.id ? c : x)) : [...doc.components, c] }); setDialog(null); };
  const addCargo = () => {
    const item: HoldItem = { id: crypto.randomUUID(), name: cargo.name.trim() || 'Cargo', qty: whole(cargo.qty, 1), tons: decimal(cargo.tons) };
    log({ ...doc, hold: [...doc.hold, item] }, `Loaded ${item.qty} × ${item.name}`);
    setCargo({ name: '', qty: '1', tons: '' });
  };
  const pay = (sign: 1 | -1) => {
    const n = whole(purse.amount);
    if (!n) return;
    log({ ...doc, treasury: doc.treasury + sign * n }, `Treasury ${sign > 0 ? '+' : '−'}${exactBerries(n)}${purse.why.trim() ? ` (${purse.why.trim()})` : ''}: ${exactBerries(doc.treasury)} → ${exactBerries(doc.treasury + sign * n)}`);
    setPurse({ amount: '', why: '' });
  };
  const trip = miles.trim() !== '' && Number(miles) > 0 ? voyage(doc, Number(miles)) : null;
  const roles = (Object.keys(ROLE_NAMES) as ShipRole[]).filter((r) => sheet.components.some((c) => c.role === r));

  return (
    <>
      <section className="card sheet-head">
        {coverPicture && <ShipCover store={pictures} picture={coverPicture} onOpen={() => setLooking(coverPicture.id)} />}
        <div>
          <h1>{sheet.name}</h1>
          <p className="soft">{sheet.summary}</p>
        </div>
        <div className="row wrap">
          <span className={status === 'error' ? 'chip chip-damage' : 'chip'} role="status">{status === 'saved' ? (store.local ? 'Saved on this device' : 'Saved') : status === 'saving' ? 'Saving…' : 'Not saved'}</span>
          <button className="btn" onClick={() => setDialog('edit')}>Edit</button>
          <Link className="btn" to="/ship">All ships</Link>
        </div>
        {problem && <p className="notice" role="alert">{problem} <button className="btn" onClick={() => setProblem(null)}>OK</button></p>}
        {info && <p className="notice" role="status">{info} <button className="btn" onClick={() => setInfo(null)}>OK</button></p>}
        <p className="page-ref">{ship.campaignId ? `Shared with the crew of ${campaigns.find((c) => c.id === ship.campaignId)?.name ?? 'your campaign'}: everyone in it can open and change her.` : store.local ? 'Kept in this browser.' : 'Only you can see her.'}</p>
      </section>

      <section className="card">
        <div className="tiles">
          <div className="tile"><span className="label">Speed</span><span className="big num">{sheet.speed.value} ft</span><span className="page-ref">{sheet.speed.from ?? 'no way to move'}</span></div>
          <div className="tile"><span className="label">Crew</span><span className="big num">{sheet.crew.aboard} / {sheet.crew.max}</span><span className="page-ref">{sheet.crew.passengers} of {sheet.crew.passengerMax} passengers</span></div>
          <div className="tile"><span className="label">Cargo</span><span className="big num">{sheet.cargo.tons} / {sheet.cargo.capacity} t</span><span className="page-ref">{doc.pace.mph} mph{doc.pace.milesPerDay ? ` · ${doc.pace.milesPerDay} miles a day` : ''}</span></div>
        </div>
        {sheet.speed.lines.length > 1 && <p className="page-ref">Speed: {sheet.speed.lines.map((l, i) => `${i ? (Number(l.value) < 0 ? '− ' : '+ ') : ''}${Math.abs(Number(l.value))} ft (${l.label})`).join(' ')}</p>}
        <div className="chips">
          {SHIP_ABILITIES.map((a) => <span key={a} className="chip chip-lg">{a.toUpperCase()} <strong className="num">{sheet.abilities[a].score}</strong> {sheet.abilities[a].autoFail ? 'fails' : signed(sheet.abilities[a].mod)}</span>)}
        </div>
        {sheet.notes.length > 0 && <ul className="notes">{sheet.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
        <p className="page-ref">A score of 0 fails every check and save that uses it · {cite(BOOK, 11)}</p>
      </section>

      <ShipPicturesCard
        store={pictures} shipId={id} pictures={doc.pictures} cover={doc.cover} shared={Boolean(ship.campaignId)}
        onOpen={(picture) => setLooking(picture.id)}
        onAdd={(added) => {
          const now = latest.current ?? doc;
          // The first picture of her goes to the top of the sheet; the crew can change that.
          setDoc(shipLog({ ...now, pictures: [...now.pictures, ...added], cover: now.cover ?? added.find((p) => p.kind === 'art')?.id }, added.length === 1 ? `Added ${added[0]!.kind === 'map' ? 'a map' : 'artwork'}${added[0]!.title ? `: ${added[0]!.title}` : ''}` : `Added ${added.length} pictures`, today()));
        }}
      />

      {roles.map((role) => (
        <section key={role} className="card">
          <h2>{ROLE_NAMES[role]}{role === 'weapon' ? ` · ${sheet.weapons.usable} of ${sheet.weapons.total} can be used` : ''}</h2>
          {sheet.components.filter((c) => c.role === role).map((part) => (
            <div key={part.id} className="tracker">
              <div className="resource">
                <button className="attack-name" onClick={() => setDialog(doc.components.find((c) => c.id === part.id)!)}>
                  <span className="resource-name">{part.name}{part.destroyed ? ' (destroyed)' : ''}</span>
                  <span className="page-ref">{[part.ac !== undefined ? `AC ${part.ac}` : '', part.threshold ? `damage threshold ${part.threshold}` : '', part.speedNow !== undefined ? `speed ${part.speedNow} ft${part.speedNow !== part.speed ? ` (of ${part.speed})` : ''}` : ''].filter(Boolean).join(' · ') || 'tap to change'}</span>
                </button>
                {part.hp !== null && <span className={part.destroyed ? 'big num edited' : 'big num'}>{part.hp}<span className="soft"> / {part.maxHp}</span></span>}
              </div>
              {part.hp !== null && (
                <div className="row wrap">
                  <input type="number" inputMode="numeric" min={0} value={amount[part.id] ?? ''} onChange={(e) => setAmount({ ...amount, [part.id]: e.target.value })} placeholder="Amount" aria-label={`Amount for ${part.name}`} />
                  <button className="btn btn-damage" onClick={() => hit(part, 1)}>Damage</button>
                  <button className="btn btn-heal" onClick={() => hit(part, -1)}>Repair</button>
                </div>
              )}
              {part.text && <details className="rule-text"><summary>Its text</summary><p className="feature-text">{part.text}</p></details>}
            </div>
          ))}
        </section>
      ))}
      <section className="card">
        <button className="btn" onClick={() => setDialog('part')}>Add a component</button>
        <p className="page-ref">Damage under a component’s threshold does nothing; at or over it, all of it counts · {cite(BOOK, 13)}. Tap a component to change its numbers.</p>
      </section>

      <section className="card">
        <h2>Aboard</h2>
        <Counter label="Crew working the ship" value={doc.crew} sub={`she needs ${doc.crewMax}; at ${Math.floor(doc.crewMax / 2)} or fewer she is short-handed`} onChange={(crew) => setDoc({ ...doc, crew })} />
        <Counter label="Passengers" value={doc.passengers} sub={`room for ${doc.passengerMax}`} onChange={(passengers) => setDoc({ ...doc, passengers })} />
        <Counter label="Rations (one feeds one person for a day)" value={doc.rations} sub={sheet.rationDays === null ? 'nobody aboard to feed' : `${sheet.rationDays} days for everyone aboard`} onChange={(rations) => setDoc({ ...doc, rations })} />
        <p className="page-ref">A Large creature counts as four crew, a Huge one as nine · {cite(BOOK, 11)}</p>
      </section>

      <section className="card">
        <h2>Upgrades · {sheet.slots.used} of {sheet.slots.total} slots</h2>
        {doc.upgrades.length === 0 && <p className="soft">None fitted.</p>}
        {doc.upgrades.map((u) => (
          <div key={u.id} className="tracker">
            <div className="resource">
              <button className="attack-name" onClick={() => setEditing(u)}>
                <span className="resource-name">{u.name}{u.entry ? '' : ' (your own)'}</span>
                <span className="page-ref">{[`${u.slots} slot${u.slots === 1 ? '' : 's'}`, `${UPGRADE_SOURCES[u.how]}${u.paid ? ` for ${exactBerries(u.paid)}` : ''}`, u.worth !== undefined ? `worth ${exactBerries(u.worth)}` : '', u.note].filter(Boolean).join(' · ')}</span>
              </button>
              <button className="btn" onClick={() => setEditing(u)} aria-label={`Change ${u.name}`}>Change</button>
            </div>
            {u.text && <details className="rule-text"><summary>What it does</summary><p className="feature-text">{u.text}</p></details>}
          </div>
        ))}
        <button className="btn btn-primary" onClick={() => setDialog('upgrade')}>Add an upgrade</button>
        <p className="page-ref">Tap an upgrade to change it: its name, slots, how she came by it, what was paid and what it is worth.</p>
      </section>

      <section className="card">
        <h2>What she is worth</h2>
        <p className={sheet.worth.overridden ? 'big num edited' : 'big num'}>{exactBerries(sheet.worth.value)}</p>
        {sheet.worth.overridden && (
          <p className="page-ref">Set by the crew. Calculated: {exactBerries(sheet.worth.calculated)}. <button className="btn" onClick={() => log({ ...doc, worth: undefined }, `Worth back to the calculated ${exactBerries(sheet.worth.calculated)}`)}>Use calculated</button></p>
        )}
        <details className="rule-text">
          <summary>How that is worked out</summary>
          <ul className="notes">
            {sheet.worth.lines.map((l, i) => <li key={i}>{i ? '+ ' : ''}{exactBerries(l.value)} · {l.label}</li>)}
            <li>= {exactBerries(sheet.worth.calculated)}</li>
          </ul>
        </details>
        {sheet.worth.book !== null && (
          <p className="page-ref">
            The book’s {rule(doc.type!)?.name ?? 'ship'} costs {exactBerries(sheet.worth.book)} · {cite(BOOK, rule(doc.type!)!.source.page)}.
            {doc.cost !== sheet.worth.book ? ` Hers is ${exactBerries(doc.cost)}, ${exactBerries(Math.abs(doc.cost - sheet.worth.book))} ${doc.cost > sheet.worth.book ? 'more' : 'less'}; upgrade prices that are a share of the ship’s cost use hers.` : ''}
          </p>
        )}
        <p className="page-ref">Change her own cost or set her worth outright under Edit.</p>
      </section>

      <section className="card">
        <h2>Treasury</h2>
        <p className="big num">{exactBerries(sheet.treasury)}</p>
        <div className="grid-2">
          <label className="field"><span className="label">Amount</span><input type="number" inputMode="numeric" min={0} value={purse.amount} onChange={(e) => setPurse({ ...purse, amount: e.target.value })} /></label>
          <label className="field"><span className="label">What for (optional)</span><input value={purse.why} onChange={(e) => setPurse({ ...purse, why: e.target.value })} placeholder="Sold the cargo" maxLength={80} /></label>
        </div>
        <div className="row wrap">
          <button className="btn btn-heal" disabled={!whole(purse.amount)} onClick={() => pay(1)}>Put in</button>
          <button className="btn btn-damage" disabled={!whole(purse.amount)} onClick={() => pay(-1)}>Take out</button>
        </div>
        <p className="page-ref">The crew’s shared berries. Each change goes in the log below, so everyone can see where it went.</p>
      </section>

      <section className="card">
        <h2>Hold · {sheet.cargo.tons} of {sheet.cargo.capacity} tons</h2>
        {sheet.cargo.lines.length === 0 && <p className="soft">Empty.</p>}
        {sheet.cargo.lines.map((line) => (
          <div key={line.id} className="resource">
            <div>
              <div className="resource-name">{line.name}</div>
              <div className="page-ref">{line.tons !== undefined ? `${line.tons} t each${line.qty !== 1 ? `, ${line.total} t in all` : ''}` : 'no weight'}</div>
            </div>
            <span className="big num">{line.qty}</span>
            <div className="row">
              <button className="btn" onClick={() => (line.qty <= 1 ? log({ ...doc, hold: doc.hold.filter((h) => h.id !== line.id) }, `Unloaded the last ${line.name}`) : log({ ...doc, hold: doc.hold.map((h) => (h.id === line.id ? { ...h, qty: h.qty - 1 } : h)) }, `Unloaded 1 × ${line.name}`))} aria-label={`One fewer ${line.name}`}>−</button>
              <button className="btn" onClick={() => log({ ...doc, hold: doc.hold.map((h) => (h.id === line.id ? { ...h, qty: h.qty + 1 } : h)) }, `Loaded 1 × ${line.name}`)} aria-label={`One more ${line.name}`}>+</button>
            </div>
          </div>
        ))}
        <div className="grid-2">
          <label className="field"><span className="label">Load</span><input value={cargo.name} onChange={(e) => setCargo({ ...cargo, name: e.target.value })} placeholder="Barrels of cola" maxLength={80} /></label>
          <label className="field"><span className="label">How many</span><input type="number" inputMode="numeric" min={0} value={cargo.qty} onChange={(e) => setCargo({ ...cargo, qty: e.target.value })} /></label>
          <label className="field"><span className="label">Tons each (optional)</span><input type="number" inputMode="decimal" min={0} step="any" value={cargo.tons} onChange={(e) => setCargo({ ...cargo, tons: e.target.value })} /></label>
        </div>
        <button className="btn btn-primary" disabled={!cargo.name.trim()} onClick={addCargo}>Load it</button>
      </section>

      <section className="card">
        <h2>Voyage</h2>
        <label className="field"><span className="label">Miles to sail</span><input type="number" inputMode="decimal" min={0} value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="240" /></label>
        {trip && (
          <p>
            <strong className="num">{Number.isFinite(trip.days) ? trip.days : '∞'}</strong> days at {doc.pace.mph} mph, sailing day and night.{' '}
            {trip.rationDays === null ? 'Nobody is aboard to feed.' : trip.enough ? `The rations last (${trip.rationDays} days).` : `The rations run out after ${trip.rationDays} days.`}
          </p>
        )}
        <p className="page-ref">Days = miles ÷ (pace × 24) · {cite(BOOK, 31)}</p>
        <h3>Ship’s soul</h3>
        <Counter label="Voyages the crew has bonded with her" value={sheet.soul.points} sub={sheet.soul.sentient ? 'She has a soul: she is sentient' : `at 3 she develops a soul · each voyage, a DC ${sheet.soul.dc} Charisma check by everyone; more than half must succeed`} onChange={(soul) => setDoc({ ...doc, soul: Math.min(3, soul) })} />
        <p className="page-ref">{cite(BOOK, 11)}</p>
      </section>

      <section className="card">
        <h2>Notes</h2>
        <textarea rows={5} value={doc.notes} onChange={(e) => setDoc({ ...doc, notes: e.target.value })} aria-label="Ship notes" />
        <details className="rule-text">
          <summary>Log ({doc.log.length})</summary>
          {doc.log.length === 0 && <p className="soft">Nothing yet. Damage, repairs, cargo, upgrades and the treasury are written here.</p>}
          <ul className="notes">{doc.log.map((line, i) => <li key={i}>{line.text} <span className="page-ref">{line.at}</span></li>)}</ul>
        </details>
      </section>

      {dialog === 'upgrade' && (
        <UpgradeDialog
          doc={doc}
          onClose={() => setDialog(null)}
          onAdd={(upgrade, cost, component) => {
            log({ ...doc, upgrades: [...doc.upgrades, upgrade], components: component ? [...doc.components, component] : doc.components, treasury: doc.treasury - cost }, cost ? `Bought ${upgrade.name} for ${exactBerries(cost)}` : `Fitted ${upgrade.name} (${UPGRADE_SOURCES[upgrade.how]}${upgrade.note ? `: ${upgrade.note}` : ''})`);
            setDialog(null);
          }}
        />
      )}
      {editing && (
        <UpgradeEditDialog
          doc={doc}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => { setDoc({ ...doc, upgrades: doc.upgrades.map((x) => (x.id === next.id ? next : x)) }); setEditing(null); }}
          onRemove={() => { log({ ...doc, upgrades: doc.upgrades.filter((x) => x.id !== editing.id) }, `Removed ${editing.name}`); setEditing(null); }}
        />
      )}
      {lookingAt && (
        <PictureDialog
          key={lookingAt.id}
          store={pictures}
          picture={lookingAt}
          isCover={doc.cover === lookingAt.id}
          onClose={() => setLooking(null)}
          onSave={(next) => setDoc({ ...doc, pictures: doc.pictures.map((p) => (p.id === next.id ? next : p)) })}
          onCover={(on) => setDoc({ ...doc, cover: on ? lookingAt.id : undefined })}
          onRemove={() => {
            setLooking(null);
            log({ ...doc, pictures: doc.pictures.filter((p) => p.id !== lookingAt.id), cover: doc.cover === lookingAt.id ? undefined : doc.cover }, `Took down ${lookingAt.title ?? (lookingAt.kind === 'map' ? 'a map' : 'artwork')}`);
            void pictures.remove([lookingAt.ref]).catch(() => {});
          }}
        />
      )}
      {dialog === 'part' && <ComponentDialog onSave={saveComponent} onClose={() => setDialog(null)} />}
      {dialog && typeof dialog === 'object' && (
        <ComponentDialog initial={dialog} onSave={saveComponent} onClose={() => setDialog(null)} onDelete={() => { log({ ...doc, components: doc.components.filter((c) => c.id !== dialog.id) }, `Removed ${dialog.name}`); setDialog(null); }} />
      )}
      {dialog === 'edit' && (
        <Dialog title="Edit the ship" onClose={() => setDialog(null)}>
          <label className="field"><span className="label">Name</span><input value={doc.name} onChange={(e) => setDoc({ ...doc, name: e.target.value })} maxLength={80} /></label>
          <div className="grid-2">
            <label className="field"><span className="label">What she is</span><input value={doc.typeName ?? ''} onChange={(e) => setDoc({ ...doc, typeName: e.target.value || undefined })} placeholder="Modified Caravel" maxLength={60} /></label>
            <label className="field"><span className="label">Size</span><input value={doc.size} onChange={(e) => setDoc({ ...doc, size: e.target.value })} maxLength={20} /></label>
            <label className="field"><span className="label">Dimensions</span><input value={doc.dimensions ?? ''} onChange={(e) => setDoc({ ...doc, dimensions: e.target.value || undefined })} placeholder="70 ft. by 20 ft." maxLength={60} /></label>
            <label className="field"><span className="label">Her own cost (฿)</span><input type="number" inputMode="numeric" min={0} value={doc.cost} onChange={(e) => setDoc({ ...doc, cost: whole(e.target.value) })} /></label>
            <label className="field"><span className="label">What she is worth (฿)</span><input type="number" inputMode="numeric" min={0} value={doc.worth ?? ''} placeholder={String(sheet.worth.calculated)} onChange={(e) => setDoc({ ...doc, worth: optional(e.target.value) })} /></label>
            <label className="field"><span className="label">Upgrade slots</span><input type="number" inputMode="numeric" min={0} value={doc.upgradeSlots} onChange={(e) => setDoc({ ...doc, upgradeSlots: whole(e.target.value) })} /></label>
            <label className="field"><span className="label">Crew she needs</span><input type="number" inputMode="numeric" min={0} value={doc.crewMax} onChange={(e) => setDoc({ ...doc, crewMax: whole(e.target.value) })} /></label>
            <label className="field"><span className="label">Passenger room</span><input type="number" inputMode="numeric" min={0} value={doc.passengerMax} onChange={(e) => setDoc({ ...doc, passengerMax: whole(e.target.value) })} /></label>
            <label className="field"><span className="label">Cargo (tons)</span><input type="number" inputMode="decimal" min={0} step="any" value={doc.cargoTons} onChange={(e) => setDoc({ ...doc, cargoTons: decimal(e.target.value) ?? 0 })} /></label>
            <label className="field"><span className="label">Pace (mph)</span><input type="number" inputMode="decimal" min={0} step="any" value={doc.pace.mph} onChange={(e) => { const mph = decimal(e.target.value) ?? 0; setDoc({ ...doc, pace: { mph, milesPerDay: Math.round(mph * 24 * 100) / 100 } }); }} /></label>
            {SHIP_ABILITIES.map((a) => (
              <label key={a} className="field"><span className="label">{a.toUpperCase()}</span><input type="number" inputMode="numeric" min={0} max={30} value={doc.abilities[a]} onChange={(e) => setDoc({ ...doc, abilities: { ...doc.abilities, [a]: Math.min(30, whole(e.target.value)) } })} /></label>
            ))}
          </div>
          <p className="page-ref">
            Her own cost is what upgrade prices take their share of{sheet.worth.book !== null ? ` (the book’s is ${exactBerries(sheet.worth.book)})` : ''}. Her worth is worked out from that and her upgrades ({exactBerries(sheet.worth.calculated)}) unless you type one in.{' '}
            {doc.worth !== undefined && <button className="btn" onClick={() => setDoc({ ...doc, worth: undefined })}>Use calculated</button>}
          </p>
          {!store.local && ship.mine && (
            <label className="field">
              <span className="label">Who sails her</span>
              <select value={ship.campaignId ?? ''} onChange={(e) => store.setCampaign(stored.current!, e.target.value || null).then(adopt, (err: Error) => setProblem(err.message))}>
                <option value="">Only you</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>The crew of {c.name}</option>)}
              </select>
            </label>
          )}
          <div className="row wrap">
            <button className="btn btn-primary" onClick={() => setDialog(null)}>Done</button>
            {(ship.mine || store.local) && <button className="btn btn-damage" onClick={() => setDialog('delete')}>Scuttle her…</button>}
          </div>
        </Dialog>
      )}
      {dialog === 'delete' && (
        <Dialog title={`Scuttle ${doc.name}?`} onClose={() => setDialog(null)}>
          <p>This removes the ship, her hold, her treasury, her pictures and her log for good, for the whole crew.</p>
          <div className="row">
            <button className="btn btn-damage" onClick={() => { window.clearTimeout(timer.current); pending.current = null; const refs = doc.pictures.map((p: ShipPicture) => p.ref); (refs.length ? pictures.remove(refs).catch(() => {}) : Promise.resolve()).then(() => store.remove(id)).then(() => navigate('/ship'), (e: Error) => { setProblem(e.message); setDialog(null); }); }}>Scuttle her</button>
            <button className="btn" onClick={() => setDialog(null)}>Keep her</button>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function ShipPage() {
  const { id } = useParams();
  const { loading, session } = useAuth();
  const userId = session?.user.id ?? null;
  const store = useMemo(() => shipStoreFor(userId), [userId]);
  const pictures = useMemo(() => shipPicturesFor(userId), [userId]);
  const campaigns = useCampaigns(userId);
  if (loading) return <p>Checking who is aboard…</p>;
  return id ? <ShipSheetView key={`${userId}/${id}`} store={store} pictures={pictures} id={id} campaigns={campaigns} /> : <ShipList key={userId} store={store} campaigns={campaigns} />;
}
