// A hand check, not part of the test suite: npx tsx bot/test/db-smoke.ts
// Prints counts only: how many website accounts are linked to a Discord user, and how many characters they hold.
import { Db } from '../src/db';
import { loadEnv } from '../src/env';

const db = new Db(loadEnv());
await db.accountOf('0'); // nobody has this id; it makes the bot read the account list
const linked = [...(db as unknown as { accounts: Map<string, string> }).accounts.keys()];
console.log(`website accounts linked to a Discord user: ${linked.length}`);
for (const discordId of linked) {
  const characters = await db.charactersOf(discordId);
  const party = await db.partyOf(discordId);
  console.log(`  Discord user …${discordId.slice(-4)}: ${characters?.length ?? 0} character(s), ${party?.length ?? 0} campaign(s)`);
}
console.log('unknown Discord user →', await db.charactersOf('1'));
