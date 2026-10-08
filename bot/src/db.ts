// The bot's view of the database. It holds the service-role key, which bypasses row-level
// security, so every function here takes the Discord user who asked and reaches only that
// user's characters (or, for the party, the campaigns that user belongs to).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeDoc, type CharacterDoc } from '@dndf/engine';
import type { Env } from './env';

export interface BotCharacter {
  id: string;
  doc: CharacterDoc;
  ownerId: string;
  campaignId: string | null;
  updatedAt: string;
}

interface Row { id: string; doc: unknown; owner_id: string; campaign_id: string | null; updated_at: string }
const fromRow = (row: Row): BotCharacter | null => {
  const doc = normalizeDoc(row.doc);
  return doc ? { id: row.id, doc, ownerId: row.owner_id, campaignId: row.campaign_id, updatedAt: row.updated_at } : null;
};

/** The character was changed by someone else between the bot reading it and writing it. */
export class ChangedElsewhere extends Error {
  constructor() {
    super('The character changed while the command was running.');
  }
}

export class Db {
  private readonly client: SupabaseClient;
  /** Discord user id → Supabase user id, for everyone who has signed in to the website with Discord. */
  private accounts = new Map<string, string>();
  private accountsReadAt = 0;

  constructor(env: Env) {
    this.client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  /** The website account of a Discord user, or null if they have never signed in there. */
  async accountOf(discordId: string): Promise<string | null> {
    const known = this.accounts.get(discordId);
    if (known) return known;
    // Someone who signed in a moment ago is not in the list yet: read it again, but not on every miss.
    if (Date.now() - this.accountsReadAt < 15_000) return null;
    this.accountsReadAt = Date.now();
    const mapped = new Set(this.accounts.values());
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await this.client.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`Could not read the accounts: ${error.message}`);
      for (const listed of data.users) {
        if (mapped.has(listed.id)) continue;
        // The list leaves identities out, and the profile fields that repeat the Discord id can be
        // edited by the user. The identity record is written by Supabase Auth from Discord itself.
        const identities = listed.identities ?? (await this.client.auth.admin.getUserById(listed.id)).data.user?.identities ?? [];
        const discord = identities.find((identity) => identity.provider === 'discord');
        const id = (discord?.identity_data?.provider_id ?? discord?.identity_data?.sub) as string | undefined;
        if (id) this.accounts.set(String(id), listed.id);
      }
      if (data.users.length < 200) break;
    }
    return this.accounts.get(discordId) ?? null;
  }

  /** The characters a Discord user owns, most recently changed first. */
  async charactersOf(discordId: string): Promise<BotCharacter[] | null> {
    const owner = await this.accountOf(discordId);
    if (!owner) return null;
    const { data, error } = await this.client.from('characters').select('id, doc, owner_id, campaign_id, updated_at').eq('owner_id', owner).order('updated_at', { ascending: false });
    if (error) throw new Error(`Could not read the characters: ${error.message}`);
    return (data as Row[]).flatMap((row) => fromRow(row) ?? []);
  }

  /** Writes a character the Discord user owns, with a History line holding it as it was before. */
  async save(discordId: string, character: BotCharacter, next: CharacterDoc, log: string): Promise<void> {
    const owner = await this.accountOf(discordId);
    if (!owner || owner !== character.ownerId) throw new Error('That character is not yours to change.');
    // Only if nobody has changed it since it was read: the website or a second command may have,
    // and writing this copy over theirs would lose their change.
    const { data, error } = await this.client.from('characters').update({ rules_version: next.rulesVersion, doc: next })
      .eq('id', character.id).eq('owner_id', owner).eq('updated_at', character.updatedAt).select('id');
    if (error) throw new Error(`Could not save: ${error.message}`);
    if (!data || data.length === 0) throw new ChangedElsewhere();
    // History is a courtesy: a failure here must not undo the change the player was just told about.
    await this.client.from('character_history').insert({ character_id: character.id, actor_id: owner, change: { summary: log, before: character.doc } });
  }

  /** Everyone's characters in the campaigns this Discord user belongs to, with their owners' names. */
  async partyOf(discordId: string): Promise<{ campaign: string; members: { character: BotCharacter; player: string }[] }[] | null> {
    const owner = await this.accountOf(discordId);
    if (!owner) return null;
    const { data: memberships, error } = await this.client.from('campaign_members').select('campaign_id, campaigns(name)').eq('user_id', owner);
    if (error) throw new Error(`Could not read the campaigns: ${error.message}`);
    const out = [];
    for (const m of (memberships ?? []) as unknown as { campaign_id: string; campaigns: { name: string } | null }[]) {
      const { data: rows, error: failed } = await this.client.from('characters').select('id, doc, owner_id, campaign_id, updated_at, profiles(display_name, discord_username)').eq('campaign_id', m.campaign_id);
      if (failed) throw new Error(`Could not read the party: ${failed.message}`);
      const members = ((rows ?? []) as unknown as (Row & { profiles: { display_name: string | null; discord_username: string | null } | null })[]).flatMap((row) => {
        const character = fromRow(row);
        return character ? [{ character, player: row.profiles?.display_name ?? row.profiles?.discord_username ?? 'someone' }] : [];
      });
      out.push({ campaign: m.campaigns?.name ?? 'Campaign', members });
    }
    return out;
  }
}
