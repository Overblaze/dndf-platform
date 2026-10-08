// The bot's secrets, read from a file outside the repository. Values are never logged.
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const NAMES = ['DISCORD_BOT_TOKEN', 'DISCORD_APP_ID', 'DISCORD_GUILD_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
export type Env = Record<(typeof NAMES)[number], string>;

export const ENV_FILE = process.env.DNDF_BOT_ENV ?? join(homedir(), 'dndf', 'secret', 'bot.env');

export function loadEnv(file = ENV_FILE): Env {
  let text: string;
  try {
    // A secrets file other users can read is a mistake worth stopping for.
    if (statSync(file).mode & 0o077) throw new Error(`${file} can be read by other users. Run: chmod 600 ${file}`);
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`Could not read the bot's settings: ${(error as Error).message}`);
  }
  const found: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !line.trim().startsWith('#')) found[match[1]!] = match[2]!.replace(/^(["'])(.*)\1$/, '$2');
  }
  const missing = NAMES.filter((name) => !found[name] || found[name]!.startsWith('PASTE_'));
  if (missing.length) throw new Error(`${file} has no value for: ${missing.join(', ')}`);
  return found as Env;
}
