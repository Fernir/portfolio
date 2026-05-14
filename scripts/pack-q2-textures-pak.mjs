#!/usr/bin/env node
/**
 * Собирает все `.wal` из `public/q2/textures` в один классический Quake `.pak` (magic PACK).
 * Если в `textures/` нет файлов, а выход — дефолтный `public/q2/textures.pak` и он уже есть, скрипт выходит 0 (ничего не перезаписывает).
 *
 * Имена внутри архива — `textures/<stem>.wal` в нижнем регистре (как ожидает `quake2-texture-atlas` / API).
 *
 * Учитывает `public/q2/texture-flat-map.json`: файлы из `textures/<flatDir>/` сопоставляются stem → путь в PAK.
 *
 * Usage:
 *   node scripts/pack-q2-textures-pak.mjs
 *   node scripts/pack-q2-textures-pak.mjs --out public/q2/textures.pak
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

function argOut() {
   const i = process.argv.indexOf('--out');
   if (i >= 0 && process.argv[i + 1]) return path.resolve(repoRoot, process.argv[i + 1]);
   return path.join(repoRoot, 'public/q2/textures.pak');
}

function readJsonMaybe(p) {
   if (!fs.existsSync(p)) return null;
   return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function walkWalFiles(dir, base = '') {
   if (!fs.existsSync(dir)) return [];
   const out = [];
   for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const rel = path.join(base, ent.name);
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walkWalFiles(full, rel));
      else if (ent.name.toLowerCase().endsWith('.wal')) out.push(rel.replace(/\\/g, '/'));
   }
   return out;
}

function pakInternalPath(relFromTextures, flatMap) {
   const norm = relFromTextures.replace(/\\/g, '/').toLowerCase();
   const flatDir = (flatMap?.flatDir ?? 'flat').toLowerCase();
   if (norm.startsWith(`${flatDir}/`) || norm.startsWith('flat/')) {
      const base = path.basename(norm, '.wal').toLowerCase();
      const toFlat = flatMap?.toFlatFile;
      if (!toFlat || typeof toFlat !== 'object') return null;
      for (const [stem, flatName] of Object.entries(toFlat)) {
         if (String(flatName).toLowerCase() === base) {
            return `textures/${String(stem).replace(/\\/g, '/').toLowerCase()}.wal`;
         }
      }
      console.warn(`[pack-q2] skip flat WAL without stem mapping: ${norm}`);
      return null;
   }
   const trimmed = norm.replace(/^\/+/, '');
   return `textures/${trimmed.endsWith('.wal') ? trimmed : `${trimmed}.wal`}`;
}

function writePak(entries, outPath) {
   /** @type {{ name: string, data: Buffer }[]} */
   const sorted = [...entries.entries()]
      .map(([name, data]) => ({ name, data }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
   const HEADER = 12;
   let dataOff = HEADER;
   const planned = sorted.map((e) => {
      const rec = { ...e, offset: dataOff };
      dataOff += e.data.length;
      return rec;
   });
   const dirOffset = dataOff;
   const dirSize = planned.length * 64;
   const total = dirOffset + dirSize;
   const out = Buffer.alloc(total);
   out.write('PACK', 0, 4, 'ascii');
   out.writeUInt32LE(dirOffset, 4);
   out.writeUInt32LE(dirSize, 8);
   for (const e of planned) {
      e.data.copy(out, e.offset, 0, e.data.length);
   }
   let d = dirOffset;
   for (const e of planned) {
      const nameBuf = Buffer.alloc(56, 0);
      const nb = Buffer.from(e.name, 'latin1');
      if (nb.length > 55) throw new Error(`PAK name too long (${e.name.length}): ${e.name}`);
      nb.copy(nameBuf, 0);
      nameBuf.copy(out, d);
      d += 56;
      out.writeUInt32LE(e.offset, d);
      d += 4;
      out.writeUInt32LE(e.data.length, d);
      d += 4;
   }
   if (d !== total) throw new Error('PAK directory size mismatch');
   fs.mkdirSync(path.dirname(outPath), { recursive: true });
   fs.writeFileSync(outPath, out);
   return { count: planned.length, bytes: total, outPath };
}

const texRoot = path.join(repoRoot, 'public/q2/textures');
const flatMapPath = path.join(repoRoot, 'public/q2/texture-flat-map.json');
const flatMap = readJsonMaybe(flatMapPath);
const rels = walkWalFiles(texRoot);
const outPath = argOut();
if (rels.length === 0) {
   const defaultPak = path.join(repoRoot, 'public/q2/textures.pak');
   if (fs.existsSync(defaultPak) && path.resolve(outPath) === path.resolve(defaultPak)) {
      console.warn('[pack-q2] no .wal under', path.relative(repoRoot, texRoot), '— leaving existing', path.relative(repoRoot, defaultPak));
      process.exit(0);
   }
   console.error('[pack-q2] no WAL files under', texRoot);
   console.error('  Populate from .pak (scripts/extract-q2-pak-wals.mjs) or sync, then re-run.');
   process.exit(1);
}

const entries = new Map();

for (const rel of rels) {
   const full = path.join(texRoot, rel);
   const internal = pakInternalPath(rel, flatMap);
   if (!internal) continue;
   const data = fs.readFileSync(full);
   if (entries.has(internal) && entries.get(internal).length !== data.length) {
      console.warn(`[pack-q2] duplicate internal path (overwrite): ${internal}`);
   }
   entries.set(internal, data);
}

if (entries.size === 0) {
   console.error('[pack-q2] no WAL files found under', texRoot);
   process.exit(1);
}

const r = writePak(entries, outPath);
console.log(`[pack-q2] wrote ${r.count} files, ${r.bytes} bytes → ${path.relative(repoRoot, r.outPath)}`);
