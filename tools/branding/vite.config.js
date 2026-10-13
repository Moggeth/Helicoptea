// Dev server for the branding capture, with its own dependency cache so it never disturbs
// another checkout's server that shares node_modules.
import { defineConfig, mergeConfig } from 'vite';
import base from '../../vite.config.js';

export default mergeConfig(base, defineConfig({
  root: new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  cacheDir: 'node_modules/.vite-branding',
  server: { port: 5190, strictPort: true },
}));
