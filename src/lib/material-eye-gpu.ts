/**
 * Isolated WebGL2 eye-material arithmetic kernel. It does not yet replace
 * the CPU photo renderer: verify visual parity on real devices first.
 * No photo uploads, storage or external model dependencies.
 *
 * RGBA8 weights: R=pigment opacity, G=two-colour blend, B=legacy
 * replacement weight, A=liner/lash/facet opacity.
 */
export type MaterialEyeGpuInput = {
  width: number; height: number;
  original: Uint8ClampedArray | Uint8Array;
  previous: Uint8ClampedArray | Uint8Array;
  ink: Uint8ClampedArray | Uint8Array;
  weights: Uint8ClampedArray | Uint8Array;
  pigmentA: readonly [number, number, number];
  pigmentB: readonly [number, number, number];
  referenceLight: number;
};

const VERT = [
  "#version 300 es", "in vec2 aPos;",
  "void main() { gl_Position = vec4(aPos, 0.0, 1.0); }",
].join("\n");

const FRAG = [
  "#version 300 es",
  "precision highp float; precision highp sampler2D;",
  "uniform sampler2D uOriginal, uPrevious, uInk, uWeights;",
  "uniform vec3 uPigmentA, uPigmentB;",
  "uniform float uRefLight;",
  "out vec4 fragColour;",
  "vec3 decode(vec3 x) {",
  "  return mix(pow((x + 0.055) / 1.055, vec3(2.4)), x / 12.92,",
  "             lessThanEqual(x, vec3(0.04045)));",
  "}",
  "vec3 encode(vec3 x) {",
  "  x = max(x, vec3(0.0));",
  "  vec3 lo = x * 12.92;",
  "  vec3 hi = 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055;",
  "  return clamp(mix(hi, lo, lessThanEqual(x, vec3(0.0031308))),",
  "               vec3(1.0/255.0), vec3(254.0/255.0));",
  "}",
  "void main() {",
  // First typed-array row maps to GL bottom row. readPixels uses the same
  // order, so upload and readback do not need Y-flip.
  "  ivec2 at = ivec2(floor(gl_FragCoord.xy));",
  "  vec4 prev = texelFetch(uPrevious, at, 0);",
  "  vec4 w = texelFetch(uWeights, at, 0);",
  "  if (w.b < (0.5/255.0) && w.a < (0.5/255.0)) {",
  "    fragColour = prev; return;", // exact no-op; no gamma round trip
  "  }",
  "  vec4 src = texelFetch(uOriginal, at, 0);",
  "  vec4 ink = texelFetch(uInk, at, 0);",
  "  vec3 linearSource = decode(src.rgb);",
  "  vec3 linearPrev = decode(prev.rgb);",
  "  float luma = dot(linearSource, vec3(0.2126, 0.7152, 0.0722));",
  "  float illumination = clamp(luma / max(uRefLight, 0.012), 0.45, 1.28);",
  "  vec3 pigment = mix(uPigmentA, uPigmentB, w.g) * illumination;",
  "  vec3 colour = mix(linearSource, pigment, min(w.r, 0.87));",
  "  vec3 material = mix(linearPrev, colour, w.b);",
  "  vec3 outputColour = mix(material, decode(ink.rgb), w.a);",
  "  fragColour = vec4(encode(outputColour), prev.a);",
  "}",
].join("\n");

function compile(gl: WebGL2RenderingContext, kind: number, text: string): WebGLShader {
  const s = gl.createShader(kind);
  if (!s) throw new Error("Eye shader allocation failed");
  gl.shaderSource(s, text); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(s) || "compile failed";
    gl.deleteShader(s); throw new Error(error);
  }
  return s;
}

class EyeGpu {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly quad: WebGLBuffer;
  private lost = false;

  constructor() {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
      alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true,
      antialias: false, depth: false, stencil: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", e => {
      e.preventDefault(); this.lost = true;
    });
    const v = compile(gl, gl.VERTEX_SHADER, VERT);
    const f = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const p = gl.createProgram();
    if (!p) throw new Error("Eye program allocation failed");
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p); gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p) || "Eye program link failed");
    this.program = p;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Eye quad allocation failed");
    this.quad = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }

  /** Output canvas is overwritten on the next GPU call. Consume synchronously.
   * The GL canvas is vertically flipped compared with typed-array RGBA rows:
   * when drawing it to 2D, use source row (height - y - 1).
   */
  run(input: MaterialEyeGpuInput, directCanvas = false): Uint8ClampedArray | HTMLCanvasElement {
    const gl = this.gl, {width, height} = input;
    if (this.lost || gl.isContextLost()) throw new Error("Eye GPU context lost");
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
        width < 1 || height < 1 ||
        width > gl.getParameter(gl.MAX_TEXTURE_SIZE) || height > gl.getParameter(gl.MAX_TEXTURE_SIZE))
      throw new RangeError("Unsupported eye ROI dimensions");
    for (const bytes of [input.original, input.previous, input.ink, input.weights]) {
      if (bytes.length !== width * height * 4)
        throw new RangeError("Mismatched RGBA eye image sizes");
    }
    if (input.pigmentA.length !== 3 || input.pigmentB.length !== 3 ||
        [...input.pigmentA, ...input.pigmentB, input.referenceLight]
          .some(v => !Number.isFinite(v) || v < 0 || v > 1))
      throw new RangeError("Invalid linear cosmetic colour or reference light");

    // WebGL2 is required by the production renderer. RGBA8, rather than
    // floating-point buffers, works even on phones without color_buffer_float.
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.width = width; canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND); gl.disable(gl.DITHER);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    const textures: WebGLTexture[] = [];
    try {
      const inputs = [input.original, input.previous, input.ink, input.weights];
      for (let i = 0; i < inputs.length; i++) {
        const texture = gl.createTexture();
        if (!texture) throw new Error("Eye texture allocation failed");
        textures.push(texture);
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, inputs[i]);
        gl.uniform1i(gl.getUniformLocation(this.program,
          ["uOriginal", "uPrevious", "uInk", "uWeights"][i]), i);
      }
      gl.uniform3fv(gl.getUniformLocation(this.program, "uPigmentA"), new Float32Array(input.pigmentA));
      gl.uniform3fv(gl.getUniformLocation(this.program, "uPigmentB"), new Float32Array(input.pigmentB));
      gl.uniform1f(gl.getUniformLocation(this.program, "uRefLight"), input.referenceLight);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (directCanvas) {
        // Avoid the synchronous gl.readPixels() GPU-to-CPU fence entirely.
        // The caller must blit only pixels explicitly permitted by its
        // coverage/stroke mask; a full-canvas copy can touch protected pixels.
        if (gl.getError() !== gl.NO_ERROR) throw new Error("Eye GPU draw error");
        return canvas;
      }
      const result = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, result);
      if (gl.getError() !== gl.NO_ERROR) throw new Error("Eye GPU readback error");
      return new Uint8ClampedArray(result);
    } finally {
      for (const tex of textures) gl.deleteTexture(tex);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }
}

let gpu: EyeGpu | null = null;

/** Return null rather than lose the customer's photo on an unsupported GPU. */
export function compositeEyeGPU(input: MaterialEyeGpuInput): Uint8ClampedArray | null {
  try {
    gpu ??= new EyeGpu();
    return gpu.run(input, false) as Uint8ClampedArray;
  } catch (error) {
    console.warn("Experimental eye material GPU pass skipped", error);
    gpu = null; return null;
  }
}


/** Experimental zero-readback output. Canvas is reused: consume immediately.
 * A caller MUST enforce its own pixel permission mask when drawing it into
 * the destination; see applyMaterialEyeV2's row-span blitter.
 */
export function compositeEyeGPUCanvas(input: MaterialEyeGpuInput): HTMLCanvasElement | null {
  try {
    gpu ??= new EyeGpu();
    return gpu.run(input, true) as HTMLCanvasElement;
  } catch (error) {
    console.warn("Experimental GPU direct canvas skipped", error);
    gpu = null; return null;
  }
}
