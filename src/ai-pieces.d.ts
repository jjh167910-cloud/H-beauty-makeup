/** The big AI files served in pieces (scripts/vite-ai-pieces.ts): size, piece count and content hash by URL. */
declare module "virtual:ai-pieces" {
  export const PIECE: number;
  export const PIECES: Record<string, { bytes: number; count: number; hash: string }>;
}
