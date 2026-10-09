import { NO_CAMPAIGN_SETTINGS } from '@dndf/engine';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: null }));
const { fetchCharacterSettings, keepSettings, keptSettings } = await import('./campaignRules');

const store = () => {
  const kept = new Map<string, string>();
  return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k), kept };
};

describe('a character’s campaign rules, remembered on the device', () => {
  it('nothing known is a character in no campaign: all four optional rules off', () => {
    expect(keptSettings('c1', store())).toEqual(NO_CAMPAIGN_SETTINGS);
    expect(NO_CAMPAIGN_SETTINGS).toMatchObject({ specialReactions: false, hakiPurist: false, dreamPoints: false, healingSurge: false });
  });

  it('keeps what the campaign had on, per character, for the next visit and for no connection', () => {
    const storage = store();
    keepSettings('c1', { dreamPoints: true, healingSurge: true }, storage);
    expect(keptSettings('c1', storage)).toMatchObject({ dreamPoints: true, healingSurge: true, specialReactions: false, hakiPurist: false });
    expect(keptSettings('c2', storage)).toEqual(NO_CAMPAIGN_SETTINGS);
    // Taken out of the campaign: forgotten.
    keepSettings('c1', null, storage);
    expect(keptSettings('c1', storage)).toEqual(NO_CAMPAIGN_SETTINGS);
  });

  it('a damaged value is read as nothing known', () => {
    expect(keptSettings('c1', { getItem: () => '{not json' })).toEqual(NO_CAMPAIGN_SETTINGS);
    expect(keptSettings('c1', { getItem: () => '"dreamPoints"' })).toEqual(NO_CAMPAIGN_SETTINGS);
    expect(keptSettings('c1', { getItem: () => { throw new Error('off'); } })).toEqual(NO_CAMPAIGN_SETTINGS);
  });

  it('a copy of the site with no database has no campaign to ask', async () => {
    expect(await fetchCharacterSettings('c1')).toEqual({ found: false, raw: null, campaign: null });
  });
});
