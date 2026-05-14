import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { parseQuakePakBuffer, quakePakRead, type QuakePak } from '~/utils/quake2-pak';

let pakCache: { resolvedPath: string; pak: QuakePak } | null = null;

function defaultPakPath(): string {
   const env = process.env.Q2_TEXTURE_PAK_PATH?.trim();
   if (env) return isAbsolute(env) ? env : join(process.cwd(), env);
   return join(process.cwd(), 'public/q2/textures.pak');
}

async function getPak(): Promise<{ pak: QuakePak; path: string }> {
   const resolvedPath = defaultPakPath();
   if (pakCache && pakCache.resolvedPath === resolvedPath) return { pak: pakCache.pak, path: resolvedPath };
   const buf = await readFile(resolvedPath);
   const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
   const pak = parseQuakePakBuffer(ab);
   pakCache = { resolvedPath, pak };
   return { pak, path: resolvedPath };
}

/** Разрешённый путь внутри PAK: `textures/.../file.wal` (нижний регистр). */
function sanitizeWalPath(raw: string): string | null {
   let s = raw.trim().replace(/\\/g, '/');
   try {
      s = decodeURIComponent(s);
   } catch {
      return null;
   }
   s = s.replace(/^\/+/, '').toLowerCase();
   if (s.includes('..') || s.includes('\0')) return null;
   if (!s.endsWith('.wal')) return null;
   if (!/^[a-z0-9_/.-]+\.wal$/.test(s)) return null;
   return s.startsWith('textures/') ? s : `textures/${s}`;
}

export default defineEventHandler(async (event) => {
   assertMethod(event, 'GET');
   const q = getQuery(event);
   const raw = typeof q.path === 'string' ? q.path : typeof q.p === 'string' ? q.p : '';
   const key = sanitizeWalPath(raw);
   if (!key) {
      throw createError({ statusCode: 400, statusMessage: 'Missing or invalid path (use ?path=textures/e1u1/foo.wal)' });
   }
   let pak: QuakePak;
   try {
      pak = (await getPak()).pak;
   } catch {
      throw createError({ statusCode: 503, statusMessage: 'PAK not readable (set Q2_TEXTURE_PAK_PATH or place public/q2/textures.pak)' });
   }
   const bytes = quakePakRead(pak, key);
   if (!bytes) {
      throw createError({ statusCode: 404, statusMessage: `Not in PAK: ${key}` });
   }
   const body = Buffer.from(bytes);
   setHeader(event, 'Content-Type', 'application/octet-stream');
   setHeader(event, 'Cache-Control', 'public, max-age=86400');
   return body;
});
