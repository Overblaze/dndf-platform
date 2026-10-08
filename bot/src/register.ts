// Tells Discord which slash commands the bot has, for the one server in bot.env. Run after
// changing slash.ts:  npm run register --workspace bot
import { REST, Routes } from 'discord.js';
import { loadEnv } from './env';
import { COMMANDS } from './slash';

const env = loadEnv();
const rest = new REST().setToken(env.DISCORD_BOT_TOKEN);
const done = (await rest.put(Routes.applicationGuildCommands(env.DISCORD_APP_ID, env.DISCORD_GUILD_ID), { body: COMMANDS })) as { name: string }[];
console.log(`Registered ${done.length} commands: ${done.map((c) => `/${c.name}`).join(' ')}`);
