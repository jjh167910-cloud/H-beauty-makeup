/** Selected salon photo focal offsets for wide braids and curls.
 * Square originals shown in 3:4 windows lose parts of hairstyles when
 * center-cropped. These targeted shifts retain more of the subject.
 * The original images and all frame dimensions remain unchanged.
 */
const FOCAL_X: Readonly<Record<number, number>> = {
  22: 90, 77: 11, 80: 11, 81: 6, 84: 6, 85: 6, 87: 6,
  88: 6, 89: 6, 90: 4, 91: 10, 92: 9, 93: 9, 94: 9,
  95: 9, 96: 27, 98: 27, 99: 27, 100: 27, 178: 94,
  179: 94, 182: 89, 184: 94, 190: 91, 220: 16,
  221: 14, 222: 14, 223: 13, 224: 10, 225: 6,
  227: 6, 229: 6, 230: 6, 231: 6, 248: 94,
  249: 94, 250: 94, 251: 94, 253: 94, 255: 94,
  256: 94, 257: 94, 260: 94, 282: 79,
};

export function photoObjectPosition(src?: string, vertical = "32%"): string | undefined {
  const match = src?.match(/^\/looks\/(?:sm\/)?(\d+)\.webp$/);
  if (!match) return undefined;
  const focalX = FOCAL_X[Number(match[1])];
  return focalX == null ? undefined : `${focalX}% ${vertical}`;
}
