// src/ui/main.js を web/app.js（IIFE 1ファイル）にまとめる
import { build } from 'esbuild';
import { buildFonts } from './fonts.mjs';

buildFonts();

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: ['src/ui/main.js'],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'chrome100', 'firefox100', 'safari15'],
  outfile: 'web/app.js',
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'info',
};

if (watch) {
  const { context } = await import('esbuild');
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
