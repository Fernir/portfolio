#!/usr/bin/env node
/**
 * Собирает имена текстур из всех `public/q2/maps/*.bsp` (IBSP v38, lump texinfo)
 * и скачивает отсутствующие `.wal` с зеркала baseq2 (tastyspleen):
 *   https://tastyspleen.net/~quake2/baseq2/textures/<path>.wal
 *
 * Usage: `pnpm sync:q2-bsp-wals`
 *
 * If `public/q2/texture-flat-map.json` exists (after `pnpm q2:textures:flatten`), new WALs are written under `textures/<flatDir>/`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const LUMP_TEXINFO = 5;
/** Prefer HTTPS; fall back to HTTP if needed. */
const REMOTE_TEXTURE_BASES = [
   'https://tastyspleen.net/~quake2/baseq2/textures',
   'http://tastyspleen.net/~quake2/baseq2/textures',
];

const FETCH_HEADERS = {
   'User-Agent': 'Mozilla/5.0 (compatible; port-q2-wal-sync/1.0; +https://github.com/)',
   Accept: '*/*',
};

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
   return [...stems];
}

const flatMapPath = path.join(repoRoot, 'public/q2/texture-flat-map.json');

function normalizeStemSync(s) {
   return s.trim().toLowerCase().replace(/\\/g, '/').replace(/\.wal$/i, '');
}

function loadFlatMapSync() {
   if (!fs.existsSync(flatMapPath)) return null;
   try {
      const j = JSON.parse(fs.readFileSync(flatMapPath, 'utf8'));
      if (!j || typeof j.flatDir !== 'string' || !j.toFlatFile || typeof j.toFlatFile !== 'object') return null;
      return j;
   } catch {
      return null;
   }
}

function localWalPath(texDir, stem, flatMap) {
   const k = normalizeStemSync(stem);
   if (flatMap?.toFlatFile[k]) {
      return path.join(texDir, flatMap.flatDir, `${flatMap.toFlatFile[k]}.wal`);
   }
   return path.join(texDir, `${k}.wal`);
}

function remoteWalUrls(stem) {
   const seg = stem.split('/').map(encodeURIComponent).join('/');
   return REMOTE_TEXTURE_BASES.map((base) => `${base}/${seg}.wal`);
}

/** @returns {Record<string, string>} map stem → remote stem on tastyspleen */
function loadWalAliases() {
   const p = path.join(__dirname, 'q2-tastyspleen-wal-aliases.json');
   if (!fs.existsSync(p)) return {};
   try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      /** @type {Record<string, string>} */
      const out = {};
      for (const [k, v] of Object.entries(j)) {
         if (k.startsWith('_')) continue;
         if (typeof v !== 'string') continue;
         const key = k.trim().toLowerCase().replace(/\\/g, '/').replace(/\.wal$/i, '');
         const val = v.trim().toLowerCase().replace(/\\/g, '/').replace(/\.wal$/i, '');
         if (key && val) out[key] = val;
      }
      return out;
   } catch {
      return {};
   }
}

/** Try URLs for `remoteStem`; on success write bytes to `outPath` (BSP-local name). */
async function tryFetchToPath(remoteStem, outPath) {
   let lastStatus = 'fail';
   for (const url of remoteWalUrls(remoteStem)) {
      let res;
      try {
         res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' });
      } catch (e) {
         lastStatus = `fail net ${/** @type {Error} */ (e).message}`;
         continue;
      }
      if (!res.ok) {
         lastStatus = `fail ${res.status}`;
         continue;
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 64) {
         lastStatus = 'fail small';
         continue;
      }
      const head = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
      if (head[0] === 0x3c) {
         lastStatus = 'fail html';
         continue;
      }
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, Buffer.from(buf));
      return 'ok';
   }
   return lastStatus;
}

/** @param {Record<string, string>} aliases @param {ReturnType<typeof loadFlatMapSync>} flatMap */
async function downloadIfMissing(stem, texDir, aliases, flatMap) {
   const out = localWalPath(texDir, stem, flatMap);
   if (fs.existsSync(out)) {
      const st = fs.statSync(out);
      if (st.size > 64) return 'skip';
   }
   let r = await tryFetchToPath(stem, out);
   if (r === 'ok') return 'ok';
   const alt = aliases[stem];
   if (alt && alt !== stem) {
      const r2 = await tryFetchToPath(alt, out);
      if (r2 === 'ok') return 'ok-alias';
      return r2;
   }
   return r;
}

async function main() {
   const mapsDir = path.join(repoRoot, 'public/q2/maps');
   const texDir = path.join(repoRoot, 'public/q2/textures');
   if (!fs.existsSync(mapsDir)) {
      console.error('No maps dir:', mapsDir);
      process.exit(1);
   }

   /** @type {Set<string>} */
   const allStems = new Set();
   const bsps = fs.readdirSync(mapsDir).filter((f) => f.toLowerCase().endsWith('.bsp'));
   for (const f of bsps) {
      const ab = fs.readFileSync(path.join(mapsDir, f)).buffer;
      const stems = collectTexStemsFromBsp(ab);
      if (stems === null) {
         console.warn('skip (not IBSP v38):', f);
         continue;
      }
      for (const s of stems) allStems.add(s);
   }

   console.log('maps:', bsps.length, 'unique texture stems:', allStems.size);

   const aliases = loadWalAliases();
   if (Object.keys(aliases).length) console.log('wal aliases:', Object.keys(aliases).length, '(scripts/q2-tastyspleen-wal-aliases.json)');

   const flatMap = loadFlatMapSync();
   if (flatMap) console.log('flat texture layout:', flatMap.flatDir, '(texture-flat-map.json)');

   let ok = 0;
   let okAlias = 0;
   let skip = 0;
   const failed = [];
   const sorted = [...allStems].sort();
   for (const stem of sorted) {
      const out = localWalPath(texDir, stem, flatMap);
      if (fs.existsSync(out) && fs.statSync(out).size > 64) {
         skip++;
         continue;
      }
      const r = await downloadIfMissing(stem, texDir, aliases, flatMap);
      if (r === 'ok') {
         ok++;
         console.log('downloaded:', stem);
      } else if (r === 'ok-alias') {
         okAlias++;
         const alt = aliases[stem];
         console.log('downloaded (alias):', stem, '←', alt);
      } else if (r === 'skip') {
         skip++;
      } else {
         failed.push({ stem, r });
      }
      await new Promise((r2) => setTimeout(r2, 40));
   }

   console.log('done: downloaded', ok, 'via alias', okAlias, 'already had', skip);
   if (failed.length) {
      console.log('could not fetch', failed.length, '(mirror may not host these paths)');
      for (const { stem, r } of failed.slice(0, 40)) console.log(' ', stem, r);
      if (failed.length > 40) console.log(' …', failed.length - 40, 'more');
   }
}

main().catch((e) => {
   console.error(e);
   process.exit(1);
});
