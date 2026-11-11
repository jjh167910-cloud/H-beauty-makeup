/*
 * Photo sharpening on the phone's graphics chip, before the makeup is painted: soft or small
 * photos (a selfie sent through a messenger, a camera frame) otherwise give a soft, low-quality
 * result. The network is Real-ESRGAN's compact model (realesr-general-x4v3 blended 50/50 with its
 * denoising twin; Xintao Wang, BSD-3-Clause): ~1.2M parameters, float16 weights in
 * /tryon/enhance-x4.bin (2.4 MB). 34 3x3 convolutions with PReLU on the small picture, then pixel
 * shuffle x4 plus the input upscaled. scripts/tinybeauty/enhance.py is the reference.
 *
 * Feature maps (64 channels) are 16 RGBA half-float layers of a texture array. Each pass computes
 * G x 4 output channels into G layers at once (G = 4, 2 or 1: what the phone's uniform blocks and
 * draw buffers allow), the weights of the pass in a uniform block. The work is handed to the chip
 * a few layers at a time and waited for in between, so the page stays responsive, no single
 * submission runs long, and a phone that would take too long is found out early (run throws
 * "slow" and the photo is used as it is).
 */

const NF = 64, NC = 32, UP = 4;
const IN_GROUPS = NF / 4;

type Layer = { cin: number; cout: number; act: boolean; w: Float32Array; b: Float32Array; s: Float32Array | null };

/** Half-precision bits -> number. */
function half(h: number): number {
  const e = (h >> 10) & 0x1f, f = h & 0x3ff, s = h & 0x8000 ? -1 : 1;
  if (e === 0) return s * f * 2 ** -24;
  if (e === 31) return f ? NaN : s * Infinity;
  return s * (1 + f / 1024) * 2 ** (e - 15);
}

/** The network's layers from enhance-x4.bin (per layer: weight [out, in, 3, 3], bias, PReLU slopes). */
export function parseWeights(buffer: ArrayBuffer): Layer[] {
  const raw = new Uint16Array(buffer);
  const table = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) table[i] = half(i);
  let at = 0;
  const take = (n: number) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = table[raw[at + i]];
    at += n;
    return out;
  };
  const specs = [[3, NF, true], ...Array.from({ length: NC }, () => [NF, NF, true]), [NF, 3 * UP * UP, false]] as Array<[number, number, boolean]>;
  const layers = specs.map(([cin, cout, act]) => ({ cin, cout, act, w: take(cout * cin * 9), b: take(cout), s: act ? take(cout) : null }));
  if (at !== raw.length) throw new Error(`enhance weights: ${raw.length} values, expected ${at}`);
  return layers;
}

const QUAD_VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** One 3x3 convolution pass: G output groups of 4 channels from `groups` input groups. */
function convShader(G: number, groups: number, fromImage: boolean) {
  const outs = Array.from({ length: G }, (_, k) => `layout(location = ${k}) out vec4 o${k};`).join("\n");
  const init = Array.from({ length: G }, (_, k) => `vec4 a${k} = bias[${k}];`).join(" ");
  const acc = Array.from({ length: G }, (_, k) => `a${k} += w[(${k} * ${groups} + i) * 9 + t] * v;`).join(" ");
  const act = Array.from({ length: G }, (_, k) => `a${k} = max(a${k}, 0.0) + slope[${k}] * min(a${k}, 0.0);`).join(" ");
  const write = Array.from({ length: G }, (_, k) => `o${k} = a${k};`).join(" ");
  const fetch = fromImage ? "vec4(texelFetch(uImg, q, 0).rgb, 0.0)" : "texelFetch(uIn, ivec3(q, i), 0)";
  return `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray;
uniform sampler2DArray uIn; uniform sampler2D uImg; uniform ivec2 uSize; uniform int uAct;
layout(std140) uniform Weights { mat4 w[${G * groups * 9}]; vec4 bias[${G}]; vec4 slope[${G}]; };
${outs}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ${init}
  for (int t = 0; t < 9; t++) {
    ivec2 q = p + ivec2(t - (t / 3) * 3 - 1, t / 3 - 1);
    if (q.x < 0 || q.y < 0 || q.x >= uSize.x || q.y >= uSize.y) continue;
    for (int i = 0; i < ${groups}; i++) {
      vec4 v = ${fetch};
      ${acc}
    }
  }
  if (uAct == 1) { ${act} }
  ${write}
}`;
}

/** Pixel shuffle x4 plus the input (nearest), onto the canvas (top row first). */
const SHUFFLE_FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray;
uniform sampler2DArray uIn; uniform sampler2D uImg; uniform ivec2 uOut; out vec4 o;
void main() {
  ivec2 P = ivec2(int(gl_FragCoord.x), uOut.y - 1 - int(gl_FragCoord.y));
  ivec2 p = P / ${UP}; int dy = P.y - p.y * ${UP}, dx = P.x - p.x * ${UP};
  vec3 img = texelFetch(uImg, p, 0).rgb, c;
  for (int k = 0; k < 3; k++) {
    int ch = k * ${UP * UP} + dy * ${UP} + dx;
    c[k] = texelFetch(uIn, ivec3(p, ch / 4), 0)[ch - (ch / 4) * 4] + img[k];
  }
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export class Enhancer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private G: number;
  private first: WebGLProgram;
  private body: WebGLProgram;
  private shuffle: WebGLProgram;
  /** Per layer, per pass: a uniform buffer with that pass's weights. */
  private blocks: WebGLBuffer[][];
  private fb: WebGLFramebuffer;
  private quad: WebGLBuffer;
  lost = false;

  /** A sharpener, or null when the phone can't run it (no WebGL2 or no half-float targets). */
  static create(weights: ArrayBuffer): Enhancer | null {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, depth: false });
      if (!gl || !(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"))) return null;
      const e = new Enhancer(canvas, gl, parseWeights(weights));
      return e.check() ? e : (e.dispose(), null);
    } catch (error) {
      console.warn("photo sharpening unavailable", error);
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, layers: Layer[]) {
    this.canvas = canvas;
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); this.lost = true; });
    const maxBlock = gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE) as number;
    const maxDraw = gl.getParameter(gl.MAX_DRAW_BUFFERS) as number;
    const blockBytes = (G: number) => (G * IN_GROUPS * 9 * 16 + G * 8) * 4;
    this.G = [4, 2, 1].find((G) => G <= maxDraw && blockBytes(G) <= maxBlock) ?? 1;
    const make = (fs: string) => {
      const p = gl.createProgram()!;
      for (const [type, text] of [[gl.VERTEX_SHADER, QUAD_VS], [gl.FRAGMENT_SHADER, fs]] as const) {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, text); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
        gl.attachShader(p, s);
      }
      gl.bindAttribLocation(p, 0, "aPos");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
      const index = gl.getUniformBlockIndex(p, "Weights");
      if (index !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, index, 0);
      return p;
    };
    this.first = make(convShader(this.G, 1, true));
    this.body = make(convShader(this.G, IN_GROUPS, false));
    this.shuffle = make(SHUFFLE_FS);
    this.blocks = layers.map((layer, n) => this.pack(layer, n === 0 ? 1 : IN_GROUPS));
    this.fb = gl.createFramebuffer()!;
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }

  /** Uniform buffers for one layer: per pass, mat4 w[(g * groups + i) * 9 + tap] (column = input channel, row = output), bias, slopes. */
  private pack(layer: Layer, groups: number): WebGLBuffer[] {
    const gl = this.gl, G = this.G;
    const passes = layer.cout / 4 / G;
    const out: WebGLBuffer[] = [];
    for (let pass = 0; pass < passes; pass++) {
      const data = new Float32Array(G * groups * 9 * 16 + G * 8);
      for (let g = 0; g < G; g++) {
        for (let r = 0; r < 4; r++) {
          const o = (pass * G + g) * 4 + r;
          for (let i = 0; i < groups; i++) {
            for (let c = 0; c < 4; c++) {
              const ch = i * 4 + c;
              if (ch >= layer.cin) continue;
              for (let t = 0; t < 9; t++) data[((g * groups + i) * 9 + t) * 16 + c * 4 + r] = layer.w[(o * layer.cin + ch) * 9 + t];
            }
          }
          data[G * groups * 9 * 16 + g * 4 + r] = layer.b[o];
          if (layer.s) data[G * groups * 9 * 16 + G * 4 + g * 4 + r] = layer.s[o];
        }
      }
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.UNIFORM_BUFFER, buf);
      gl.bufferData(gl.UNIFORM_BUFFER, data, gl.STATIC_DRAW);
      out.push(buf);
    }
    return out;
  }

  /** Half-float texture-array layers are renderable on this phone. */
  private check(): boolean {
    const gl = this.gl;
    const t = this.array(4, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, t, 0, 1);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.deleteTexture(t);
    return ok;
  }

  private array(w: number, h: number): WebGLTexture {
    const gl = this.gl, t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA16F, w, h, IN_GROUPS);
    return t;
  }

  /** Wait until the chip has finished what it was given (without blocking the page). */
  private async settle() {
    const gl = this.gl;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    if (!sync) return;
    while (gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED && !this.lost) await new Promise((r) => setTimeout(r, 4));
    gl.deleteSync(sync);
  }

  private draw(p: WebGLProgram) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Sharpen `source` (drawn at w x h): the result, 4w x 4h, is on this.canvas. `onProgress` gets
   * 0..1. Throws "slow" early when the whole run would take longer than `budgetMs`.
   */
  async run(source: TexImageSource, w: number, h: number, onProgress?: (done: number) => void, budgetMs = Infinity): Promise<HTMLCanvasElement> {
    const gl = this.gl, G = this.G;
    const total = this.blocks.length, started = performance.now();
    let measuredAt = 0, measuredLayer = 0;
    const img = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    let src = this.array(w, h), dst = this.array(w, h);
    try {
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
      gl.viewport(0, 0, w, h);
      for (let n = 0; n < this.blocks.length; n++) {
        const p = n === 0 ? this.first : this.body;
        gl.useProgram(p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, src);
        gl.uniform1i(gl.getUniformLocation(p, "uIn"), 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, img);
        gl.uniform1i(gl.getUniformLocation(p, "uImg"), 1);
        gl.uniform2i(gl.getUniformLocation(p, "uSize"), w, h);
        gl.uniform1i(gl.getUniformLocation(p, "uAct"), n < this.blocks.length - 1 ? 1 : 0);
        this.blocks[n].forEach((block, pass) => {
          for (let k = 0; k < G; k++) gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k, dst, 0, pass * G + k);
          gl.drawBuffers(Array.from({ length: G }, (_, k) => gl.COLOR_ATTACHMENT0 + k));
          gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, block);
          this.draw(p);
        });
        for (let k = 0; k < G; k++) gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k, null, 0, 0);
        [src, dst] = [dst, src];
        if (n % 3 === 2) {
          await this.settle();
          const now = performance.now();
          // Speed from the second batch on (the first one also pays for shader set-up).
          if (measuredLayer && now - started + ((now - measuredAt) / (n - measuredLayer)) * (total - n) > budgetMs) throw "slow";
          if (!measuredLayer) { measuredAt = now; measuredLayer = n; }
          onProgress?.((n + 1) / (total + 1));
        }
        if (this.lost) throw new Error("context lost");
      }
      // pixel shuffle onto the canvas
      if (this.canvas.width !== w * UP || this.canvas.height !== h * UP) { this.canvas.width = w * UP; this.canvas.height = h * UP; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w * UP, h * UP);
      gl.useProgram(this.shuffle);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, src);
      gl.uniform1i(gl.getUniformLocation(this.shuffle, "uIn"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, img);
      gl.uniform1i(gl.getUniformLocation(this.shuffle, "uImg"), 1);
      gl.uniform2i(gl.getUniformLocation(this.shuffle, "uOut"), w * UP, h * UP);
      this.draw(this.shuffle);
      await this.settle();
      if (this.lost || gl.isContextLost()) throw new Error("context lost");
      return this.canvas;
    } finally {
      gl.deleteTexture(src); gl.deleteTexture(dst); gl.deleteTexture(img);
    }
  }

  dispose() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
