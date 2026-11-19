/*
 * Live makeup mirror on the front camera, on the phone.
 *
 * Every displayed frame MediaPipe tracks the face (VIDEO mode), then:
 * - "gpu" engine: the frame is painted by the makeup engine on the graphics chip
 *   (makeup-gl.ts), the same as a photo, at camera speed. Her light references (eye whites,
 *   skin, lips) are re-measured every few frames and smoothed. The camera is asked for 1080 x 1440; frames are painted at
 *   960 pixels first, then by the measured frame time up to 1440 on a phone that keeps up easily, down to 480 on one that
 *   doesn't. A look
 *   gets its recipe here too (its eyeshadow's finish, highlighter, liner colour): the mirror is the photo result. Where her face
 *   can be seen (hair, hands, glasses are left alone) is re-segmented every SEGMENT_MS at most, and
 *   her lip colours (for her own lip line) are re-measured every other frame.
 * - her own makeup («میکاپ من», setMine): her recipe instead of a look, its shapes following her face as it moves.
 * - her landmarks are steadied from frame to frame (steady.ts, the One Euro filter): a still face doesn't shimmer, a
 *   moving one isn't trailed.
 * - studio light (studio-gl.ts, setStudio): every frame is retouched before the makeup, as her photo is; its settings
 *   (her skin's colour) are re-measured every few frames and eased, so the light doesn't flicker.
 * - "tiny" fallback: the latest change of the look's tiny network, which lives in face-aligned
 *   coordinates, is placed on this frame with this frame's alignment; whenever the worker is
 *   free the network runs again on the current frame to refresh it.
 */
import type { Canon, FaceStats, Level, LipChoice, LipGrid, LookFiles, Products, Swatch, Visibility } from "./makeup-gl";
import { eyeWidth, lipChoice, measureFace, mineLight, productLight } from "./makeup-gl";
import { Steady } from "./steady";
import { studioParams, type StudioParams } from "./studio-gl";
import {
  addDelta, alignedBox, alignedInput, alignment, canvas, changeOf, ctx2d, engine, gpu, lipstickData, loadFaceModel, loadLook,
  lipProb, loadSegmenter, lookFinish, lookV2, meshTriangles, ownBrows, photoBlur, productsFor, resolveMine, runLook, studio, toPoints, v2Picks, visibility, warmUp,
  type Affine, type Engine,
  type MinePicks, type MineReady, type ProductPicks, type TryOnError,
} from "./tryon";

/**
 * Painted frame size (longer side): the gpu engine starts at START (960: sharp on a phone's screen, and quick to show on
 * a slow one), steps up while the phone keeps up easily and down when it doesn't.
 */
const SIDES = { gpu: [1440, 1280, 1080, 960, 800, 640, 480], tiny: [640] };
const START = 3;
/**
 * Average frame work (ms) above which the next smaller size is used (after 30 frames, or 3 when far too slow), and below
 * which, held for 60 frames, the next larger one is tried (one about 1.3 times the work); never back to a size it left
 * for being slow.
 */
const SLOW_MS = 45, VERY_SLOW_MS = SLOW_MS * 8, FAST_MS = 22;
const MEASURE_EVERY = 8;
/**
 * Her visible face is re-segmented every SEGMENT_MS at most (the last map is used in between), and on a phone
 * where segmenting takes long, so rarely that it costs at most a fifth of the time.
 */
const SEGMENT_MS = 150;

/**
 * The capture coach: what would make the photo better, from what the mirror measures anyway (null: it's good). Her face too
 * small or too close in the frame, her head turned or tilted, too little light (her eye whites, whatever her skin), or
 * light from one side (one cheek much darker than the other).
 */
export type Coach = "far" | "near" | "turn" | "tilt" | "dark" | "uneven";
export type LiveStats = { fps: number; netMs: number; face: boolean; engine: Engine; drawnFrames: number; coach: Coach | null };
/** The coach's limits: face width over the frame's width, head roll (degrees), the near / far cheek's distance to her
 * nose, eye-white brightness (linear), and the brighter cheek over the darker one. */
const COACH = { far: 0.3, near: 0.85, tilt: 12, turn: 0.55, dark: 0.08, uneven: 2.2 };
/** The capture: this many camera frames, the sharpest kept. */
const BURST = 5;

export class LiveMirror {
  private stream: MediaStream | null = null;
  private video = document.createElement("video");
  private frame = canvas(1, 1);
  private scratch = canvas(256, 256);
  private running = false;
  private look: string;
  private level: Level;
  private delta: Float32Array | null = null;
  private deltaLook = "";
  private busy = false;
  private last = 0;
  private frames = 0;
  private fpsAt = 0;
  private drawnFrames = 0;
  private lastDrawAt = 0;
  private count = 0;
  private files: LookFiles | null = null;
  private tris: number[] | null = null;
  private face: FaceStats | null = null;
  /** Her light references on this frame before the studio light (her eye whites as they are: studioFace in tryon.ts). */
  private plainFace: FaceStats | null = null;
  private lip: LipChoice | null = null;
  private lipstick: { swatch: Swatch; canon: Canon } | null = null;
  /** Her own products and step intensities, resolved for the current look (null: none). */
  private picks: ProductPicks | null = null;
  private products: Products | undefined;
  private productsKey = "";
  private stats: LiveStats;
  private size = START;
  /** The largest size (smallest index) still allowed: one it stepped down from was too slow. */
  private top = 0;
  private work = 0;
  private sinceResize = 0;
  private vis: Visibility | null = null;
  private segScratch = canvas(256, 256);
  private segOn = false;
  private segMs = 0;
  private segAt = -Infinity;
  private lips: LipGrid | null = null;
  private lipScratch = canvas(192, 192);
  /** Her own makeup instead of the look (null: the look), resolved, and the look that lends it its lashes. */
  private minePicks: MinePicks | null = null;
  private mine: MineReady | null = null;
  private mineFiles: LookFiles | null = null;
  private mineKey = "";
  /** A catalog look as its recipe of products (?engine=v2: lookV2 in tryon.ts), resolved like her own makeup. */
  private v2: { picks: MinePicks; ready: MineReady; files: LookFiles } | null = null;
  private v2Key = "";
  private steady = new Steady();
  /** Studio light on each frame (when the phone can), and its settings, eased from frame to frame. */
  private lit = false;
  private litParams: StudioParams | null = null;
  private litCount = 0;
  /** Her landmarks on the last frame (frame pixels) and the frame's scale from the camera picture; her cheeks' brightness. */
  private lastPoints: ReturnType<typeof toPoints> | null = null;
  private frameScale = 1;
  private cheeks: [number, number] = [0, 0];

  constructor(private view: HTMLCanvasElement, look: string, level: Level, private onStats?: (stats: LiveStats) => void, lip: LipChoice | null = null,
    picks: ProductPicks | null = null) {
    this.lip = lip;
    this.picks = picks;
    this.look = look;
    this.level = level;
    this.stats = { fps: 0, netMs: 0, face: false, engine: engine(), drawnFrames: 0, coach: null };
    this.video.muted = true;
    this.video.playsInline = true;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw "no-camera" satisfies TryOnError;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1440 } }, audio: false });
    } catch {
      throw "no-camera" satisfies TryOnError;
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    const landmarker = await loadFaceModel("VIDEO");
    if (this.stats.engine === "gpu") {
      [this.tris, this.lipstick, this.segOn] = await Promise.all([meshTriangles(), lipstickData(), loadSegmenter("VIDEO").then(() => true, () => false)]);
      this.setLook(this.look);
    }
    else warmUp(this.look);
    this.running = true;
    // Never calculate the first FPS sample from performance.timeOrigin:
    // expensive model initialization could make the first actual frame
    // report 0 FPS even though it was successfully drawn.
    this.fpsAt = 0;
    this.frames = 0;
    this.drawnFrames = 0;
    this.lastDrawAt = 0;
    let frameFailures = 0;
    const tick = () => {
      if (!this.running) return;
      try {
        this.draw(landmarker);
        frameFailures = 0;
        // If the camera freezes, a previously measured FPS must not remain
        // displayed as though frames are still arriving.
        if (this.lastDrawAt > 0 && performance.now() - this.lastDrawAt > 2500 && this.stats.fps > 0) {
          this.stats.fps = 0;
          this.frames = 0;
          this.fpsAt = 0;
          this.onStats?.({ ...this.stats });
        }
      } catch (error) {
        // A transient decoder/graphics error must not permanently halt the
        // camera loop. Subsequent frames can recover without restarting video.
        if (frameFailures++ < 2) console.warn("Live makeup frame skipped", error);
      } finally {
        if (this.running) requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }

  setLook(look: string) {
    this.look = look;
    if (this.stats.engine !== "gpu") { warmUp(look); return; }
    if (!lookV2()) loadLook(look).then((files) => { if (this.look === look) this.files = files; }).catch(() => undefined);
    this.resolve();
  }

  /** Her own products and step intensities (null: the look as it is). */
  setProducts(picks: ProductPicks | null) { this.picks = picks; this.resolve(); }

  private resolve() {
    if (lookV2()) { this.resolveV2(); return; }
    const key = `${this.look}|${JSON.stringify(this.picks)}`;
    if (key === this.productsKey) return;
    this.productsKey = key;
    // (with or without her picks the look's recipe: its finishes, highlight and liner colour, as on her photo)
    productsFor(this.look, this.picks, this.face ?? { sclera: null, skin: null, lipRef: null })
      .then((p) => { if (this.productsKey === key) this.products = p; })
      .catch(() => undefined);
  }

  /** The look as its recipe at her level, with her picks (the last one shows until this one is ready). */
  private resolveV2() {
    const key = `${this.look}|${this.level}|${JSON.stringify(this.picks)}`;
    if (key === this.v2Key) return;
    this.v2Key = key;
    const picks = v2Picks(this.look, this.level, this.picks);
    if (!picks) { this.v2 = null; return; }
    resolveMine(picks, this.face ?? { sclera: null, skin: null, lipRef: null })
      .then(async (ready) => {
        const files = await loadLook(ready.look);
        if (this.v2Key === key) this.v2 = { picks, ready, files };
      })
      .catch(() => undefined);
  }

  setLevel(level: Level) {
    this.level = level;
    if (lookV2() && this.stats.engine === "gpu") this.resolveV2();
  }

  /** Her own makeup («میکاپ من») on the camera instead of the look (null: back to the look). */
  setMine(picks: MinePicks | null) {
    const key = JSON.stringify(picks);
    if (key === this.mineKey) return;
    this.mineKey = key;
    this.minePicks = picks;
    if (!picks) { this.mine = null; this.mineFiles = null; return; }
    resolveMine(picks, this.face ?? { sclera: null, skin: null, lipRef: null })
      .then(async (ready) => {
        const files = await loadLook(ready.look);
        if (this.mineKey === key) { this.mine = ready; this.mineFiles = files; }
      })
      .catch(() => undefined);
  }

  /** Her lipstick pick (null: the look's own). */
  setLip(lip: LipChoice | null) { this.lip = lip; }

  /** Studio light and skin on each frame (studio-gl.ts), on or off. */
  setStudio(on: boolean) { this.lit = on; this.litParams = null; this.face = null; }

  /** This frame retouched in studio light, in place (its settings re-measured every MEASURE_EVERY frames, eased). */
  private relight(points: ReturnType<typeof toPoints>) {
    const s = studio();
    if (!s) return;
    if (!this.litParams || this.litCount++ % MEASURE_EVERY === 0) {
      const now = studioParams(this.frame, points), old = this.litParams;
      const ease = <T extends number[]>(a: T, b: T) => a.map((v, i) => v * 0.6 + b[i] * 0.4) as T;
      this.litParams = !old ? now : {
        wb: ease(old.wb, now.wb), tint: ease(old.tint, now.tint), vs: old.vs * 0.6 + now.vs * 0.4,
        pivot: old.pivot * 0.6 + now.pivot * 0.4, cs: old.cs * 0.6 + now.cs * 0.4,
      };
    }
    try {
      const out = s.apply(this.frame, points, this.litParams);
      const g = ctx2d(this.frame);
      g.clearRect(0, 0, this.frame.width, this.frame.height);
      g.drawImage(out, 0, 0);
    } catch {
      this.lit = false;              // (the phone can't: her frames as they are)
    }
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  /** The current camera frame (not mirrored), for the photo try-on. */
  snapshot(): Promise<Blob> {
    const c = canvas(this.video.videoWidth, this.video.videoHeight);
    ctx2d(c).drawImage(this.video, 0, 0);
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject("failed")), "image/jpeg", 0.95));
  }

  /**
   * The photo try-on's picture: BURST camera frames in a row (about a third of a second), the sharpest kept (a hand or a
   * head moving blurs some frames): by the variance of the Laplacian over her face, as she was in the last frame.
   */
  async burst(): Promise<Blob> {
    const P = this.lastPoints, vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!P || !vw || !vh) return this.snapshot();
    const k = 1 / this.frameScale;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of P) { x0 = Math.min(x0, x * k); y0 = Math.min(y0, y * k); x1 = Math.max(x1, x * k); y1 = Math.max(y1, y * k); }
    const box = [Math.max(0, x0), Math.max(0, y0), Math.min(vw, x1) - Math.max(0, x0), Math.min(vh, y1) - Math.max(0, y0)];
    if (box[2] < 8 || box[3] < 8) return this.snapshot();
    const probe = canvas(192, 192), pg = ctx2d(probe);
    let best: HTMLCanvasElement | null = null, bestScore = -1, last = -1;
    for (let n = 0; n < BURST; n++) {
      if (n) await new Promise((r) => setTimeout(r, 70));
      if (this.video.currentTime === last) continue;     // (the same frame again)
      last = this.video.currentTime;
      const c = canvas(vw, vh);
      ctx2d(c).drawImage(this.video, 0, 0);
      pg.drawImage(c, box[0], box[1], box[2], box[3], 0, 0, 192, 192);
      const score = sharpness(pg.getImageData(0, 0, 192, 192).data, 192);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best) return this.snapshot();
    const shot = best;
    return new Promise((resolve, reject) => shot.toBlob((b) => (b ? resolve(b) : reject("failed")), "image/jpeg", 0.95));
  }

  /** What would make the photo better now (COACH), from her landmarks on this frame and the light measured on it. */
  private coach(P: ReturnType<typeof toPoints>, w: number, h: number): Coach | null {
    const d = (a: number, b: number) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
    const faceW = d(234, 454) / Math.min(w, h);
    if (faceW < COACH.far) return "far";
    if (faceW > COACH.near) return "near";
    const l = d(1, 234), r = d(1, 454);
    if (Math.min(l, r) / Math.max(l, r, 1e-6) < COACH.turn) return "turn";
    const roll = Math.abs((Math.atan2(P[263][1] - P[33][1], P[263][0] - P[33][0]) * 180) / Math.PI);
    if (Math.min(roll, 180 - roll) > COACH.tilt) return "tilt";
    const white = this.face?.sclera ? (this.face.sclera[0] + this.face.sclera[1] + this.face.sclera[2]) / 3 : null;
    if (white != null && white < COACH.dark) return "dark";
    const [a, b] = this.cheeks;
    if (a > 0 && b > 0 && Math.max(a, b) / Math.min(a, b) > COACH.uneven) return "uneven";
    return null;
  }

  /** Her two cheeks' mean brightness (linear) on this frame, for the coach. */
  private measureCheeks(P: ReturnType<typeof toPoints>) {
    const g = ctx2d(this.frame), r = Math.max(2, Math.round(eyeWidth(P) * 0.25));
    this.cheeks = ([50, 280] as const).map((i) => {
      const x = Math.round(P[i][0] - r / 2), y = Math.round(P[i][1] - r / 2);
      if (x < 0 || y < 0 || x + r > this.frame.width || y + r > this.frame.height) return 0;
      const px = g.getImageData(x, y, r, r).data;
      let sum = 0;
      for (let k = 0; k < px.length; k += 4) sum += ((0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]) / 255) ** 2.2;
      return sum / (px.length / 4);
    }) as [number, number];
  }

  private draw(landmarker: Awaited<ReturnType<typeof loadFaceModel>>) {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!vw || !vh || this.video.currentTime === this.last) return;
    this.last = this.video.currentTime;
    const begun = performance.now();
    const sides = SIDES[this.stats.engine];
    this.size = Math.min(this.size, sides.length - 1);
    const scale = Math.min(1, sides[this.size] / Math.max(vw, vh));
    const w = Math.round(vw * scale), h = Math.round(vh * scale);
    if (this.frame.width !== w || this.frame.height !== h) { this.frame.width = w; this.frame.height = h; this.steady.reset(); }
    if (this.view.width !== w || this.view.height !== h) { this.view.width = w; this.view.height = h; }
    const g = ctx2d(this.frame);
    g.drawImage(this.video, 0, 0, w, h);

    const face = landmarker.detectForVideo(this.frame, performance.now()).faceLandmarks[0];
    this.stats.face = Boolean(face);
    this.frameScale = scale;
    let shown = false;
    const coachWas = this.stats.coach;
    if (!face) { this.steady.reset(); this.lastPoints = null; this.stats.coach = null; }
    else {
      const raw = toPoints(face, w, h), points = this.steady.apply(raw, eyeWidth(raw), performance.now());
      this.lastPoints = points;
      if (this.count % MEASURE_EVERY === 0) this.measureCheeks(points);
      this.stats.coach = this.coach(points, w, h);
      if (this.lit && this.stats.engine === "gpu") {
        if (!this.face || this.count % MEASURE_EVERY === 0) this.plainFace = measureFace(this.frame, points);
        this.relight(points);
      }
      if (this.stats.engine === "gpu") shown = this.paint(points, w, h);
      else {
        const align = alignment(points);
        if (!this.busy) this.refresh(align, w, h);
        if (this.delta && this.deltaLook === this.look) this.place(g, align, w, h);
      }
    }
    if (!shown) ctx2d(this.view).drawImage(this.frame, 0, 0);
    if (this.stats.coach !== coachWas) this.onStats?.({ ...this.stats });
    this.pace(performance.now() - begun, sides);

    this.frames++;
    this.drawnFrames++;
    this.stats.drawnFrames = this.drawnFrames;
    const now = performance.now();
    this.lastDrawAt = now;
    if (this.fpsAt === 0) {
      // Report the first REAL rendered frame immediately. A first-frame
      // event is a stronger observable than a rounded FPS value on a cold
      // phone/GPU, and does not invent an unmeasured frame rate.
      this.fpsAt = now;
      this.onStats?.({ ...this.stats });
    } else if (now - this.fpsAt >= 1000) {
      this.stats.fps = Math.round((this.frames * 1000) / (now - this.fpsAt));
      this.frames = 0;
      this.fpsAt = now;
      this.onStats?.({ ...this.stats });
    } else if (this.drawnFrames === 2) {
      // Confirm the camera is producing NEW frames without waiting for a
      // one-second rate window; keep fps at zero until actually measured.
      this.onStats?.({ ...this.stats });
    }
  }

  /**
   * Step down to a smaller frame when the work per frame stays above SLOW_MS (to one that is really smaller), up to the
   * next larger one when it stays under FAST_MS (never back to one that was too slow).
   */
  private pace(ms: number, sides: number[]) {
    this.work = this.sinceResize++ ? this.work * 0.9 + ms * 0.1 : ms;
    const now = Math.max(this.frame.width, this.frame.height);
    if (this.work > SLOW_MS && this.sinceResize > (this.work > VERY_SLOW_MS ? 3 : 30) && this.size < sides.length - 1) {
      this.top = Math.max(this.top, this.size + 1);
      do this.size++; while (this.size < sides.length - 1 && sides[this.size] >= now);
      this.sinceResize = 0;
    } else if (this.work < FAST_MS && this.sinceResize > 60 && this.size > this.top && sides[this.size] <= now) {
      this.size--;                // (only when the camera gives a frame this size: sides[size] <= now)
      this.sinceResize = 0;
    }
  }

  /** The graphics-chip engine on this frame. Returns false when the look's files aren't loaded yet. */
  private paint(points: ReturnType<typeof toPoints>, w: number, h: number): boolean {
    const r = gpu();
    // (her own makeup, or a look as its recipe: products only)
    const own = this.minePicks ? (this.mine && this.mineFiles ? { ready: this.mine, files: this.mineFiles, picks: this.minePicks } : null)
      : this.v2Key ? (this.v2 ? { ready: this.v2.ready, files: this.v2.files, picks: this.v2.picks } : null) : undefined;
    if (!r || !this.tris || own === null) return false;
    const files = own ? own.files : this.files;
    if (!files || (!own && files.id !== this.look)) return false;
    const started = performance.now();
    if (!this.face || this.count++ % MEASURE_EVERY === 0) {
      const now = measureFace(this.frame, points), old = this.face, plain = this.lit ? this.plainFace : null;
      // (in studio light her eye whites as before it, in its light on her skin: the retouch brightens them)
      if (plain?.sclera && plain.skin && now.skin) now.sclera = plain.sclera.map((v) => (v * now.skin!) / plain.skin!);
      now.blur = photoBlur(this.frame, points);
      const mix = (a: number | null | undefined, b: number | null | undefined) => (a == null ? b ?? null : b == null ? a : a * 0.5 + b * 0.5);
      this.face = !old ? now : {
        sclera: old.sclera && now.sclera ? old.sclera.map((v, i) => v * 0.5 + now.sclera![i] * 0.5) : now.sclera ?? old.sclera,
        skin: mix(old.skin, now.skin), lipRef: mix(old.lipRef, now.lipRef), blur: mix(old.blur, now.blur),
        // (the concealer's references under her eyes and her skin's tone, her brows' colour: kept, not dropped)
        under: old.under && now.under ? [mix(old.under[0], now.under[0])!, mix(old.under[1], now.under[1])!] : now.under ?? old.under,
        tone: old.tone && now.tone ? old.tone.map((v, i) => v * 0.5 + now.tone![i] * 0.5) : now.tone ?? old.tone,
        brow: old.brow && now.brow ? old.brow.map((v, i) => v * 0.5 + now.brow![i] * 0.5) : now.brow ?? old.brow,
      };
    }
    const ownLip = own?.ready.lipInfo ?? files.lip, herLip = own ? (this.minePicks ? own.ready.lip : this.lip ?? own.ready.lip) : this.lip;
    const lip = this.lipstick ? lipChoice(ownLip, herLip, this.lipstick.swatch) : ownLip;
    const base = own ? own.ready.products : this.products;
    // (a catalog look, with or without her picks: its recipe, its calibrated strength and her brows, from her face as
    // measured now; her own makeup's brows in her own colour, as measured now too)
    let products = own ? (base && this.lipstick ? { ...base, white: mineLight(this.face, this.lipstick.swatch) } : undefined)
      : this.lipstick ? { ...base, white: productLight(this.face, this.lipstick.swatch), ...lookFinish(this.look, this.face, !this.lip) } : undefined;
    if (own && products?.brows && own.picks.brows?.own) {
      const color = ownBrows(this.face, products.white);
      if (color) products = { ...products, brows: { ...products.brows, color } };
    }
    if (own && !products) return false;                      // (her own makeup is all products: never the lash template's look)
    const t0 = performance.now();
    if (this.segOn && t0 - this.segAt >= Math.max(SEGMENT_MS, this.segMs * 4)) {
      this.segAt = t0;
      visibility(this.frame, points, this.segScratch, t0)
        .then((v) => { this.vis = v; const ms = performance.now() - t0; this.segMs = this.segMs ? this.segMs * 0.7 + ms * 0.3 : ms; })
        .catch(() => undefined);
    }
    // her lip line, every other frame (the guided filter follows this frame's own edges in between)
    if (this.count % 2 === 0 || !this.lips) this.lips = lipProb(this.frame, points, this.lipScratch);
    r.render(this.frame, w, h, points, files, this.face, this.minePicks ? "natural" : this.level, this.tris, lip, this.lipstick?.canon, undefined, products, this.vis, this.lips);
    ctx2d(this.view).drawImage(r.canvas, 0, 0);
    this.stats.netMs = Math.max(1, Math.round(performance.now() - started));
    return true;
  }

  /** Run the network on this frame in the background; its change is used from the next frames. */
  private refresh(align: Affine, w: number, h: number) {
    this.busy = true;
    const look = this.look;
    const input = alignedInput(this.frame, w, h, align, this.scratch);
    const started = performance.now();
    runLook(look, input)
      .then((out) => {
        this.delta = changeOf(input, out);
        this.deltaLook = look;
        this.stats.netMs = Math.round(performance.now() - started);
      })
      .catch(() => undefined)
      .finally(() => { this.busy = false; });
  }

  private place(g: CanvasRenderingContext2D, align: Affine, w: number, h: number) {
    const box = alignedBox(align, w, h);
    if (!box.w || !box.h || !this.delta) return;
    const img = g.getImageData(box.x, box.y, box.w, box.h);
    addDelta(img, box.x, box.y, align, this.delta, this.level === "soft" ? 0.6 : 1);
    g.putImageData(img, box.x, box.y);
  }
}

/** How sharp a grey picture is (RGBA bytes, side x side): the variance of its Laplacian. */
function sharpness(px: Uint8ClampedArray, side: number): number {
  const g = new Float32Array(side * side);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < side - 1; y++) for (let x = 1; x < side - 1; x++) {
    const i = y * side + x, l = g[i - 1] + g[i + 1] + g[i - side] + g[i + side] - 4 * g[i];
    sum += l; sum2 += l * l; n++;
  }
  return sum2 / n - (sum / n) ** 2;
}
