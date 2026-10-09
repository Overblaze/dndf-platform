import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Writes dist/sw.js from sw.template.js once the build is done, with the list of every file the
 * build produced, so the service worker can keep the whole app on the device for use offline.
 * The version is a hash of those files' names and sizes: a new build is a new version.
 */
function serviceWorker(): Plugin {
  let out = 'dist';
  return {
    name: 'dndf-service-worker',
    apply: 'build',
    configResolved(config) { out = config.build.outDir; },
    closeBundle() {
      const root = join(import.meta.dirname, out);
      const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [relative(root, path).split('\\').join('/')];
      });
      const files = walk(root).filter((file) => file !== 'sw.js' && !file.endsWith('.map')).sort();
      const version = createHash('sha256').update(files.map((file) => `${file}:${statSync(join(root, file)).size}`).join('|')).digest('hex').slice(0, 12);
      const template = readFileSync(join(import.meta.dirname, 'sw.template.js'), 'utf8');
      writeFileSync(join(root, 'sw.js'), template.replace("'__VERSION__'", JSON.stringify(version)).replace('__FILES__', JSON.stringify(files)));
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the site from https://overblaze.github.io/dndf-platform/
  base: '/dndf-platform/',
  // .env.local sits at the repository root, next to .env.example
  envDir: '..',
  plugins: [react(), serviceWorker()],
});
