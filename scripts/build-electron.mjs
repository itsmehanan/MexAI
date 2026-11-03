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
