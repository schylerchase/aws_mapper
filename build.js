#!/usr/bin/env node
// esbuild configuration for AWS Network Mapper
// Bundles ES modules into single IIFE for Electron app

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const isProd = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const isDev = !isProd;
const watch = process.argv.includes('--watch');

const buildConfig = {
  entryPoints: ['src/main.js'],
  bundle: true,
  outfile: 'dist/app.bundle.js',
  format: 'iife',
  globalName: 'AppBundle',
  minify: !isDev,
  sourcemap: isDev,
  target: 'es2020',
  platform: 'browser',
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  },
  logLevel: 'info'
};

// Process app-core.js (plain script, not an ES module — minify only)
async function buildCore() {
  const src = fs.readFileSync('src/app-core.js', 'utf8');
  if (isProd) {
    const result = await esbuild.transform(src, { minify: true, target: 'es2020' });
    fs.writeFileSync('dist/app-core.js', result.code);
  } else {
    fs.copyFileSync('src/app-core.js', 'dist/app-core.js');
  }
}

if (watch) {
  esbuild.context(buildConfig).then(ctx => {
    ctx.watch();
    console.log('Watching for changes...');
  }).catch(() => process.exit(1));

  // Also watch app-core.js and copy on change
  buildCore();
  fs.watch('src/app-core.js', () => {
    fs.copyFileSync('src/app-core.js', 'dist/app-core.js');
    console.log('  Copied app-core.js');
  });
} else {
  esbuild.build(buildConfig).then(async () => {
    await buildCore();

    if (!isProd) return;
    // Auto-inject content hashes into index.html for cache busting
    const bundleHash = crypto.createHash('md5').update(fs.readFileSync('dist/app.bundle.js')).digest('hex').slice(0, 8);
    const coreHash = crypto.createHash('md5').update(fs.readFileSync('dist/app-core.js')).digest('hex').slice(0, 8);
    const htmlPath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/app\.bundle\.js\?v=[^"]+/, `app.bundle.js?v=${bundleHash}`);
    html = html.replace(/app-core\.js\?v=[^"]+/, `app-core.js?v=${coreHash}`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`Cache bust: app.bundle.js?v=${bundleHash}, app-core.js?v=${coreHash}`);
  }).catch(() => process.exit(1));
}
