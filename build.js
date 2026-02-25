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

if (watch) {
  esbuild.context(buildConfig).then(ctx => {
    ctx.watch();
    console.log('Watching for changes...');
  }).catch(() => process.exit(1));
} else {
  esbuild.build(buildConfig).then(() => {
    if (!isProd) return;
    // Auto-inject content hash into index.html for cache busting
    const bundle = fs.readFileSync('dist/app.bundle.js');
    const hash = crypto.createHash('md5').update(bundle).digest('hex').slice(0, 8);
    const htmlPath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/app\.bundle\.js\?v=[^"]+/, `app.bundle.js?v=${hash}`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`Cache bust: app.bundle.js?v=${hash}`);
  }).catch(() => process.exit(1));
}
