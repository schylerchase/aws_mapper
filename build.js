#!/usr/bin/env node
// esbuild configuration for AWS Network Mapper
// Bundles ES modules into single IIFE for Electron app

const esbuild = require('esbuild');
const path = require('path');

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
  esbuild.build(buildConfig).catch(() => process.exit(1));
}
