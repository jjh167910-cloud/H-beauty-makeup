/*
 * Live makeup mirror on the front camera, on the phone.
 *
 * Every displayed frame MediaPipe tracks the face (VIDEO mode), then:
 * - "gpu" engine: the frame is painted by the makeup engine on the graphics chip
 *   (makeup-gl.ts), the same as a photo, at camera speed. Her light references (eye whites,
 *   skin, lips) are re-measured every few frames and smoothed. Frames are painted at up to 960
 *   pixels (sharp on a phone screen); a phone that can't keep up steps down to 640, a very slow one to 480. Where her face
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
  lipProb, loadSegmenter, meshTriangles, photoBlur, productsFor, resolveMine, runLook, studio, toPoints, visibility, warmUp, type Affine, type Engine,
  type MinePicks, type MineReady, type ProductPicks, type TryOnError,
} from "./tryon";

/** Painted frame size (longer side): the gpu engine starts sharp and steps down if the phone is slow. */
const SIDES = { gpu: [960, 800, 640, 480], tiny: [640] };
/** Average frame work (ms) above which the next smaller size is used: after 30 frames, or 3 when far too slow. */
const SLOW_MS = 45, VERY_SLOW_MS = SLOW_MS * 8;
const MEASURE_EVERY = 8;
/**
 * Her visible face is re-segmented every SEGMENT_MS at most (the last map is used in between), and on a phone
 * where segmenting takes long, so rarely that it costs at most a fifth of the time.
 */
const SEGMENT_MS = 150;

export type LiveStats = { fps: number; netMs: number; face: boolean; engine: Engine };

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
  private size = 0;
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
  private steady = new Steady();
  /** Studio light on each frame (when the phone can), and its settings, eased from frame to frame. */
  private lit = false;
  private litParams: StudioParams | null = null;
  private litCount = 0;

  constructor(private view: HTMLCanvasElement, look: string, level: Level, private onStats?: (stats: LiveStats) => void, lip: LipChoice | null = null,
    picks: ProductPicks | null = null) {
    this.lip = lip;
    this.picks = picks;
    this.look = look;
    this.level = level;
    this.stats = { fps: 0, netMs: 0, face: false, engine: engine() };
    this.video.muted = true;
    this.video.playsInline = true;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw "no-camera" satisfies TryOnError;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false });
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
    // Start the FPS clock when camera processing actually begins, not when
    // the page loaded or AI files finished downloading.
    this.frames = 0;
    this.fpsAt = performance.now();
    let frameFailures = 0;
    const tick = () => {
      if (!this.running) return;
      try {
        this.draw(landmarker);
        frameFailures = 0;
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
    loadLook(look).then((files) => { if (this.look === look) this.files = files; }).catch(() => undefined);
    this.resolve();
  }

  /** Her own products and step intensities (null: the look as it is). */
  setProducts(picks: ProductPicks | null) { this.picks = picks; this.resolve(); }

  private resolve() {
    const key = `${this.look}|${JSON.stringify(this.picks)}`;
    if (key === this.productsKey) return;
    this.productsKey = key;
    // (without her picks the look as its layer paints it: its recipe's finishes, highlight and liner colour need passes a
    // camera frame can't afford; the capture, a photo try-on, has them)
    if (!this.picks) { this.products = undefined; return; }
    productsFor(this.look, this.picks, this.face ?? { sclera: null, skin: null, lipRef: null })
      .then((p) => { if (this.productsKey === key) this.products = p; })
      .catch(() => undefined);
  }

  setLevel(level: Level) { this.level = level; }

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

  private draw(landmarker: Awaited<ReturnType<typeof loadFaceModel>>) {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!vw || !vh || this.video.currentTime === this.last) return;
    this.last = this.video.currentTime;
    const begun = performance.now();
    const sides = SIDES[this.stats.engine];
    const scale = Math.min(1, sides[this.size] / Math.max(vw, vh));
    const w = Math.round(vw * scale), h = Math.round(vh * scale);
    if (this.frame.width !== w || this.frame.height !== h) { this.frame.width = w; this.frame.height = h; this.steady.reset(); }
    if (this.view.width !== w || this.view.height !== h) { this.view.width = w; this.view.height = h; }
    const g = ctx2d(this.frame);
    g.drawImage(this.video, 0, 0, w, h);

    const face = landmarker.detectForVideo(this.frame, performance.now()).faceLandmarks[0];
    this.stats.face = Boolean(face);
    let shown = false;
    if (!face) this.steady.reset();
    else {
      const raw = toPoints(face, w, h), points = this.steady.apply(raw, eyeWidth(raw), performance.now());
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
    this.pace(performance.now() - begun, sides);

    this.frames++;
    const now = performance.now();
    if (now - this.fpsAt > 1000) {
      // Preserve fractional frame rates: a very slow but working camera must
      // not display 0 FPS just because an integer rounded down to zero.
      this.stats.fps = Math.max(0.1, Math.round((this.frames * 10_000) / (now - this.fpsAt)) / 10);
      this.frames = 0;
      this.fpsAt = now;
      this.onStats?.({ ...this.stats });
    }
  }

  /** Step down to a smaller frame when the work per frame stays above SLOW_MS (to one that is really smaller). */
  private pace(ms: number, sides: number[]) {
    this.work = this.sinceResize++ ? this.work * 0.9 + ms * 0.1 : ms;
    if (this.work > SLOW_MS && this.sinceResize > (this.work > VERY_SLOW_MS ? 3 : 30) && this.size < sides.length - 1) {
      const now = Math.max(this.frame.width, this.frame.height);
      do this.size++; while (this.size < sides.length - 1 && sides[this.size] >= now);
      this.sinceResize = 0;
    }
  }

  /** The graphics-chip engine on this frame. Returns false when the look's files aren't loaded yet. */
  private paint(points: ReturnType<typeof toPoints>, w: number, h: number): boolean {
    const r = gpu();
    const own = this.minePicks ? (this.mine && this.mineFiles ? { ready: this.mine, files: this.mineFiles } : null) : undefined;
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
      };
    }
    const lip = this.lipstick ? lipChoice(files.lip, own ? own.ready.lip : this.lip, this.lipstick.swatch) : files.lip;
    const base = own ? own.ready.products : this.products;
    const products = base && this.lipstick ? { ...base, white: (own ? mineLight : productLight)(this.face, this.lipstick.swatch) } : undefined;
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
    r.render(this.frame, w, h, points, files, this.face, own ? "natural" : this.level, this.tris, lip, this.lipstick?.canon, undefined, products, this.vis, this.lips);
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
