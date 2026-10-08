import { describe, expect, it } from 'vitest';
import { campaignApi, explain } from './campaigns';

describe('campaign data', () => {
  it('says which migration to run when a table or function is missing, in whichever way the database reports it', () => {
    for (const error of [{ code: '42P01', message: 'relation "public.grants" does not exist' }, { code: 'PGRST205', message: "Could not find the table 'public.grants' in the schema cache" }, { code: 'PGRST202', message: 'Could not find the function public.campaign_fruits' }]) {
      expect(explain(error).message).toMatch(/0003_secret_entries\.sql/);
    }
    expect(explain({ code: '23505', message: 'duplicate key value' }).message).toBe('That is already there.');
    expect(explain({ code: '42501', message: 'new row violates row-level security policy' }).message).toMatch(/not allowed/);
    expect(explain({ message: 'network down' }).message).toBe('network down');
  });

  it('searching for a fruit treats % and _ as letters, and asks only for names and books', async () => {
    const asked: unknown[][] = [];
    const query: Record<string, unknown> = {};
    for (const step of ['select', 'eq', 'ilike', 'order', 'limit']) query[step] = (...args: unknown[]) => { asked.push([step, ...args]); return query; };
    query.then = (resolve: (v: unknown) => void) => resolve({ data: [{ key: 'k', name: 'N', book: 'B' }], error: null });
    const api = campaignApi({ from: (table: string) => { asked.push(['from', table]); return query; } } as never);
    expect(await api.searchFruits(' 100%_fruit ')).toEqual([{ key: 'k', name: 'N', book: 'B' }]);
    expect(asked).toEqual([['from', 'secret_entries'], ['select', 'key, name, book'], ['eq', 'kind', 'devilFruit'], ['ilike', 'name', '%100\\%\\_fruit%'], ['order', 'name'], ['limit', 40]]);
  });
});
