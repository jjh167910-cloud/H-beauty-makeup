import { test, expect } from "playwright/test";

/** Each non-zero eye finish must be a separate, identity-safe GPU material,
 * not baked pixels copied from the catalogue reference photo. */
test("native gemstone facets and sparse shimmer are opt-in, anchored and pixel protected", async ({ page }) => {
  await page.goto("/");
  const outcome = await page.evaluate(async () => {
    const { nativeEyeMaterial, NATIVE_EYE_FS } = await import("/src/lib/material-eye-native.ts");
    const W = 360, H = 240;
    const P = Array.from({ length: 478 }, () => [160, 145, 0]);
    const set = (ids: number[], xy: (i: number) => [number, number]) =>
      ids.forEach((id, i) => { const [x, y] = xy(i); P[id] = [x, y, 0]; });
    set([33, 246, 161, 160, 159, 158, 157, 173, 133],
      i => [95 + 17 * i, 139 - 13 * Math.sin(i * Math.PI / 8)]);
    set([70, 63, 105, 66, 107],
      i => [100 + 34 * i, 80 + 5 * Math.abs(i - 2)]);
    P[145] = [163, 159, 0];
    // Right eye deliberately collapses: no borrowed reference eye.
    const stone = nativeEyeMaterial(P, "rhinestone", "natural")!;
    const hollywood = nativeEyeMaterial(P, "hollywood", "natural")!;
    const blue = nativeEyeMaterial(P, "electric-blue", "natural")!;
    const control = nativeEyeMaterial(P, "no-makeup", "natural");
    if (!stone) return { error: "No native eye material" };

    const gl = document.createElement("canvas").getContext("webgl2", {
      preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false
    });
    if (!gl) return { skipped: true };
    const shader = (type: number, source: string) => {
      const result = gl.createShader(type)!;
      gl.shaderSource(result, source);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(result) || "Compile failed");
      return result;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER,
      "#version 300 es\nin vec2 aPos; void main(){gl_Position=vec4(aPos,0.,1.);}"));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, NATIVE_EYE_FS));
    gl.bindAttribLocation(program, 0, "aPos");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) || "Link failed");
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    (gl.canvas as HTMLCanvasElement).width = W;
    (gl.canvas as HTMLCanvasElement).height = H;
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DITHER); gl.disable(gl.BLEND);
    gl.useProgram(program);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    const input = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, grain = (x * 7 + y * 3) % 11 - 5;
      input.set([91 + grain, 65 + grain, 57 + grain, 255], i);
    }
    const vis = new Uint8Array(256 * 256 * 2);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const px = x * W / 256, py = y * W / 256;
      vis[(y * 256 + x) * 2] =
        px >= 144 && px <= 160 && py >= 98 && py <= 136 ? 0 : 255;
    }
    const flip = (src: Uint8Array) => {
      const result = new Uint8Array(src.length);
      for (let y = 0; y < H; y++)
        result.set(src.subarray(y * W * 4, (y + 1) * W * 4), (H - 1 - y) * W * 4);
      return result;
    };
    const texture = (source: Uint8Array, w: number, h: number, isVis = false) => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, isVis ? gl.RG8 : gl.RGBA8, w, h, 0,
        isVis ? gl.RG : gl.RGBA, gl.UNSIGNED_BYTE, source);
      return tex;
    };
    const textures = [texture(flip(input), W, H), texture(input, W, H),
      texture(vis, 256, 256, true)];
    ["uPrevious", "uOriginal", "uVis"].forEach((name, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, textures[i]);
      gl.uniform1i(gl.getUniformLocation(program, name), i);
    });
    const uni = (name: string) => gl.getUniformLocation(program, name);
    gl.uniform2f(uni("uSize"), W, H);
    gl.uniform3f(uni("uVisBox"), 0, 0, W);
    gl.uniform1i(uni("uVisOn"), 1);
    const render = (m: typeof stone, shimmer: number, gems: number) => {
      gl.uniform2fv(uni("uUpper"), m.upper);
      gl.uniform2fv(uni("uBrows"), m.brows);
      gl.uniform4fv(uni("uFrame"), m.frame);
      gl.uniform1fv(uni("uSpan"), m.span);
      gl.uniform1iv(uni("uEnabled"), m.enabled);
      gl.uniform3fv(uni("uPigmentA"), m.pigmentA);
      gl.uniform3fv(uni("uPigmentB"), m.pigmentB);
      gl.uniform1f(uni("uAmount"), m.amount);
      gl.uniform1i(uni("uMode"), m.mode);
      gl.uniform2fv(uni("uLift"), m.lift);
      gl.uniform1fv(uni("uOpening"), m.opening);
      gl.uniform3fv(uni("uLinerColor"), m.linerColor);
      gl.uniform1f(uni("uLinerWidth"), m.linerWidth);
      gl.uniform1f(uni("uWingLength"), m.wingLength);
      gl.uniform1f(uni("uLashLength"), m.lashLength);
      gl.uniform1i(uni("uLashCount"), m.lashCount);
      gl.uniform1f(uni("uInkSoft"), m.inkSoft);
      gl.uniform1f(uni("uShimmer"), shimmer);
      gl.uniform1f(uni("uRhinestones"), gems);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const result = new Uint8Array(input.length);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, result);
      return flip(result);
    };
    const without = render(stone, 0, 0);
    const onlyShimmer = render(stone, stone.shimmer, 0);
    const withGems = render(stone, stone.shimmer, stone.rhinestones);

    let shimmering = 0, gemPixels = 0, outside = 0, clipped = 0, hidden = 0, eyeSclera = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let deltaShimmer = false, deltaGem = false;
      for (let c = 0; c < 3; c++) {
        deltaShimmer ||= Math.abs(onlyShimmer[i + c] - without[i + c]) > 0;
        deltaGem ||= Math.abs(withGems[i + c] - onlyShimmer[i + c]) > 0;
        if (withGems[i + c] !== input[i + c] &&
           (withGems[i + c] === 0 || withGems[i + c] === 255)) clipped++;
      }
      if (deltaShimmer) shimmering++;
      if (deltaGem) gemPixels++;
      if ((deltaShimmer || deltaGem) && (x < 67 || x > 270 || y < 43 || y > 180)) outside++;
      if ((deltaShimmer || deltaGem) && x >= 150 && x <= 153 && y >= 106 && y <= 129) hidden++;
      if ((deltaShimmer || deltaGem) && x >= 147 && x <= 179 && y >= 154 && y <= 173) eyeSclera++;
    }
    return {
      skipped: false, shimmerEnabled: stone.shimmer > 0, gemsEnabled: stone.rhinestones > 0,
      hollywoodShimmer: hollywood.shimmer, hollywoodGems: hollywood.rhinestones,
      electricBlueShimmer: blue.shimmer, electricBlueGems: blue.rhinestones,
      control, shimmering, gemPixels, outside, clipped, hidden, eyeSclera
    };
  });
  test.skip(!!outcome.skipped, "WebGL2 unavailable");
  expect(outcome.shimmerEnabled).toBe(true);
  expect(outcome.gemsEnabled).toBe(true);
  expect(outcome.hollywoodShimmer).toBeGreaterThan(0);
  expect(outcome.hollywoodGems).toBe(0);
  expect(outcome.electricBlueShimmer).toBe(0);
  expect(outcome.electricBlueGems).toBe(0);
  expect(outcome.control).toBeNull();
  expect(outcome.shimmering).toBeGreaterThan(2);
  expect(outcome.gemPixels).toBeGreaterThan(10);
  expect(outcome.outside).toBe(0);
  expect(outcome.clipped).toBe(0);
  expect(outcome.hidden).toBe(0);
  expect(outcome.eyeSclera).toBe(0);
});
