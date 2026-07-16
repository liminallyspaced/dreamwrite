/**
 * Build — esbuild bundles the renderer into src/bundle.js.
 *
 *   node build.js          one-shot build
 *   node build.js --watch  rebuild on change
 *
 * Deliberately minimal. The app loads bundle.js as a classic script (CSP is
 * script-src 'self'), so format:'iife' — not ESM, which file:// blocks anyway.
 * That's the reason a bundler exists here at all. See ADR-0006 / roadmap Phase 0.
 */
const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/renderer.js'],
  bundle: true,
  outfile: 'src/bundle.js',
  format: 'iife',
  platform: 'browser',
  target: ['chrome128'], // Electron 33 ships Chromium 128
  sourcemap: !isProd,
  minify: isProd,
  logLevel: 'info',
  // Fail loudly rather than shipping a half-built bundle.
  logLimit: 0,
};

async function main() {
  if (isWatch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[build] watching src/ …');
  } else {
    await esbuild.build(options);
    console.log(`[build] wrote src/bundle.js${isProd ? ' (minified)' : ''}`);
  }
}

main().catch((err) => {
  console.error('[build] failed:', err);
  process.exit(1);
});
