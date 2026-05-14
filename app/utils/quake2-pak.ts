/**
 * Классический Quake / Quake II `.pak` (magic `PACK`): один файл, таблица имён → офсет/размер.
 * Используется для чтения `.wal` из одного общего архива в браузере (см. `quake2-texture-atlas.ts`)
 * и на сервере в `GET /api/q2/wal` (сборка PAK: `pnpm run q2:textures:pack`, путь к файлу: `Q2_TEXTURE_PAK_PATH`).
 *
 * URL целого PAK в клиенте: по умолчанию `/q2/textures.pak`; переопределение — `NUXT_PUBLIC_Q2_TEXTURE_PAK`.
 */

export type QuakePakEntry = { offset: number; size: number };

export type QuakePak = {
   buffer: ArrayBuffer;
   /** Ключ: `textures/e1u1/foo.wal` в нижнем регистре, слэши `/`. */
   entries: Map<string, QuakePakEntry>;
};

function readPakName(dv: DataView, entryOffset: number): string {
   let s = '';
   for (let j = 0; j < 56; j++) {
      const c = dv.getUint8(entryOffset + j);
      if (c === 0) break;
      s += String.fromCharCode(c);
   }
   return s.replace(/\\/g, '/');
}

export function normalizePakPath(path: string): string {
   return path
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .toLowerCase();
}

/** Разбор буфера `.pak`; при неверном magic бросает Error. */
export function parseQuakePakBuffer(buffer: ArrayBuffer): QuakePak {
   const dv = new DataView(buffer);
   if (buffer.byteLength < 12) throw new Error('PAK: file too small');
   const magic =
      String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
   if (magic !== 'PACK') throw new Error(`PAK: expected PACK magic, got ${JSON.stringify(magic)}`);
   const dirOfs = dv.getUint32(4, true);
   const dirSize = dv.getUint32(8, true);
   if (dirOfs < 12 || dirSize < 0 || dirSize % 64 !== 0 || dirOfs + dirSize > buffer.byteLength) {
      throw new Error('PAK: invalid directory');
   }
   const n = dirSize / 64;
   const entries = new Map<string, QuakePakEntry>();
   for (let i = 0; i < n; i++) {
      const p = dirOfs + i * 64;
      const name = readPakName(dv, p);
      if (!name) continue;
      const off = dv.getUint32(p + 56, true);
      const size = dv.getUint32(p + 60, true);
      if (size < 0 || off < 0 || off + size > buffer.byteLength) continue;
      const key = normalizePakPath(name);
      if (!entries.has(key)) entries.set(key, { offset: off, size });
   }
   return { buffer, entries };
}

export function quakePakRead(pak: QuakePak, path: string): Uint8Array | null {
   const key = normalizePakPath(path);
   const e = pak.entries.get(key);
   if (!e || e.size <= 0) return null;
   return new Uint8Array(pak.buffer, e.offset, e.size);
}
