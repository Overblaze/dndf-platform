// The /sheet PDF: the website's own print page, opened in a headless browser with the character
// put straight into that browser's storage. Nothing is fetched from the database by the page, so
// no login is involved and the PDF shows exactly what the Print button shows.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import type { CharacterDoc } from '@dndf/engine';

/** Where the website is served. The live site by default; a local preview for testing. */
export const SITE = (process.env.DNDF_SITE_URL ?? 'https://overblaze.github.io/dndf-platform/').replace(/\/?$/, '/');

/** The headless Chromium that Playwright downloaded for this user, newest first. */
function findBrowser(): string {
  if (process.env.DNDF_CHROMIUM) return process.env.DNDF_CHROMIUM;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const candidates = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('chromium')).sort().reverse() : [];
  for (const dir of candidates) {
    for (const path of [join(cache, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'), join(cache, dir, 'chrome-linux64', 'chrome'), join(cache, dir, 'chrome-linux', 'chrome')]) {
      if (existsSync(path)) return path;
    }
  }
  throw new Error('No Chromium found for making PDFs. Run: npx playwright install chromium-headless-shell');
}

let browser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) browser = await chromium.launch({ executablePath: findBrowser() });
  return browser;
}
export const closeBrowser = async () => { await browser?.close(); browser = null; };

/** The character as an A4 PDF, with or without the text of each feature. */
export async function sheetPdf(doc: CharacterDoc, withText: boolean): Promise<Buffer> {
  const context = await (await getBrowser()).newContext({ viewport: { width: 900, height: 1200 } });
  try {
    const id = 'local-discord';
    // The website keeps signed-out characters under this key; the print page reads from it.
    await context.addInitScript(([key, value]) => { try { localStorage.setItem(key!, value!); } catch { /* storage refused */ } },
      ['dndf.characters.v1', JSON.stringify({ [id]: { id, doc, updatedAt: new Date().toISOString() } })]);
    const page = await context.newPage();
    await page.goto(`${SITE}#/print/${id}${withText ? '' : '?text=0'}`, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForSelector('.paper', { timeout: 20_000 });
    await page.emulateMedia({ media: 'print' });
    return await page.pdf({ format: 'A4', printBackground: false });
  } finally {
    await context.close();
  }
}
