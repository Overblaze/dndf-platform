import { describe, expect, it } from 'vitest';
import { DEFAULT_BACKGROUND, TABLE_BACKGROUND, presetChoice, selectedSwatch, showsTablePicture } from './backgrounds';

const picture = 'https://example.supabase.co/storage/v1/object/public/app-background/a.jpg';

describe('the table’s background and a character’s own', () => {
  it('the table’s picture shows only where there is one and the character has chosen nothing', () => {
    expect(showsTablePicture(undefined, picture)).toBe(true);
    expect(showsTablePicture(undefined, null)).toBe(false);
    expect(showsTablePicture({ kind: 'preset' }, picture)).toBe(false);
    expect(showsTablePicture({ kind: 'image' }, picture)).toBe(false);
  });

  it('with no table picture, choosing the plain sea chart saves nothing, as before', () => {
    expect(presetChoice(DEFAULT_BACKGROUND, null)).toBeUndefined();
    expect(presetChoice('sea', null)).toEqual({ kind: 'preset', id: 'sea' });
    expect(selectedSwatch(undefined, null)).toBe(DEFAULT_BACKGROUND);
  });

  it('with one, the sea chart is a choice of its own and nothing chosen is the table’s picture', () => {
    expect(presetChoice(DEFAULT_BACKGROUND, picture)).toEqual({ kind: 'preset', id: DEFAULT_BACKGROUND });
    expect(presetChoice(TABLE_BACKGROUND, picture)).toBeUndefined();
    expect(selectedSwatch(undefined, picture)).toBe(TABLE_BACKGROUND);
    expect(selectedSwatch({ kind: 'preset', id: DEFAULT_BACKGROUND }, picture)).toBe(DEFAULT_BACKGROUND);
    expect(selectedSwatch({ kind: 'preset', id: 'night' }, picture)).toBe('night');
    // A picture of the player's own lights no swatch.
    expect(selectedSwatch({ kind: 'image' }, picture)).toBeNull();
    // "Remove picture" goes back to whatever the default is.
    expect(presetChoice(TABLE_BACKGROUND, null)).toBeUndefined();
  });
});
