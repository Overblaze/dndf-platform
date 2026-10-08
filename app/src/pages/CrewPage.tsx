import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { exactBerries } from '@dndf/engine';
import { campaignApi, type Campaign, type CampaignCharacter, type CrewMember, type Member, type TableFruit } from '../lib/campaigns';
import { WantedPoster } from '../sheet/Bounty';
import { supabase } from '../lib/supabase';

interface Crew { campaign: Campaign & { role: 'player' | 'dm' }; members: Member[]; fruits: TableFruit[] | null; crew: CrewMember[] | null }

/** The campaigns you are in: who is at the table, which of your characters sails with them, and who is known to have a Devil Fruit. */
export function CrewPage() {
  const { session, configured } = useAuth();
  const api = useMemo(() => (supabase ? campaignApi(supabase) : null), []);
  const userId = session?.user.id;
  const [crews, setCrews] = useState<Crew[] | null>(null);
  const [mine, setMine] = useState<CampaignCharacter[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api || !userId) return;
    try {
      const [campaigns, characters] = await Promise.all([api.myCampaigns(userId), api.myCharacters(userId)]);
      setMine(characters);
      setCrews(await Promise.all(campaigns.map(async (campaign) => ({
        campaign,
        members: await api.members(campaign.id),
        // Fruits arrive with a later migration; the crew list works without it.
        fruits: await api.tableFruits(campaign.id).catch(() => null),
        // Posters need one more database file (0005); without it this part says so.
        crew: await api.crew(campaign.id).catch(() => null),
      }))));
      setProblem(null);
    } catch (e) {
      setProblem((e as Error).message);
    }
  }, [api, userId]);
  useEffect(() => { void load(); }, [load]);

  if (!configured || !session) {
    return (
      <section className="card">
        <h1>Crew</h1>
        <p>Sign in with Discord to see your campaign and crewmates. Characters kept only on this device cannot join a campaign.</p>
      </section>
    );
  }
  const place = (character: CampaignCharacter, campaignId: string | null) => api!.setCharacterCampaign(character.id, campaignId).then(load, (e: Error) => setProblem(e.message));

  return (
    <>
      <section className="card">
        <h1>Crew</h1>
        {problem && <p className="notice" role="alert">{problem}</p>}
        {!crews && !problem && <p>Looking for your crew…</p>}
        {crews?.length === 0 && <p>You are not in a campaign yet. Your DM adds you from the DM page once you have signed in here; then come back to this page.</p>}
      </section>
      {crews?.map(({ campaign, members, fruits, crew }) => {
        const wanted = (crew ?? []).filter((c) => c.bounty !== null);
        const here = mine.filter((c) => c.campaignId === campaign.id);
        const elsewhere = mine.filter((c) => c.campaignId !== campaign.id);
        return (
          <section key={campaign.id} className="card">
            <h2>{campaign.name} <span className="chip">{campaign.role === 'dm' ? 'You are a DM' : 'Player'}</span></h2>
            <h3>At the table</h3>
            <p>{members.map((m) => `${m.name}${m.role === 'dm' ? ' (DM)' : ''}`).join(', ')}</p>

            <h3>Your characters</h3>
            {mine.length === 0 && <p className="soft">You have no characters saved to your account. <Link to="/sheet">Make one</Link> while signed in.</p>}
            {here.map((c) => (
              <div key={c.id} className="resource">
                <div>
                  <div className="resource-name">{c.name}</div>
                  <div className="page-ref">{c.summary} · in this campaign: the DM can open the sheet and grant it a Devil Fruit</div>
                </div>
                <button className="btn" onClick={() => place(c, null)}>Take out</button>
              </div>
            ))}
            {elsewhere.map((c) => (
              <div key={c.id} className="resource">
                <div>
                  <div className="resource-name">{c.name}</div>
                  <div className="page-ref">{c.summary}{c.campaignId ? ' · in another campaign' : ' · not in a campaign: only you can see it'}</div>
                </div>
                <button className="btn btn-primary" onClick={() => place(c, campaign.id)}>Put in this campaign</button>
              </div>
            ))}

            <h3>Wanted posters</h3>
            {crew === null && <p className="soft">Not set up yet: run supabase/migrations/0005_crew.sql in the Supabase SQL Editor.</p>}
            {crew?.length === 0 && <p className="soft">No characters are in this campaign yet.</p>}
            {crew && crew.length > 0 && (
              <>
                <p className="page-ref">Crew bounty: <strong className="num">{exactBerries(wanted.reduce((sum, c) => sum + (c.bounty ?? 0), 0))}</strong> across {wanted.length} poster{wanted.length === 1 ? '' : 's'}. A poster shows what its player last issued from their sheet’s Status tab.</p>
                <div className="posters">
                  {wanted.sort((a, b) => (b.bounty ?? 0) - (a.bounty ?? 0)).map((c) => (
                    <WantedPoster key={c.characterId} small name={c.name} poster={{ value: c.bounty!, epithet: c.epithet ?? undefined, terms: (c.terms as never) ?? undefined, at: c.issued ?? undefined }} />
                  ))}
                </div>
                {crew.filter((c) => c.bounty === null).length > 0 && (
                  <p className="page-ref">No poster yet: {crew.filter((c) => c.bounty === null).map((c) => `${c.name} (level ${c.level}, ${c.player})`).join(', ')}.</p>
                )}
              </>
            )}

            <h3>Devil Fruits at the table</h3>
            {fruits === null && <p className="soft">Not set up yet.</p>}
            {fruits?.length === 0 && <p className="soft">Nobody is known to have one.</p>}
            {fruits?.map((f) => (
              <div key={`${f.characterId}/${f.fruit ?? ''}`} className="resource">
                <div>
                  <div className="resource-name">{f.characterName}</div>
                  <div className="page-ref">{f.fruit ? `${f.fruit}${f.revealed ? '' : ' · the rest of the table does not know which'}` : 'has a Devil Fruit · unknown until it is revealed'}</div>
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}
