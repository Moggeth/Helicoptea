import { defineConfig } from 'vite';
import { flightLogPlugin } from './tools/flight-log-plugin.js';

export default defineConfig({
  base: './',
  plugins: [flightLogPlugin()],   // /api/flights: saves recorded flights and notes to logs/flights/
  server: { port: 5178, strictPort: true },
  preview: { port: 4178, strictPort: true },
  build: { target: 'es2020', outDir: 'dist', chunkSizeWarningLimit: 4000, sourcemap: true },
});
