#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mainPath = path.join(root, 'web', 'app', 'main.js');
const fail = msg => { console.error(`[phase2/frontend-pages-fix] ERROR: ${msg}`); process.exit(1); };

if (!fs.existsSync(mainPath)) fail('web/app/main.js not found.');
let source = fs.readFileSync(mainPath, 'utf8').replace(/\r\n/g, '\n');

const bad = '    $, $, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, sleep,';
const good = '    $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, sleep,';

const badCount = source.split(bad).length - 1;
const goodCount = source.split(good).length - 1;

if (badCount === 0 && goodCount === 1) {
  console.log('[phase2/frontend-pages-fix] OK: main.js already has $, $$. Nothing to change.');
  process.exit(0);
}
if (badCount !== 1) fail(`Expected exactly one duplicate '$, $,' context, found ${badCount}.`);

source = source.replace(bad, good);
if (source.includes(bad)) fail('Duplicate key pattern still remains after replacement.');
if ((source.split(good).length - 1) !== 1) fail('Expected corrected $, $$ context exactly once.');

fs.writeFileSync(mainPath, source, 'utf8');
console.log('[phase2/frontend-pages-fix] fixed web/app/main.js: $, $, -> $, $$.');
console.log('[phase2/frontend-pages-fix] Next: npm run check && npm test && npm run build:web');
