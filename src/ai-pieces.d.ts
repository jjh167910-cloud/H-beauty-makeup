/** The big AI files served in pieces (scripts/vite-ai-pieces.ts): size, piece count, content hash, gzipped copies, by URL. */
declare module "virtual:ai-pieces" {
  export const PIECE: number;
  export const PIECES: Record<string, { bytes: number; count: number; hash: string; gz: boolean }>;
}
