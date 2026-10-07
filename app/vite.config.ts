import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site from https://overblaze.github.io/dndf-platform/
  base: '/dndf-platform/',
  // .env.local sits at the repository root, next to .env.example
  envDir: '..',
  plugins: [react()],
});
