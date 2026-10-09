// The bot's view of the database. It holds the service-role key, which bypasses row-level
// security, so every function here takes the Discord user who asked and reaches only that
// user's characters (or, for the party, the campaigns that user belongs to).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NO_SECRETS, normalizeDoc, normalizeShip, sameDoc, type CharacterDoc, type RuleEntry, type Secrets, type ShipDoc } from '@dndf/engine';
import type { Env } from './env';
import type { Report, ReportKind } from './reports';

/** Change logs older than this are removed. Characters are never removed by the bot. */
export const HISTORY_DAYS = 90;

export interface BotCharacter {
  id: string;
  doc: CharacterDoc;
  /** The document exactly as the database held it when it was read, for telling a real change from none. */
  raw: unknown;
  ownerId: string;
  campaignId: string | null;
  updatedAt: string;
}

interface Row { id: string; doc: unknown; owner_id: string; campaign_id: string | null; updated_at: string }
const fromRow = (row: Row): BotCharacter | null => {
  const doc = normalizeDoc(row.doc);
  return doc ? { id: row.id, doc, raw: row.doc, ownerId: row.owner_id, campaignId: row.campaign_id, updatedAt: row.updated_at } : null;
};

export interface BotShip { id: string; doc: ShipDoc; ownerId: string; campaignId: string | null; campaign: string | null; updatedAt: string }

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
    if (!data || data.length === 0) {
      // Nothing was written. Read it again: a real change means stop; the same content (only the
      // time differs, or was written differently) means it is safe to write.
      const { data: now, error: failed } = await this.client.from('characters').select('doc').eq('id', character.id).eq('owner_id', owner).maybeSingle();
      if (failed) throw new Error(`Could not save: ${failed.message}`);
      if (!now) throw new Error('That character no longer exists.');
      if (!sameDoc((now as { doc: unknown }).doc, character.raw)) throw new ChangedElsewhere();
      const { error: again } = await this.client.from('characters').update({ rules_version: next.rulesVersion, doc: next }).eq('id', character.id).eq('owner_id', owner);
      if (again) throw new Error(`Could not save: ${again.message}`);
    }
    // History is a courtesy: a failure here must not undo the change the player was just told about.
    await this.client.from('character_history').insert({ character_id: character.id, actor_id: owner, change: { summary: log, before: character.doc } });
  }

  /**
   * Removes change logs older than HISTORY_DAYS. It names only the history table: a character is
   * never touched, and the database removes history when a character goes, not the other way round.
   * Returns how many lines were removed.
   */
  async pruneHistory(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await this.client.from('character_history').delete({ count: 'exact' }).lt('at', cutoff);
    if (error) throw new Error(`Could not tidy the history: ${error.message}`);
    return count ?? 0;
  }

  /**
   * The private content a character has been granted, for the sums (fruit charges that come back at dawn).
   * `open` says whether all of it has been revealed to the table: when it has not, nothing of it may be
   * shown in a message other players can read. With no grants, or before the tables exist, it is empty.
   */
  async secretsOf(characterId: string): Promise<{ secrets: Secrets; open: boolean }> {
    const none = { secrets: NO_SECRETS, open: true };
    const { data: grants, error } = await this.client.from('grants').select('entry_key, kind, revealed').eq('character_id', characterId);
    if (error || !grants?.length) return none;
    const keys = [...new Set(grants.map((g) => g.entry_key as string))];
    const [{ data: entries }, { data: advancements }] = await Promise.all([
      this.client.from('secret_entries').select('key, data').in('key', keys),
      this.client.from('secret_entries').select('data').eq('kind', 'fruitAdvancement'),
    ]);
    const granted = grants.flatMap((g) => {
      const entry = entries?.find((e) => e.key === g.entry_key)?.data as RuleEntry | undefined;
      return entry && typeof entry.id === 'string' ? [{ key: g.entry_key as string, kind: g.kind === 'knowledge' ? 'knowledge' as const : 'owner' as const, revealed: g.revealed === true, entry }] : [];
    });
    const held = granted.filter((g) => g.kind === 'owner');
    if (held.length === 0) return none;
    return { secrets: { granted, advancements: (advancements ?? []).map((a) => a.data as RuleEntry).filter((e) => e && typeof e.id === 'string') }, open: held.every((g) => g.revealed) };
  }

  /** The name a Discord user goes by on the website, for the ship's log. */
  async nameOf(discordId: string): Promise<string> {
    const owner = await this.accountOf(discordId);
    if (!owner) return 'someone';
    const { data } = await this.client.from('profiles').select('display_name, discord_username').eq('id', owner).maybeSingle();
    return (data?.display_name as string | null)?.trim() || (data?.discord_username as string | null)?.trim() || 'someone';
  }

  private static report(row: Record<string, unknown>): Report {
    return {
      id: String(row.id), createdAt: String(row.created_at), reporter: String(row.reporter ?? ''), kind: row.kind as ReportKind, message: String(row.message ?? ''),
      page: String(row.page ?? ''), appVersion: String(row.app_version ?? ''), device: String(row.device ?? ''), source: row.source as Report['source'], signedIn: row.user_id != null,
      status: row.status as Report['status'], doneAt: (row.done_at as string | null) ?? null, doneBy: (row.done_by as string | null) ?? null,
    };
  }

  /** Reports nobody has been shown yet, oldest first. */
  async newReports(limit = 10): Promise<Report[]> {
    const { data, error } = await this.client.from('reports').select('*').eq('status', 'new').order('created_at').limit(limit);
    if (error) throw new Error(`Could not read the reports: ${error.message}`);
    return (data ?? []).map((row) => Db.report(row));
  }

  /** Reports shown in the channel and not yet completed, oldest first. */
  async openReports(): Promise<Report[]> {
    const { data, error } = await this.client.from('reports').select('*').in('status', ['new', 'posted']).order('created_at').limit(200);
    if (error) throw new Error(`Could not read the reports: ${error.message}`);
    return (data ?? []).map((row) => Db.report(row));
  }

  /** A report is in the channel: remember which message it is. Only a report still new is taken, so two posts of one cannot both be kept. */
  async reportPosted(id: string, messageId: string): Promise<boolean> {
    const { data, error } = await this.client.from('reports').update({ status: 'posted', discord_message_id: messageId }).eq('id', id).eq('status', 'new').select('id');
    if (error) throw new Error(`Could not mark the report as posted: ${error.message}`);
    return (data ?? []).length === 1;
  }

  /** Completed, or open again. Gives the report as it now stands; null if there is no such report. */
  async reportDone(id: string, done: boolean, by: string, now = new Date()): Promise<Report | null> {
    const change = done ? { status: 'done', done_at: now.toISOString(), done_by: by.slice(0, 60) } : { status: 'posted', done_at: null, done_by: null };
    const { data, error } = await this.client.from('reports').update(change).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`Could not change the report: ${error.message}`);
    return data ? Db.report(data) : null;
  }

  /** A report sent with /report. It is tied to the sender's website account when there is one. */
  async addReport(discordId: string, reporter: string, kind: ReportKind, message: string): Promise<void> {
    const owner = await this.accountOf(discordId);
    const { error } = await this.client.from('reports').insert({ user_id: owner, reporter: reporter.slice(0, 60), kind, message: message.slice(0, 2000), source: 'discord' });
    if (error) throw new Error(`Could not save the report: ${error.message}`);
  }

  /**
   * The ships a Discord user may open: their own, and those put in a campaign they belong to. This is the
   * same rule the database applies to the website; it is repeated here because the bot's key bypasses it.
   * Ships shared with a campaign come first, then the most recently changed.
   */
  async shipsOf(discordId: string): Promise<BotShip[] | null> {
    const owner = await this.accountOf(discordId);
    if (!owner) return null;
    const { data: memberships, error: failed } = await this.client.from('campaign_members').select('campaign_id, campaigns(name)').eq('user_id', owner);
    if (failed) throw new Error(`Could not read the campaigns: ${failed.message}`);
    const campaigns = new Map(((memberships ?? []) as unknown as { campaign_id: string; campaigns: { name: string } | null }[]).map((m) => [m.campaign_id, m.campaigns?.name ?? 'Campaign']));
    const columns = 'id, doc, owner_id, campaign_id, updated_at';
    type ShipRow = { id: string; doc: unknown; owner_id: string; campaign_id: string | null; updated_at: string };
    const found = new Map<string, ShipRow>();
    const mine = await this.client.from('ships').select(columns).eq('owner_id', owner);
    if (mine.error) throw new Error(`Could not read the ships: ${mine.error.message}`);
    for (const row of (mine.data ?? []) as ShipRow[]) found.set(row.id, row);
    if (campaigns.size) {
      const shared = await this.client.from('ships').select(columns).in('campaign_id', [...campaigns.keys()]);
      if (shared.error) throw new Error(`Could not read the ships: ${shared.error.message}`);
      for (const row of (shared.data ?? []) as ShipRow[]) found.set(row.id, row);
    }
    return [...found.values()].flatMap((row) => {
      const doc = normalizeShip(row.doc);
      return doc ? [{ id: row.id, doc, ownerId: row.owner_id, campaignId: row.campaign_id, campaign: row.campaign_id ? campaigns.get(row.campaign_id) ?? null : null, updatedAt: row.updated_at }] : [];
    }).sort((a, b) => Number(Boolean(b.campaignId)) - Number(Boolean(a.campaignId)) || b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Writes a ship the Discord user may change, only if nobody has changed her since she was read. */
  async saveShip(discordId: string, ship: BotShip, next: ShipDoc): Promise<void> {
    const allowed = (await this.shipsOf(discordId))?.some((s) => s.id === ship.id);
    if (!allowed) throw new Error('That ship is not yours to change.');
    const { data, error } = await this.client.from('ships').update({ doc: next }).eq('id', ship.id).eq('updated_at', ship.updatedAt).select('id');
    if (error) throw new Error(`Could not save the ship: ${error.message}`);
    if (!data || data.length === 0) throw new ChangedElsewhere();
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
