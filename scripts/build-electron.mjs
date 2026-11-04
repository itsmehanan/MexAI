import { build } from 'esbuild';

// Bundle the existing Express server for Electron's Node utility process. Vite is
// only needed by the development branch and must not be bundled into the app.
await build({
  entryPoints: ['server.ts'],
  outfile: 'dist-electron/server.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['vite'],
  // Preserve the server's ESM entry-point check and __dirname in a CommonJS bundle.
  define: { 'import.meta.url': '__electronServerUrl' },
  banner: {
    js: 'const __electronServerUrl = require("node:url").pathToFileURL(__filename).href;',
  },
  logLevel: 'info',
});

// The installed app has no node_modules, so ship the updater and its runtime
// dependencies as a self-contained bundle alongside the server.
await build({
  entryPoints: ['scripts/updater-entry.cjs'],
  outfile: 'dist-electron/updater.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  logLevel: 'info',
});
