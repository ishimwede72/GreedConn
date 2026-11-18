/**
 * GREEDCON build script.
 *
 * Bundles:
 *   1. src/extension.ts   -> dist/extension.js   (VS Code extension host, CJS, `vscode` external)
 *   2. webview/app.ts     -> media/webview.js    (webview UI, IIFE)
 *   3. webview/app.css    -> media/webview.css   (pulled in via CSS imports from app.ts)
 *
 * Usage:
 *   node esbuild.js            # one-shot build
 *   node esbuild.js --watch    # watch mode
 *   node esbuild.js --dev      # unminified + sourcemaps (default in watch)
 */
'use strict';

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const argv = process.argv.slice(2);
const watch = argv.includes('--watch');
const dev = argv.includes('--dev') || watch;

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
  {
    entryPoints: [path.join(__dirname, 'src', 'extension.ts')],
    outfile: path.join(__dirname, 'dist', 'extension.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
    sourcemap: dev,
    minify: !dev,
    logLevel: 'info',
    legalComments: 'none',
    banner: {
      js: '// Greedcon extension bundle. Source: https://github.com/ishimwede72/GreedConn',
    },
  },
  {
    entryPoints: [path.join(__dirname, 'webview', 'app.ts')],
    outfile: path.join(__dirname, 'media', 'webview.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['chrome110', 'firefox115', 'safari16'],
    sourcemap: dev,
    minify: !dev,
    logLevel: 'info',
    legalComments: 'none',
    banner: {
      js: '// Greedcon webview bundle.',
    },
  },
];

async function run() {
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, 'media'), { recursive: true });

  if (watch) {
    const contexts = await Promise.all(builds.map((options) => esbuild.context(options)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('[greedcon] watching for changes...');
  } else {
    const start = Date.now();
    await Promise.all(builds.map((options) => esbuild.build(options)));
    console.log(`[greedcon] build finished in ${Date.now() - start}ms`);
  }
}

run().catch((error) => {
  console.error('[greedcon] build failed:', error);
  process.exit(1);
});
