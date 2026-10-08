// Campaigns, their members and characters, and the grants that open private content.
// Every call goes through row-level security: what comes back is only what this account may see.
import { deriveSheet, normalizeDoc } from '@dndf/engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ruleSet } from './rules';

export interface Campaign { id: string; name: string }
export interface Person { id: string; name: string }
export interface Member extends Person { role: 'player' | 'dm' }
export interface CampaignCharacter { id: string; name: string; ownerId: string; campaignId: string | null; summary: string }
export interface Grant {
  id: string;
  campaignId: string;
  characterId: string;
  entryKey: string;
  kind: 'owner' | 'knowledge';
  revealed: boolean;
  note: string | null;
  /** Name and book of what was granted, when this account may read it. */
  entry: { name: string; book: string } | null;
}
export interface SecretSummary { key: string; name: string; book: string }
export interface CrewMember { characterId: string; name: string; player: string; level: number; bounty: number | null; epithet: string | null; terms: string | null; issued: string | null }
/** A character as the DM sees it at a glance. */
export interface PartyMember { id: string; name: string; summary: string; player: string; hp: number; maxHp: number; tempHp: number; ac: number; passivePerception: number; speed: number; conditions: string[]; exhaustion: number; bounty: number; unreadable: boolean }
export interface TableFruit { characterId: string; characterName: string; revealed: boolean; fruit: string | null }

interface Failure { message: string; code?: string }
/** A database error in the table's words. A missing table means a migration has not been run yet. */
export function explain(error: Failure): Error {
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || /does not exist|could not find the (table|function)/i.test(error.message)) {
    return new Error('The database is missing a table this page needs. Run supabase/migrations/0003_secret_entries.sql in the Supabase SQL Editor.');
  }
  if (error.code === '23505') return new Error('That is already there.');
  if (error.code === '42501') return new Error('The database refused: this account is not allowed to do that.');
  return new Error(error.message);
}

const nameOf = (p: { discord_username?: string | null; display_name?: string | null }) => p.display_name?.trim() || p.discord_username?.trim() || 'Someone';

/** "Human (Standard) · Warrior 8", or a plain word when the saved character cannot be read. */
function summaryOf(raw: unknown): { name: string; summary: string } {
  const doc = normalizeDoc(raw);
  if (!doc) return { name: 'Unreadable character', summary: '' };
  try {
    return { name: doc.name, summary: deriveSheet(doc, ruleSet(doc.rulesVersion).rules).summary };
  } catch {
    return { name: doc.name, summary: '' };
  }
}

export function campaignApi(db: SupabaseClient) {
  const rows = async <T>(query: PromiseLike<{ data: unknown; error: Failure | null }>): Promise<T[]> => {
    const { data, error } = await query;
    if (error) throw explain(error);
    return (data ?? []) as T[];
  };
  const done = async (query: PromiseLike<{ error: Failure | null }>) => {
    const { error } = await query;
    if (error) throw explain(error);
  };
  const character = (r: { id: string; owner_id: string; campaign_id: string | null; doc: unknown }): CampaignCharacter => ({ id: r.id, ownerId: r.owner_id, campaignId: r.campaign_id, ...summaryOf(r.doc) });

  return {
    /** Campaigns this account is in, with its role in each. */
    async myCampaigns(userId: string): Promise<(Campaign & { role: 'player' | 'dm' })[]> {
      const mine = await rows<{ campaign_id: string; role: 'player' | 'dm' }>(db.from('campaign_members').select('campaign_id, role').eq('user_id', userId));
      if (mine.length === 0) return [];
      const found = await rows<Campaign>(db.from('campaigns').select('id, name').in('id', mine.map((m) => m.campaign_id)).order('name'));
      return found.map((c) => ({ ...c, role: mine.find((m) => m.campaign_id === c.id)?.role ?? 'player' }));
    },
    async createCampaign(name: string): Promise<Campaign> {
      const made = await rows<Campaign>(db.from('campaigns').insert({ name: name.trim() }).select('id, name'));
      if (!made[0]) throw new Error('The campaign was not created.');
      return made[0];
    },
    renameCampaign: (id: string, name: string) => done(db.from('campaigns').update({ name: name.trim() }).eq('id', id)),
    deleteCampaign: (id: string) => done(db.from('campaigns').delete().eq('id', id)),

    async members(campaignId: string): Promise<Member[]> {
      const list = await rows<{ user_id: string; role: 'player' | 'dm' }>(db.from('campaign_members').select('user_id, role').eq('campaign_id', campaignId));
      if (list.length === 0) return [];
      const people = await rows<{ id: string; discord_username: string | null; display_name: string | null }>(db.from('profiles').select('id, discord_username, display_name').in('id', list.map((m) => m.user_id)));
      return list.map((m) => ({ id: m.user_id, role: m.role, name: nameOf(people.find((p) => p.id === m.user_id) ?? {}) })).sort((a, b) => a.name.localeCompare(b.name));
    },
    /** Everyone who has signed in. Only a DM gets the whole list; a player gets the people they share a campaign with. */
    async people(): Promise<Person[]> {
      const list = await rows<{ id: string; discord_username: string | null; display_name: string | null }>(db.from('profiles').select('id, discord_username, display_name'));
      return list.map((p) => ({ id: p.id, name: nameOf(p) })).sort((a, b) => a.name.localeCompare(b.name));
    },
    addMember: (campaignId: string, userId: string) => done(db.from('campaign_members').insert({ campaign_id: campaignId, user_id: userId, role: 'player' })),
    setRole: (campaignId: string, userId: string, role: 'player' | 'dm') => done(db.from('campaign_members').update({ role }).eq('campaign_id', campaignId).eq('user_id', userId)),
    removeMember: (campaignId: string, userId: string) => done(db.from('campaign_members').delete().eq('campaign_id', campaignId).eq('user_id', userId)),

    /** The characters placed in a campaign. A DM sees all of them; a player only their own. */
    async characters(campaignId: string): Promise<CampaignCharacter[]> {
      return (await rows<Parameters<typeof character>[0]>(db.from('characters').select('id, owner_id, campaign_id, doc').eq('campaign_id', campaignId))).map(character).sort((a, b) => a.name.localeCompare(b.name));
    },
    async myCharacters(userId: string): Promise<CampaignCharacter[]> {
      return (await rows<Parameters<typeof character>[0]>(db.from('characters').select('id, owner_id, campaign_id, doc').eq('owner_id', userId))).map(character).sort((a, b) => a.name.localeCompare(b.name));
    },
    /** Put a character in a campaign, or take it out (null). Its owner can, for a campaign they are in. */
    setCharacterCampaign: (characterId: string, campaignId: string | null) => done(db.from('characters').update({ campaign_id: campaignId }).eq('id', characterId)),

    async grants(campaignId: string): Promise<Grant[]> {
      const list = await rows<{ id: string; campaign_id: string; character_id: string; entry_key: string; kind: 'owner' | 'knowledge'; revealed: boolean; note: string | null }>(
        db.from('grants').select('id, campaign_id, character_id, entry_key, kind, revealed, note').eq('campaign_id', campaignId).order('created_at'),
      );
      const keys = [...new Set(list.map((g) => g.entry_key))];
      const entries = keys.length ? await rows<SecretSummary>(db.from('secret_entries').select('key, name, book').in('key', keys)) : [];
      return list.map((g) => {
        const entry = entries.find((e) => e.key === g.entry_key);
        return { id: g.id, campaignId: g.campaign_id, characterId: g.character_id, entryKey: g.entry_key, kind: g.kind, revealed: g.revealed, note: g.note, entry: entry ? { name: entry.name, book: entry.book } : null };
      });
    },
    grant: (g: { campaignId: string; characterId: string; entryKey: string; kind: 'owner' | 'knowledge'; note?: string }) =>
      done(db.from('grants').insert({ campaign_id: g.campaignId, character_id: g.characterId, entry_key: g.entryKey, kind: g.kind, note: g.note?.trim() || null })),
    setRevealed: (grantId: string, revealed: boolean) => done(db.from('grants').update({ revealed }).eq('id', grantId)),
    removeGrant: (grantId: string) => done(db.from('grants').delete().eq('id', grantId)),

    /** Devil Fruits whose name contains the text. Only a DM gets any rows. */
    async searchFruits(text: string): Promise<SecretSummary[]> {
      const wanted = text.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
      let query = db.from('secret_entries').select('key, name, book').eq('kind', 'devilFruit');
      if (wanted) query = query.ilike('name', `%${wanted}%`);
      return rows<SecretSummary>(query.order('name').limit(40));
    },
    async secretCount(): Promise<number> {
      const { count, error } = await db.from('secret_entries').select('key', { count: 'exact', head: true }).eq('kind', 'devilFruit');
      if (error) throw explain(error);
      return count ?? 0;
    },
    /** The crew as its members may know it: names, levels, and the posters that have been issued. */
    async crew(campaignId: string): Promise<CrewMember[]> {
      const list = await rows<{ character_id: string; character_name: string; player_name: string; level: number; bounty: number | string | null; epithet: string | null; terms: string | null; issued: string | null }>(db.rpc('campaign_crew', { cid: campaignId }));
      return list.map((r) => ({ characterId: r.character_id, name: r.character_name, player: r.player_name, level: Number(r.level) || 0, bounty: r.bounty === null ? null : Number(r.bounty), epithet: r.epithet, terms: r.terms, issued: r.issued }));
    },
    /** Every character in a campaign with its numbers, for the campaign's DM (who may read them all). */
    async party(campaignId: string): Promise<PartyMember[]> {
      const list = await rows<{ id: string; owner_id: string; doc: unknown; profiles: { display_name: string | null; discord_username: string | null } | null }>(
        db.from('characters').select('id, owner_id, doc, profiles(display_name, discord_username)').eq('campaign_id', campaignId),
      );
      return list.map((row) => {
        const player = nameOf(row.profiles ?? {});
        const doc = normalizeDoc(row.doc);
        try {
          if (!doc) throw new Error('unreadable');
          const sheet = deriveSheet(doc, ruleSet(doc.rulesVersion).rules);
          return { id: row.id, name: sheet.name, summary: sheet.summary, player, hp: doc.state.hp, maxHp: sheet.maxHp.value, tempHp: doc.state.tempHp, ac: sheet.ac.value, passivePerception: sheet.passivePerception.value, speed: sheet.speed.value, conditions: doc.state.conditions, exhaustion: doc.state.exhaustion, bounty: sheet.wanted.value, unreadable: false };
        } catch {
          return { id: row.id, name: doc?.name ?? 'Unreadable character', summary: '', player, hp: 0, maxHp: 0, tempHp: 0, ac: 0, passivePerception: 0, speed: 0, conditions: [], exhaustion: 0, bounty: 0, unreadable: true };
        }
      }).sort((a, b) => a.name.localeCompare(b.name));
    },
    /** Who at the table has a Devil Fruit. The fruit's name comes back only when this account may know it. */
    async tableFruits(campaignId: string): Promise<TableFruit[]> {
      const list = await rows<{ character_id: string; character_name: string; revealed: boolean; entry_name: string | null }>(db.rpc('campaign_fruits', { cid: campaignId }));
      return list.map((f) => ({ characterId: f.character_id, characterName: f.character_name, revealed: f.revealed, fruit: f.entry_name }));
    },
  };
}
export type CampaignApi = ReturnType<typeof campaignApi>;
