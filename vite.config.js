import { defineConfig } from 'vite';
import { flightLogPlugin } from './tools/flight-log-plugin.js';
import { execFileSync } from 'node:child_process';

let buildId = 'unknown';
try {
  buildId = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()) buildId += '-dirty';
} catch { /* source archives can still build without Git */ }

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [flightLogPlugin()],   // /api/flights: saves recorded flights and notes to logs/flights/
  server: { port: 5178, strictPort: true },
  preview: { port: 4178, strictPort: true },
  build: {
    target: 'es2020', outDir: 'dist', chunkSizeWarningLimit: 4000, sourcemap: true,
    // Engine code changes much less often than the game. Stable content hashes let repeat visitors
    // reuse Three/Rapier across game releases instead of downloading the embedded WASM every time.
    rollupOptions: { output: { manualChunks(id) {
      const path = id.replaceAll('\\', '/');
      if (path.includes('/node_modules/@dimforge/')) return 'physics';
      if (path.includes('/node_modules/three/')) return 'graphics';
    } } },
  },
});
