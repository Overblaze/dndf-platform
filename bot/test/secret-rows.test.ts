// The shape of a private row, with made-up entries. No real private content is in the repository.
import { describe, expect, it } from 'vitest';
import { audienceOf, secretRow, secretRows } from '../src/secret-rows';

const fruit = (id: string, book: string) => ({ id, kind: 'devilFruit', name: 'Test Fruit', source: { book, page: 1 }, features: [] });

describe('private rows', () => {
  it('a Devil Fruit is keyed by its id and its book, and opens only by grant', () => {
    expect(secretRow(fruit('devilFruit.test', 'Expanded Devil Fruit Encyclopedia v1.2'), 'fruits_a.json')).toMatchObject({
      key: 'devilFruit.test@expanded-devil-fruit-encyclopedia-v1-2', id: 'devilFruit.test', kind: 'devilFruit', book: 'Expanded Devil Fruit Encyclopedia v1.2', audience: 'grant', versions: [],
    });
  });

  it('the same fruit from two books is two rows; the same fruit twice in one book is kept once and reported', () => {
    const { rows, clashes } = secretRows([
      { file: 'a.json', entries: [fruit('devilFruit.test', 'Book One'), fruit('devilFruit.test', 'Book One')] },
      { file: 'b.json', entries: [fruit('devilFruit.test', 'Book Two')] },
    ]);
    expect(rows.map((r) => r.key)).toEqual(['devilFruit.test@book-one', 'devilFruit.test@book-two']);
    expect(clashes).toEqual(['devilFruit.test@book-one (again in a.json)']);
  });

  it('who may read what: fruits by grant, fruit advancements by holding a fruit, the rest DM-only', () => {
    expect(audienceOf('devilFruit', 'fruits_handbook_v88.json')).toBe('grant');
    expect(audienceOf('fruitAdvancement', 'fruit_advancements_v10.json')).toBe('holders');
    expect(audienceOf('rule', 'encyclopedia_fruit_rules.json')).toBe('holders');
    expect(audienceOf('rule', 'dm_chapter_v10.json')).toBe('dm');
    expect(audienceOf('rule', 'fruit_generation_v10.json')).toBe('dm');
    expect(audienceOf('rule', 'encyclopedia_fruit_generation.json')).toBe('dm');
    // anything unrecognised is DM-only, never open by accident
    expect(audienceOf('somethingNew', 'new_file.json')).toBe('dm');
    expect(audienceOf('rule', 'anything_else.json')).toBe('dm');
  });

  it('an entry with no id, kind or book is left out and counted, never guessed at', () => {
    const { rows, skipped } = secretRows([{ file: 'x.json', entries: [{ kind: 'devilFruit' }, { id: 'a' }, { id: 'b', kind: 'rule' }, { id: 'c', kind: 'rule', source: { book: 'B' }, versions: ['dndf-10', 7] }] }]);
    expect(skipped).toEqual(['x.json: no id', 'x.json: a: no kind', 'x.json: b: no source book']);
    expect(rows).toEqual([expect.objectContaining({ key: 'c@b', name: 'c', versions: ['dndf-10'], audience: 'dm' })]);
  });
});
