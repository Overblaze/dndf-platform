// The optional rules a character has: Special Reactions, Haki Purist, Dream Points, I Won't Abandon My
// Dreams and Healing Surge are
// switched on by a campaign's DM. A character gets them only in a campaign where they are on; one in no
// campaign (or kept only in this browser) has none.
import { NO_CAMPAIGN_SETTINGS, campaignSettings, type CampaignSettings } from '@dndf/engine';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const KEPT = 'dndf.campaign-rules.';

/** What was last known for a character, so the sheet is right at once and with no connection. */
export function keptSettings(characterId: string, storage: Pick<Storage, 'getItem'> = localStorage): CampaignSettings {
  try {
    const kept = storage.getItem(KEPT + characterId);
    return kept ? campaignSettings(JSON.parse(kept)) : NO_CAMPAIGN_SETTINGS;
  } catch {
    return NO_CAMPAIGN_SETTINGS;
  }
}

export function keepSettings(characterId: string, raw: unknown, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage): void {
  try {
    if (raw && typeof raw === 'object') storage.setItem(KEPT + characterId, JSON.stringify(raw));
    else storage.removeItem(KEPT + characterId);
  } catch {
    // Storage switched off: asked again next time.
  }
}

/** The settings of the campaign a character is in, as saved; null when it is in none (or the campaign cannot be read). */
export async function fetchCharacterSettings(characterId: string): Promise<{ found: boolean; raw: unknown; campaign: string | null }> {
  if (!supabase) return { found: false, raw: null, campaign: null };
  const { data, error } = await supabase.from('characters').select('campaign_id, campaigns(name, settings)').eq('id', characterId).maybeSingle();
  if (error || !data) return { found: false, raw: null, campaign: null };
  const joined = (Array.isArray(data.campaigns) ? data.campaigns[0] : data.campaigns) as { name?: string; settings?: unknown } | null;
  return { found: true, raw: joined?.settings ?? null, campaign: joined?.name ?? null };
}

/**
 * A character's campaign settings, and the campaign's name. Read when the sheet opens and each time
 * the tab comes back, so a switch the DM flips at the table shows without reloading.
 */
export function useCampaignSettings(local: boolean, characterId: string): { settings: CampaignSettings; campaign: string | null } {
  const [state, setState] = useState<{ settings: CampaignSettings; campaign: string | null }>(() => ({ settings: local ? NO_CAMPAIGN_SETTINGS : keptSettings(characterId), campaign: null }));
  useEffect(() => {
    if (local || !supabase) {
      setState({ settings: NO_CAMPAIGN_SETTINGS, campaign: null });
      return;
    }
    setState({ settings: keptSettings(characterId), campaign: null });
    let current = true;
    const read = () => {
      if (document.visibilityState !== 'visible') return;
      void fetchCharacterSettings(characterId).then((got) => {
        // No answer (offline): what was known stays.
        if (!current || !got.found) return;
        keepSettings(characterId, got.raw);
        setState((now) => {
          const settings = campaignSettings(got.raw);
          return JSON.stringify(now.settings) === JSON.stringify(settings) && now.campaign === got.campaign ? now : { settings, campaign: got.campaign };
        });
      });
    };
    read();
    document.addEventListener('visibilitychange', read);
    return () => {
      current = false;
      document.removeEventListener('visibilitychange', read);
    };
  }, [local, characterId]);
  return state;
}
