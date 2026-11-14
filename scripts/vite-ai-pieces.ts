/**
 * The try-on's big AI files, served in 1 MiB pieces.
 *
 * On a weak phone connection a dropped download used to start a whole file again (the 8 MB segmenter, the 85 MB HD
 * network). Served in pieces, the phone keeps each piece as it arrives (src/lib/tryon.ts) and a dropped connection costs
 * at most one piece. Cloudflare serves no byte ranges for static files, so the pieces are files of their own.
 *
 * The repository keeps each file as it is (whole, or the HD files in their earlier parts: the Python tools read them);
 * this plugin
 *   - gives the app the list (`virtual:ai-pieces`: each file's size, piece count and content hash),
 *   - serves the pieces from those files on the dev server,
 *   - writes the pieces into dist/ and leaves the whole files out of it (what Cloudflare deploys).
 * Piece names carry the file's hash (`segment.<hash>.3-of-8.tflite`), so pieces of two versions never mix. A piece
 * keeps its file's extension: Cloudflare compresses WebAssembly pieces on the way like the whole file.
 */
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

export const PIECE = 1 << 20;

/** Each big file at the URL the app keeps it under, and where its bytes are in public/ (in order). */
const FILES: Array<{ url: string; from?: string[] }> = [
  { url: "/tryon/wasm/vision_wasm_internal.wasm" },
  { url: "/tryon/face_landmarker.task" },
  { url: "/tryon/segment.tflite" },
  { url: "/tryon/enhance-x4.bin" },
  { url: "/tryon/ort/ort-wasm-simd-threaded.wasm" },
  { url: "/tryon/face-hd/gfpgan-1.4-q8.bin", from: [0, 1, 2, 3].map((i) => `/tryon/face-hd/gfpgan-1.4-q8.${i}-of-4.bin`) },
  { url: "/tryon/ort/ort-wasm-simd-threaded.asyncify.wasm", from: [0, 1].map((i) => `/tryon/ort/ort-wasm-simd-threaded.asyncify.${i}-of-2.bin`) },
];

export type Pieces = Record<string, { bytes: number; count: number; hash: string }>;

/** `/tryon/segment.tflite` piece 3 → `/tryon/segment.<hash>.3-of-8.tflite`. */
export function pieceName(url: string, hash: string, i: number, count: number) {
  const dot = url.lastIndexOf(".");
  return `${url.slice(0, dot)}.${hash}.${i}-of-${count}${url.slice(dot)}`;
}

export default function aiPieces(): Plugin {
  let root = "", publicDir = "", outDir = "";
  let pieces: Pieces = {};
  const sources = (file: (typeof FILES)[number]) => (file.from ?? [file.url]).map((url) => join(publicDir, url));

  /** Bytes [start, end) of the file made of `paths` in order. */
  function read(paths: string[], start: number, end: number): Buffer {
    const out = Buffer.alloc(end - start);
    let base = 0, at = 0;
    for (const path of paths) {
      const size = statSync(path).size;
      const from = Math.max(start, base), to = Math.min(end, base + size);
      if (from < to) {
        const fd = openSync(path, "r");
        try { at += readSync(fd, out, at, to - from, from - base); } finally { closeSync(fd); }
      }
      base += size;
    }
    return out;
  }

  function list(): Pieces {
    const result: Pieces = {};
    for (const file of FILES) {
      const paths = sources(file);
      if (!paths.every(existsSync)) throw new Error(`ai-pieces: missing ${paths.filter((p) => !existsSync(p)).join(", ")}`);
      const hash = createHash("sha256");
      let bytes = 0;
      for (const path of paths) { const data = readFileSync(path); hash.update(data); bytes += data.length; }
      result[file.url] = { bytes, count: Math.ceil(bytes / PIECE), hash: hash.digest("hex").slice(0, 10) };
    }
    return result;
  }

  return {
    name: "ai-pieces",
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
      outDir = join(root, config.build.outDir);
      pieces = list();
    },
    resolveId: (id) => (id === "virtual:ai-pieces" ? "\0virtual:ai-pieces" : null),
    load: (id) => (id === "\0virtual:ai-pieces" ? `export const PIECE = ${PIECE};\nexport const PIECES = ${JSON.stringify(pieces)};\n` : null),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        const m = /^(.*)\.([0-9a-f]{10})\.(\d+)-of-(\d+)(\.[a-z0-9]+)$/.exec(path);
        const url = m ? `${m[1]}${m[5]}` : "";
        const file = FILES.find((f) => f.url === url), info = pieces[url];
        if (!m || !file || !info || info.hash !== m[2] || Number(m[4]) !== info.count) return next();
        const i = Number(m[3]);
        if (i >= info.count) return next();
        const data = read(sources(file), i * PIECE, Math.min(info.bytes, (i + 1) * PIECE));
        res.setHeader("Content-Type", url.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
        res.setHeader("Content-Length", String(data.length));
        res.setHeader("Cache-Control", "no-cache");
        res.end(data);
      });
    },
    closeBundle() {
      // (dist/ has public/ copied in: pieces in, whole files out)
      for (const file of FILES) {
        const info = pieces[file.url], paths = sources(file);
        for (let i = 0; i < info.count; i++) {
          const target = join(outDir, pieceName(file.url, info.hash, i, info.count));
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, read(paths, i * PIECE, Math.min(info.bytes, (i + 1) * PIECE)));
        }
        for (const url of file.from ?? [file.url]) rmSync(join(outDir, url), { force: true });
      }
    },
  };
}
