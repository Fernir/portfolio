#!/usr/bin/env node
/**
 * Deletes `.wal` under `public/q2/textures` that are not needed for current BSPs.
 * Supports nested layout or single `flat/` layout via `public/q2/texture-flat-map.json`.
 *
 * Usage: node scripts/prune-q2-textures-for-bsps.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const mapsDir = path.join(repoRoot, 'public/q2/maps');
const texRoot = path.join(repoRoot, 'public/q2/textures');
const flatMapPath = path.join(repoRoot, 'public/q2/texture-flat-map.json');

const LUMP_TEXINFO = 5;

/** @param {ArrayBuffer} buf */
function collectTexStemsFromBsp(buf) {
   const dv = new DataView(buf);
   const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
   const ver = dv.getInt32(4, true);
   if (magic !== 'IBSP' || ver !== 38) return null;
   const lump = (idx) => {
      const o = 8 + idx * 8;
      return { ofs: dv.getInt32(o, true), len: dv.getInt32(o + 4, true) };
   };
   const texL = lump(LUMP_TEXINFO);
   if (texL.len < 76 || texL.ofs < 0) return [];
   const n = Math.floor(texL.len / 76);
   /** @type {Set<string>} */
   const stems = new Set();
   const texBase = texL.ofs;
   for (let ti = 0; ti < n; ti++) {
      const o = texBase + ti * 76 + 40;
      let s = '';
      for (let i = 0; i < 32; i++) {
         const c = dv.getUint8(o + i);
         if (c === 0) break;
         s += String.fromCharCode(c);
      }
      const stem = s.trim().toLowerCase().replace(/\\/g, '/').replace(/\.wal$/i, '');
      if (stem.length > 0) stems.add(stem);
   }
   return stems;
}

/** @param {string} dir @param {string[]} rels */
function walkWalFiles(dir, rels = []) {
   /** @type {string[]} */
   const out = [];
   if (!fs.existsSync(dir)) return out;
   for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walkWalFiles(full, [...rels, ent.name]));
      else if (ent.name.toLowerCase().endsWith('.wal')) out.push(full);
   }
   return out;
}

function loadFlatMap() {
   if (!fs.existsSync(flatMapPath)) return null;
   try {
      const j = JSON.parse(fs.readFileSync(flatMapPath, 'utf8'));
      if (!j || typeof j.flatDir !== 'string' || typeof j.toFlatFile !== 'object') return null;
      return j;
   } catch {
      return null;
   }
}

function main() {
   if (!fs.existsSync(mapsDir)) {
      console.error('missing', mapsDir);
      process.exit(1);
   }
   /** @type {Set<string>} */
   const allowed = new Set();
   const bsps = fs.readdirSync(mapsDir).filter((f) => f.toLowerCase().endsWith('.bsp'));
   for (const f of bsps) {
      const buf = fs.readFileSync(path.join(mapsDir, f)).buffer;
      const stems = collectTexStemsFromBsp(buf);
      if (!stems) {
         console.warn('skip non-IBSP38:', f);
         continue;
      }
      for (const s of stems) allowed.add(s);
   }
   console.log('maps:', bsps.join(', '));
   console.log('unique texture stems from BSPs:', allowed.size);

   const flatMap = loadFlatMap();
   /** @type {Set<string>} */
   const keepRel = new Set();
   for (const s of allowed) {
      const k = s.toLowerCase().replace(/\\/g, '/');
      if (flatMap && flatMap.toFlatFile[k]) {
         keepRel.add(`${flatMap.flatDir}/${flatMap.toFlatFile[k]}.wal`.toLowerCase());
      } else {
         keepRel.add(`${k}.wal`.toLowerCase());
      }
   }

   let removed = 0;
   let kept = 0;
   for (const abs of walkWalFiles(texRoot)) {
      const rel = path.relative(texRoot, abs).replace(/\\/g, '/').toLowerCase();
      if (keepRel.has(rel)) {
         kept++;
         continue;
      }
      fs.unlinkSync(abs);
      removed++;
      let d = path.dirname(abs);
      while (d.startsWith(texRoot) && d !== texRoot) {
         try {
            if (fs.readdirSync(d).length === 0) fs.rmdirSync(d);
            d = path.dirname(d);
         } catch {
            break;
         }
      }
   }
   console.log('textures kept', kept, 'removed', removed);
}

main();
