/**
 * Development-only, LOCAL pixel-integrity audit for native-vs-scissored
 * WebGL2 eye material. Never returns or transmits source/renderer pixels.
 *
 * All Canvas2D image readbacks happen only during an explicit A/B preflight,
 * BEFORE GPU elapsed-time samples are collected. The real-time renderer does
 * not call readPixels or synchronize the GPU to do this audit.
 */
export type EyeScissorRect = [number, number, number, number];

export type NativeEyePixelParity = {
  status: "pass" | "fail" | "unavailable";
  width: number;
  height: number;
  /** Number of pixels inside/outside the conservative eye material ROI. */
  insidePixels: number;
  outsidePixels: number;
  /** Any changed RGBA channel outside the allowed ROI is forbidden. */
  outsideChangedPixels: number;
  maxOutsideChannelDelta: number;
  maxChannelDelta: number;
  /** Mean abs RGBA channel delta across the ENTIRE image. */
  meanChannelDelta: number;
  /** Eye GPU work must actually execute in both modes. */
  fullNativeApplied: boolean;
  optimizedFastApplied: boolean;
};

export function auditNativeEyePixels(
  original: ImageData, optimized: ImageData, roi: EyeScissorRect,
  fullNativeApplied = true, optimizedFastApplied = true,
): NativeEyePixelParity {
  const w = original.width, h = original.height;
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 ||
      optimized.width !== w || optimized.height !== h ||
      original.data.length !== w * h * 4 || optimized.data.length !== w * h * 4)
    throw new RangeError("Native A/B image dimensions or RGBA buffers differ");
  const [x, y, rw, rh] = roi;
  if ([x, y, rw, rh].some(v => !Number.isSafeInteger(v)) ||
      x < 0 || y < 0 || rw <= 0 || rh <= 0 || x + rw > w || y + rh > h)
    throw new RangeError("Expected a valid bottom-left WebGL scissor ROI");
  let insidePixels = 0, outsidePixels = 0, outsideChangedPixels = 0;
  let maxChannelDelta = 0, maxOutsideChannelDelta = 0, totalDelta = 0;
  const a = original.data, b = optimized.data;
  // ImageData rows are top-to-bottom; WebGL scissor rows are bottom-to-top.
  for (let row = 0; row < h; row++) {
    const glRow = h - 1 - row;
    const rowInside = glRow >= y && glRow < y + rh;
    for (let col = 0; col < w; col++) {
      const inside = rowInside && col >= x && col < x + rw;
      if (inside) insidePixels++; else outsidePixels++;
      const off = (row * w + col) * 4;
      let outsideChanged = false;
      for (let channel = 0; channel < 4; channel++) {
        const delta = Math.abs(a[off + channel] - b[off + channel]);
        totalDelta += delta;
        maxChannelDelta = Math.max(maxChannelDelta, delta);
        if (!inside) {
          maxOutsideChannelDelta = Math.max(maxOutsideChannelDelta, delta);
          if (delta !== 0) outsideChanged = true;
        }
      }
      if (outsideChanged) outsideChangedPixels++;
    }
  }
  const meanChannelDelta = totalDelta / (w * h * 4);
  return {
    status: !fullNativeApplied || !optimizedFastApplied ? "unavailable" :
      outsideChangedPixels === 0 && maxChannelDelta <= 3 &&
      meanChannelDelta < 0.5 ? "pass" : "fail",
    width: w, height: h, insidePixels, outsidePixels,
    outsideChangedPixels, maxOutsideChannelDelta,
    maxChannelDelta, meanChannelDelta,
    fullNativeApplied, optimizedFastApplied,
  };
}
