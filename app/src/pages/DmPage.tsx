import { useCallback, useEffect, useMemo, useState } from 'react';
import { TableBackgroundCard } from '../components/TableBackgroundCard';
import { Dialog } from '../components/Dialog';
import { useAuth } from '../lib/auth';
import { OPTIONAL_RULES, campaignSettings, formatBerries, type CampaignSettings, type OptionalRule } from '@dndf/engine';
import { Link } from 'react-router-dom';
import { campaignApi, type Campaign, type CampaignCharacter, type Grant, type Member, type PartyMember, type Person, type SecretSummary } from '../lib/campaigns';
import { supabase } from '../lib/supabase';

/** Find a Devil Fruit by name and give it, or knowledge of it, to one character. */
function GrantDialog({ character, onGrant, search, onClose }: { character: CampaignCharacter; onGrant: (entryKey: string, kind: 'owner' | 'knowledge', note: string) => Promise<void>; search: (text: string) => Promise<SecretSummary[]>; onClose: () => void }) {
  const [text, setText] = useState('');
  const [found, setFound] = useState<SecretSummary[] | null>(null);
  const [picked, setPicked] = useState<SecretSummary | null>(null);
  const [kind, setKind] = useState<'owner' | 'knowledge'>('owner');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      search(text).then((list) => current && setFound(list), (e: Error) => current && setProblem(e.message));
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [text, search]);
  const give = () => {
    if (!picked) return;
    onGrant(picked.key, kind, note).then(onClose, (e: Error) => setProblem(e.message));
  };
  return (
    <Dialog title={`Grant to ${character.name}`} onClose={onClose}>
      {problem && <p className="notice" role="alert">{problem}</p>}
      {!picked && (
        <>
          <label className="field">
            <span className="label">Devil Fruit name</span>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type part of the name" autoFocus />
          </label>
          {found?.length === 0 && <p className="soft">No fruit by that name. If nothing is ever found, the private data has not been loaded: see supabase/README.md.</p>}
          <div className="surge-list">
            {found?.map((entry) => (
              <button key={entry.key} className="surge-option" onClick={() => setPicked(entry)}>
                <span className="resource-name">{entry.name}</span>
                <span className="page-ref">{entry.book}</span>
              </button>
            ))}
          </div>
          {found?.length === 40 && <p className="page-ref">Showing the first 40. Type more of the name to narrow it.</p>}
        </>
      )}
      {picked && (
        <>
          <p><strong>{picked.name}</strong> <span className="page-ref">{picked.book}</span></p>
          <button className="btn" onClick={() => setPicked(null)}>Choose another</button>
          <label className="field">
            <span className="label">What {character.name} gets</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as 'owner' | 'knowledge')}>
              <option value="owner">The fruit itself: its powers go on the sheet</option>
              <option value="knowledge">Knowledge of it: they can read it, nothing goes on the sheet</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Note (optional; the character’s player can read it)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Found in the wreck, session 9" />
          </label>
          <p className="page-ref">Only {character.name}’s player and the DMs can read it until you reveal it to the table.</p>
          <div className="row wrap">
            <button className="btn btn-primary" onClick={give}>Grant</button>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** The optional rules this campaign plays with. Off until its DM switches them on; a switch takes effect on every sheet in the campaign. */
function OptionalRulesCard({ campaign, api }: { campaign: Campaign; api: ReturnType<typeof campaignApi> }) {
  const [settings, setSettings] = useState<CampaignSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    api.settings(campaign.id).then((raw) => current && setSettings(campaignSettings(raw)), (e: Error) => current && setProblem(e.message));
    return () => { current = false; };
  }, [api, campaign.id]);
  const flip = (rule: OptionalRule) => {
    if (!settings) return;
    const before = settings;
    setBusy(rule);
    setProblem(null);
    // Shown as switched at once; put back if the campaign would not take it.
    setSettings({ ...settings, [rule]: !settings[rule] });
    api.changeSettings(campaign.id, { [rule]: !before[rule] }).then((raw) => setSettings(campaignSettings(raw)), (e: Error) => { setSettings(before); setProblem(e.message); }).finally(() => setBusy(null));
  };
  return (
    <section className="card">
      <h2>Optional rules</h2>
      <p className="page-ref">
        Off until you switch them on. A switch reaches every character in {campaign.name} the next time its sheet is opened or looked at again, and the Discord bot at once.
        Switching one off deletes nothing: picks and points already on a character are kept and count again when it is back on. Characters in no campaign have none of these.
      </p>
      {problem && <p className="notice" role="alert">{problem}</p>}
      {!settings && !problem && <p className="soft">Reading the campaign’s rules…</p>}
      {settings && OPTIONAL_RULES.map((rule) => (
        <label key={rule.id} className="check optional-rule">
          <input type="checkbox" checked={settings[rule.id]} disabled={busy !== null} onChange={() => flip(rule.id)} />
          <span>
            <strong>{rule.name}</strong> <span className="page-ref">{settings[rule.id] ? 'on' : 'off'}{busy === rule.id ? ' · saving…' : ''}</span>
            <span className="page-ref optional-rule-gives">{rule.gives}. <Link to={`/library/${encodeURIComponent(rule.rule)}`}>Read the rule</Link></span>
          </span>
        </label>
      ))}
    </section>
  );
}

function CampaignTools({ campaign, userId, onGone }: { campaign: Campaign; userId: string; onGone: () => void }) {
  const api = useMemo(() => campaignApi(supabase!), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [characters, setCharacters] = useState<CampaignCharacter[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [party, setParty] = useState<PartyMember[]>([]);
  const [fruitCount, setFruitCount] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const [granting, setGranting] = useState<CampaignCharacter | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, p, c] = await Promise.all([api.members(campaign.id), api.people(), api.characters(campaign.id)]);
      setMembers(m); setPeople(p); setCharacters(c);
      setParty(await api.party(campaign.id));
      // Grants live in a later migration: the rest of the page still works without it.
      const [g, n] = await Promise.all([api.grants(campaign.id), api.secretCount()]);
      setGrants(g); setFruitCount(n); setProblem(null);
    } catch (e) {
      setProblem((e as Error).message);
    }
  }, [api, campaign.id]);
  useEffect(() => { void load(); }, [load]);
  const act = (work: Promise<unknown>) => work.then(load, (e: Error) => setProblem(e.message));
  const search = useCallback((text: string) => api.searchFruits(text), [api]);

  const outside = people.filter((p) => !members.some((m) => m.id === p.id));
  const dms = members.filter((m) => m.role === 'dm').length;
  const ownerName = (id: string) => members.find((m) => m.id === id)?.name ?? people.find((p) => p.id === id)?.name ?? 'someone no longer in the campaign';

  return (
    <>
      {problem && <p className="notice" role="alert">{problem}</p>}
      <section className="card">
        <h2>Members</h2>
        {members.map((m) => (
          <div key={m.id} className="resource">
            <div>
              <div className="resource-name">{m.name}{m.id === userId ? ' (you)' : ''}</div>
              <div className="page-ref">{m.role === 'dm' ? 'DM: sees every character and every secret in this campaign' : 'Player'}{m.password ? ' · signs in with a username and password, not Discord' : ''}</div>
            </div>
            <div className="row wrap">
              {m.role === 'player' && <button className="btn" onClick={() => act(api.setRole(campaign.id, m.id, 'dm'))}>Make DM</button>}
              {m.role === 'dm' && dms > 1 && <button className="btn" onClick={() => act(api.setRole(campaign.id, m.id, 'player'))}>Make player</button>}
              {!(m.role === 'dm' && dms === 1) && <button className="btn" onClick={() => act(api.removeMember(campaign.id, m.id))}>Remove</button>}
            </div>
          </div>
        ))}
        <div className="row wrap">
          <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Person to add">
            <option value="">Add someone…</option>
            {outside.map((p) => <option key={p.id} value={p.id}>{p.name}{p.password ? ' (username and password)' : ''}</option>)}
          </select>
          <button className="btn btn-primary" disabled={!adding} onClick={() => { void act(api.addMember(campaign.id, adding)); setAdding(''); }}>Add as player</button>
        </div>
        <p className="page-ref">Someone shows up in this list after they have signed in to the site with Discord once.</p>
      </section>

      <section className="card">
        <h2>Party</h2>
        {party.length === 0 && <p className="soft">Nobody yet. A character shows here once its player puts it in this campaign from the Crew page.</p>}
        {party.map((c) => (
          <div key={c.id} className="tracker">
            <div className="resource">
              <div>
                <div className="resource-name">{c.name}</div>
                <div className="page-ref">{[c.summary, `played by ${c.player}`].filter(Boolean).join(' · ')}</div>
              </div>
              <Link className="btn" to={`/sheet/${c.id}`}>Open sheet</Link>
            </div>
            {c.unreadable ? <p className="notice">This character’s numbers could not be worked out. Open the sheet to see why.</p> : (
              <div className="chips">
                <span className={c.hp <= 0 ? 'chip chip-lg chip-damage' : 'chip chip-lg'}>HP <strong className="num">{c.hp}</strong> / {c.maxHp}{c.tempHp ? ` +${c.tempHp}` : ''}</span>
                <span className="chip chip-lg">AC <strong className="num">{c.ac}</strong></span>
                <span className="chip chip-lg">Passive Perception <strong className="num">{c.passivePerception}</strong></span>
                <span className="chip chip-lg">Speed <strong className="num">{c.speed}</strong> ft</span>
                <span className="chip chip-lg">Bounty <strong className="num">{formatBerries(c.bounty)}</strong></span>
                {c.exhaustion > 0 && <span className="chip chip-lg chip-damage">Exhaustion {c.exhaustion}</span>}
                {c.conditions.map((name) => <span key={name} className="chip chip-lg chip-damage">{name}</span>)}
              </div>
            )}
          </div>
        ))}
        <p className="page-ref">As this campaign’s DM you can open and change any of these sheets. The numbers are as of when this page loaded; reload to refresh.</p>
      </section>

      <section className="card">
        <h2>Characters and Devil Fruits</h2>
        {fruitCount === 0 && <p className="notice">No Devil Fruits are loaded yet. On the mini PC run: npm run load-secret --workspace bot</p>}
        {characters.length === 0 && <p className="soft">No characters are in this campaign yet. Each player puts their own character in from the Crew page.</p>}
        {characters.map((c) => {
          const theirs = grants.filter((g) => g.characterId === c.id);
          return (
            <div key={c.id} className="tracker">
              <div className="resource">
                <div>
                  <div className="resource-name">{c.name}</div>
                  <div className="page-ref">{[c.summary, `played by ${ownerName(c.ownerId)}`].filter(Boolean).join(' · ')}</div>
                </div>
                <button className="btn btn-primary" onClick={() => setGranting(c)}>Grant a fruit</button>
              </div>
              {theirs.map((g) => (
                <div key={g.id} className="resource">
                  <div>
                    <div className="resource-name">{g.entry?.name ?? 'A fruit that is no longer loaded'}</div>
                    <div className="page-ref">{[g.kind === 'owner' ? 'Has the fruit' : 'Knows about it', g.entry?.book, g.note, g.revealed ? 'the table knows' : 'secret'].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="row wrap">
                    <button className={g.revealed ? 'btn btn-primary' : 'btn'} role="switch" aria-checked={g.revealed} aria-label={`${g.entry?.name ?? 'Fruit'} revealed to the table`} onClick={() => act(api.setRevealed(g.id, !g.revealed))}>
                      {g.revealed ? 'Revealed' : 'Reveal'}
                    </button>
                    <button className="btn" onClick={() => act(api.removeGrant(g.id))}>Take away</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {grants.filter((g) => !characters.some((c) => c.id === g.characterId)).map((g) => (
          <div key={g.id} className="resource">
            <div>
              <div className="resource-name">{g.entry?.name ?? 'A fruit that is no longer loaded'}</div>
              <div className="page-ref">Granted to a character that has since been taken out of this campaign. Its player can still read it until you take it away.</div>
            </div>
            <button className="btn btn-primary" onClick={() => act(api.removeGrant(g.id))}>Take away</button>
          </div>
        ))}
        <p className="page-ref">Until you reveal a fruit, the other players see only that the character has one. Taking a fruit away closes it to the player at once.</p>
      </section>

      <OptionalRulesCard campaign={campaign} api={api} />

      <section className="card">
        <h2>This campaign</h2>
        {!confirmDelete && <button className="btn" onClick={() => setConfirmDelete(true)}>Delete campaign…</button>}
        {confirmDelete && (
          <>
            <p className="notice">Deleting “{campaign.name}” removes its member list and every grant in it. Characters are kept and stay with their players.</p>
            <div className="row wrap">
              <button className="btn btn-damage" onClick={() => api.deleteCampaign(campaign.id).then(onGone, (e: Error) => setProblem(e.message))}>Delete it</button>
              <button className="btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
            </div>
          </>
        )}
      </section>

      {granting && (
        <GrantDialog
          character={granting}
          search={search}
          onGrant={(entryKey, kind, note) => api.grant({ campaignId: campaign.id, characterId: granting.id, entryKey, kind, note }).then(load)}
          onClose={() => setGranting(null)}
        />
      )}
    </>
  );
}

export function DmPage() {
  const { session, profile, isDm, name } = useAuth();
  const api = useMemo(() => (supabase ? campaignApi(supabase) : null), []);
  const userId = session?.user.id;
  const [campaigns, setCampaigns] = useState<(Campaign & { role: string })[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api || !userId) return;
    try {
      const mine = (await api.myCampaigns(userId)).filter((c) => c.role === 'dm');
      setCampaigns(mine);
      setOpen((now) => (now && mine.some((c) => c.id === now) ? now : mine[0]?.id ?? null));
    } catch (e) {
      setProblem((e as Error).message);
    }
  }, [api, userId]);
  useEffect(() => { void load(); }, [load]);

  const create = () => {
    if (!api || !newName.trim()) return;
    api.createCampaign(newName).then((made) => { setNewName(''); setOpen(made.id); return load(); }, (e: Error) => setProblem(e.message));
  };
  const current = campaigns?.find((c) => c.id === open);
  const runsAny = (campaigns?.length ?? 0) > 0;

  if (!session) return <section className="card"><h1>DM</h1><p>Sign in to see whether you are a DM.</p></section>;
  if (!profile) return <section className="card"><h1>DM</h1><p>Checking your profile…</p></section>;
  if (!isDm && !runsAny) {
    return (
      <section className="card">
        <h1>DM</h1>
        <p>
          You are signed in as a player. DM tools are only for the table's DM, or for someone a DM has made a DM of their
          campaign. {profile.discord_username
            ? <>If you are the table's DM, the bootstrap Discord username in the database does not match <strong>{profile.discord_username}</strong> yet; set it, then sign out and in again.</>
            : 'The table’s DM is set by Discord name, so an account with a username and password can only be made a DM of a campaign by its DM.'}
        </p>
      </section>
    );
  }
  return (
    <>
      <section className="card">
        <h1>DM</h1>
        <p className="soft">Signed in as {name}.</p>
        {problem && <p className="notice" role="alert">{problem}</p>}
        {campaigns && campaigns.length > 1 && (
          <label className="field">
            <span className="label">Campaign</span>
            <select value={open ?? ''} onChange={(e) => setOpen(e.target.value)}>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        {current && campaigns?.length === 1 && <h2>{current.name}</h2>}
        {campaigns?.length === 0 && <p>No campaign yet. Make one, then add your players to it.</p>}
        {isDm && (
          <div className="row wrap">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New campaign name" aria-label="New campaign name" maxLength={80} />
            <button className="btn btn-primary" disabled={!newName.trim()} onClick={create}>Create campaign</button>
          </div>
        )}
      </section>
      {isDm && <TableBackgroundCard />}
      {current && userId && <CampaignTools key={current.id} campaign={current} userId={userId} onGone={() => { setOpen(null); void load(); }} />}
    </>
  );
}
