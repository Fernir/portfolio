#!/usr/bin/env node
/**
 * Moves all `.wal` files under `public/q2/textures` (except the `flat` subfolder) into
 * `public/q2/textures/flat/`. BSP stem `urban/brick1_1` becomes file `urban__brick1_1.wal`.
 * Writes `public/q2/texture-flat-map.json` for the browser loader (BSP still uses slash paths).
 *
 * Run: `pnpm q2:textures:flatten` then `pnpm q2:textures:pack`
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const texRoot = path.join(repoRoot, 'public/q2/textures');
const FLAT_DIR = 'flat';
const flatRoot = path.join(texRoot, FLAT_DIR);
const mapPath = path.join(repoRoot, 'public/q2/texture-flat-map.json');

/** @param {string} stem */
function stemToFlatBase(stem) {
   return stem.replace(/\//g, '__');
}

/** @param {string} dir @param {string} rel */
function walkWalOutsideFlat(dir, rel = '') {
   /** @type {{ stem: string, abs: string }[]} */
   const out = [];
   if (!fs.existsSync(dir)) return out;
   for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === FLAT_DIR && rel === '') continue;
      const full = path.join(dir, ent.name);
      const sub = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) out.push(...walkWalOutsideFlat(full, sub));
      else if (ent.name.toLowerCase().endsWith('.wal')) {
         const stem = sub.slice(0, -4).replace(/\\/g, '/').toLowerCase();
         out.push({ stem, abs: full });
      }
   }
   return out;
}

function main() {
   if (!fs.existsSync(texRoot)) {
      console.error('missing', texRoot);
      process.exit(1);
   }

   const entries = walkWalOutsideFlat(texRoot);
   if (entries.length === 0) {
      console.log('nothing to flatten (only', FLAT_DIR, 'or empty)');
      process.exit(0);
   }

   /** @type {Record<string, string>} */
   const toFlatFile = {};
   if (fs.existsSync(mapPath)) {
      try {
         const prev = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
         if (prev && typeof prev.toFlatFile === 'object') {
            for (const [k, v] of Object.entries(prev.toFlatFile)) {
               const sk = k.trim().toLowerCase().replace(/\\/g, '/');
               if (sk && typeof v === 'string') toFlatFile[sk] = v;
            }
         }
      } catch {
         /* ignore */
      }
   }

   const usedFlat = new Set(Object.values(toFlatFile));

   for (const { stem } of entries) {
      let base = toFlatFile[stem];
      if (!base) {
         base = stemToFlatBase(stem);
         let suf = 0;
         let candidate = base;
         while (usedFlat.has(candidate)) {
            suf++;
            candidate = `${base}__${suf}`;
         }
         base = candidate;
      }
      usedFlat.add(base);
      toFlatFile[stem] = base;
   }

   fs.mkdirSync(flatRoot, { recursive: true });
   for (const { stem, abs } of entries) {
      const base = toFlatFile[stem];
      if (!base) continue;
      const dest = path.join(flatRoot, `${base}.wal`);
      fs.copyFileSync(abs, dest);
   }

   for (const { abs } of entries) {
      fs.unlinkSync(abs);
      let d = path.dirname(abs);
      while (d.startsWith(texRoot) && d !== texRoot && d !== flatRoot) {
         try {
            if (fs.readdirSync(d).length === 0) fs.rmdirSync(d);
            d = path.dirname(d);
         } catch {
            break;
         }
      }
   }

   const payload = {
      flatDir: FLAT_DIR,
      toFlatFile,
      generated: new Date().toISOString(),
   };
   fs.writeFileSync(mapPath, `${JSON.stringify(payload, null, 0)}\n`);
   console.log('wrote', mapPath, 'entries:', Object.keys(toFlatFile).length);
   console.log('flat dir:', flatRoot);
}

main();
