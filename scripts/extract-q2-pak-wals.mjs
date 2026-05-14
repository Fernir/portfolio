#!/usr/bin/env node
/**
 * Extract Quake II `.wal` files from `.pak` archives into `public/q2/textures/...`
 * (dev / rebuild: run `pnpm q2:textures:pack` afterward; runtime loads `textures.pak` + API).
 *
 * Usage:
 *   pnpm extract:q2-textures
 *   node scripts/extract-q2-pak-wals.mjs --pak ./public/pak0.pak --pak ./public/pak1.pak --out ./public
 *
 * Default (no `--pak`): every `*.pak` under `public/`, sorted (`pak0` … `pak10` …),
 * processed in order — later archives overwrite same paths (Quake II-style).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/** All `.pak` files in `dir`, sorted for stable load order (numeric-friendly). */
function discoverPakFiles(dir) {
   if (!fs.existsSync(dir)) return [];
   return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.pak'))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
      .map((f) => path.join(dir, f));
}

function parseArgs() {
   /** @type {string[]} */
   let pakPaths = [];
   let outRoot = path.join(repoRoot, 'public');
   const argv = process.argv.slice(2);
   for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--pak') pakPaths.push(path.resolve(repoRoot, argv[++i] ?? ''));
      else if (a === '--out') outRoot = path.resolve(repoRoot, argv[++i] ?? '');
      else if (a === '--help' || a === '-h') {
         console.log(`Usage: node scripts/extract-q2-pak-wals.mjs [--pak path] ... [--out dir]

  --pak   Path to .pak (repeat for multiple; processed in order, later overwrites)
  --out   Root folder; entries written as <out>/<path inside pak> (default: public)

  With no --pak: scans public/*.pak (all archives), sorted by filename.`);
         process.exit(0);
      }
   }
   if (pakPaths.length === 0) {
      pakPaths = discoverPakFiles(path.join(repoRoot, 'public'));
      if (pakPaths.length === 0) {
         console.error('No .pak files found in public/. Add pak files or pass --pak path.');
         process.exit(1);
      }
      console.log(`Found ${pakPaths.length} pak(s): ${pakPaths.map((p) => path.basename(p)).join(', ')}`);
   }
   return { pakPaths, outRoot };
}

/** @returns {{ name: string, offset: number, size: number }[]} */
function readPakDirectory(buf) {
   if (buf.length < 12 || buf.subarray(0, 4).toString('ascii') !== 'PACK') {
      throw new Error('Not a Quake pak file (missing PACK magic)');
   }
   const diroff = buf.readUInt32LE(4);
   const dirlen = buf.readUInt32LE(8);
   const entryBytes = 64;
   if (dirlen % entryBytes !== 0) throw new Error(`Bad pak dir length ${dirlen}`);
   const n = dirlen / entryBytes;
   const out = [];
   for (let i = 0; i < n; i++) {
      const o = diroff + i * entryBytes;
      let z = o;
      while (z < o + 56 && buf[z]) z++;
      const name = buf.subarray(o, z).toString('latin1');
      const offset = buf.readUInt32LE(o + 56);
      const size = buf.readUInt32LE(o + 60);
      out.push({ name, offset, size });
   }
   return out;
}

function extractOnePak(pakPath, outRoot) {
   const buf = fs.readFileSync(pakPath);
   const entries = readPakDirectory(buf);
   const lower = (s) => s.toLowerCase();
   let written = 0;
   let skipped = 0;
   for (const e of entries) {
      const ln = lower(e.name);
      if (!ln.startsWith('textures/') || !ln.endsWith('.wal')) {
         skipped++;
         continue;
      }
      if (e.offset + e.size > buf.length) {
         console.warn(`Skip corrupt entry ${e.name}`);
         skipped++;
         continue;
      }
      const dest = path.join(outRoot, 'q2', ...e.name.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf.subarray(e.offset, e.offset + e.size));
      written++;
   }
   return { written, skipped };
}

function main() {
   const { pakPaths, outRoot } = parseArgs();
   const missing = pakPaths.filter((p) => !fs.existsSync(p));
   const existing = pakPaths.filter((p) => fs.existsSync(p));
   if (missing.length > 0) {
      console.warn(`Skipping missing pak(s) (${missing.length}):`);
      for (const m of missing) console.warn(`  ${m}`);
   }
   if (existing.length === 0) {
      console.error('No pak files found to extract.');
      process.exit(1);
   }

   let totalWal = 0;
   for (const pakPath of existing) {
      const { written, skipped } = extractOnePak(pakPath, outRoot);
      totalWal += written;
      console.log(`${path.basename(pakPath)}: wrote ${written} textures/*.wal (skipped ${skipped} other entries)`);
   }
   console.log(`Done — ${totalWal} WAL write(s) across ${existing.length} pak(s) → ${outRoot}`);
}

main();
