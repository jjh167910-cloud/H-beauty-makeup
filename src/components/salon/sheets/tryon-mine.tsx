import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { persian } from "@/data/catalog";
import {
  MY_STEPS, filled, minePicks, mySteps, myStep, newStep, recipeLines, removeMakeup, saveMakeup, savedMakeups, stepCount,
  type MyMakeup, type MyShade, type MyStep, type MyStepDef, type SavedMakeup,
} from "@/data/my-makeup";
import type { Step } from "@/data/makeup-steps";
import { STEP_KEYS, paintMine, paintMineFull, tutorialShot, type Shot, type StepKey } from "@/lib/tryon";
import { READ, Tutor, skinTone } from "@/lib/tryon-tutor";
import { Icon } from "../icons";
import { Button, haptic } from "../ui";

/*
 * «میکاپ من»: her own makeup on her bare face, step by step (data/my-makeup.ts): per step a colour (eyeshadow: a lid
 * shade, a crease and outer-corner shade and an inner-corner light), finish, tool, placement and amount. Painted on her
 * photo by the phone's graphics chip (paintMine in lib/tryon.ts) as she changes anything, with undo and redo; zoomed in
 * to look closely; played back as her own step-by-step tutorial; worn in the live mirror; saved on her phone; sent with a
 * booking as text.
 */

/** Undo goes this far back; changes of one control this close together are one step back. */
const HISTORY = 60, MERGE_MS = 700;
/** Her photo zoomed in at most this much (two fingers, or the mouse wheel). */
const ZOOM_MAX = 5;
/** Her finger moves this far (pixels) before it moves the zoomed photo instead of holding it; held this long, her bare face. */
const DRAG = 6, HOLD_MS = 140, HOLD_ZOOMED_MS = 300;

/** Her skin colour changed by a shade's tint (foundation, concealer swatches). */
function tinted(hex: string, tint: [number, number, number] | undefined) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const t = tint ?? [1, 1, 1];
  return `rgb(${c.map((v, i) => Math.round(Math.min(1, (v ** 2.2 * t[i]) ** (1 / 2.2)) * 255)).join(" ")})`;
}

export default function TryOnMine({ shot, recipe, onRecipe, onBook, onLive }: {
  shot: Shot; recipe: MyMakeup; onRecipe: (next: MyMakeup) => void; onBook: (recipe: MyMakeup, name: string) => void;
  /** Wear it in the live mirror (absent: no camera here). */
  onLive?: (recipe: MyMakeup) => void;
}) {
  const small = useMemo(() => tutorialShot(shot), [shot]);
  const skin = useMemo(() => skinTone(small), [small]);
  const view = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<StepKey>(() => MY_STEPS.find((d) => recipe[d.key])?.key ?? "base");
  /** Before and after side by side: where the divider is (percent of the photo's frame, from its left), null: off. */
  const [split, setSplit] = useState<number | null>(null);
  const splitAt = useRef<number | null>(null);
  splitAt.current = split;
  /** Her photo with her makeup as last painted, kept whole: the divider moves over it without painting again. */
  const after = useRef<HTMLCanvasElement | null>(null);
  /** Her photo zoomed (z) and moved (tx, ty: pixels of the stage) with two fingers; kept out of React (every move). */
  const zoom = useRef({ z: 1, tx: 0, ty: 0 });
  const [zoomed, setZoomed] = useState(false);
  const fingers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ d: number; z: number; m: [number, number]; tx: number; ty: number } | null>(null);
  /** One finger on the photo: where it went down and where the photo was (it moves the photo once zoomed in). */
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  /** After two fingers, one finger does nothing until every finger is up. */
  const settle = useRef(false);
  const [peek, setPeek] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState<SavedMakeup[]>(() => savedMakeups());
  /** The saved makeup she's editing (saving again replaces it), and the save form's name (null: closed). */
  const [current, setCurrent] = useState<SavedMakeup | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [note, setNote] = useState("");
  /** Her own tutorial: the steps, where it is (null: off; -1 her bare photo; n: done), playing by itself, a step going on. */
  const [tour, setTour] = useState<{ steps: Step[]; at: number } | null>(null);
  const [auto, setAutoState] = useState(true);
  const autoOn = useRef(true);
  const setAuto = (on: boolean) => { autoOn.current = on; setAutoState(on); };
  const card = useRef<HTMLElement>(null);
  const [moving, setMoving] = useState(false);
  const tutor = useRef<Tutor | null>(null);
  const state = useRef({ recipe, peek });
  state.current = { recipe, peek };
  const running = useRef(false), wanted = useRef(false), alive = useRef(true);
  const holdTimer = useRef(0);
  const past = useRef<MyMakeup[]>([]), future = useRef<MyMakeup[]>([]);
  const lastChange = useRef<{ key: string; at: number } | null>(null);
  const [, setHistoryTick] = useState(0);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; tutor.current?.stop(); tutor.current = null; };
  }, []);

  /** Paint her photo with her makeup as it is now: at most once per screen refresh, the latest state each time. */
  async function pump() {
    if (running.current) { wanted.current = true; return; }
    running.current = true;
    view.current?.setAttribute("data-busy", "");          // (outside React: for tests, and no re-render per frame)
    try {
      do {
        wanted.current = false;
        const c = view.current;
        if (!c || !alive.current || tutor.current) break;   // (her tutorial draws the picture itself)
        const { recipe: r, peek: before } = state.current;
        const picks = before ? null : minePicks(r);
        try {
          const frame = picks ? await paintMine(small, picks) : small.photo;
          if (!alive.current || tutor.current) break;
          const a = (after.current ??= document.createElement("canvas"));
          if (a.width !== c.width || a.height !== c.height) { a.width = c.width; a.height = c.height; }
          a.getContext("2d")!.drawImage(frame, 0, 0);
          show();
          setError(false);
        } catch {
          setError(true);
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      } while (wanted.current);
    } finally {
      running.current = false;
      view.current?.removeAttribute("data-busy");
    }
  }

  /**
   * Her makeup on the photo; with the divider on, her bare face to its right (as the look's before and after). The
   * divider is a place in the photo's frame on the screen, so it stays put however the photo is zoomed.
   */
  function show() {
    const c = view.current, a = after.current;
    if (!c || !a) return;
    const g = c.getContext("2d")!;
    g.drawImage(a, 0, 0);
    const cut = splitAt.current, st = stage.current;
    if (cut == null || !st) return;
    const box = c.getBoundingClientRect(), on = st.getBoundingClientRect(), k = Math.min(box.width / c.width, box.height / c.height);
    const ox = box.left - on.left + (box.width - c.width * k) / 2;
    const x = Math.min(c.width, Math.max(0, Math.round(((cut / 100) * on.width - ox) / k)));
    if (x < c.width) g.drawImage(small.photo, x, 0, c.width - x, c.height, x, 0, c.width - x, c.height);
  }
  useEffect(() => { show(); }, [split]);

  useEffect(() => {
    const c = view.current;
    if (!c) return;
    c.width = small.photo.width; c.height = small.photo.height;
    c.getContext("2d")!.drawImage(small.photo, 0, 0);
  }, [small]);
  useEffect(() => { pump(); }, [recipe, peek, small]);

  /* -- her changes, with undo and redo -- */

  /** A change to her recipe (one step back for undo; changes of the same control in a row merge into one). */
  function commit(next: MyMakeup, merge?: string) {
    const now = performance.now(), prev = lastChange.current;
    if (!(merge && prev?.key === merge && now - prev.at < MERGE_MS)) {
      past.current = [...past.current, recipe].slice(-HISTORY);
      future.current = [];
    }
    lastChange.current = merge ? { key: merge, at: now } : null;
    setHistoryTick((t) => t + 1);
    onRecipe(next);
  }
  function undo() {
    const prev = past.current[past.current.length - 1];
    if (!prev) return;
    haptic();
    past.current = past.current.slice(0, -1);
    future.current = [recipe, ...future.current];
    lastChange.current = null;
    setHistoryTick((t) => t + 1);
    onRecipe(prev);
  }
  function redo() {
    const next = future.current[0];
    if (!next) return;
    haptic();
    future.current = future.current.slice(1);
    past.current = [...past.current, recipe].slice(-HISTORY);
    lastChange.current = null;
    setHistoryTick((t) => t + 1);
    onRecipe(next);
  }

  const def = myStep.get(at)!;
  const raw = recipe[at];
  const step = raw ? filled(def, raw) : null;
  const shown = filled(def, raw ?? newStep());
  const count = stepCount(recipe);
  useEffect(() => {          // her choices on this step in view in their rows (a row scrolls sideways; the page doesn't move)
    card.current?.querySelectorAll<HTMLElement>(".tryon__swatches [aria-pressed=true]").forEach((el) => {
      const row = el.parentElement!, a = el.getBoundingClientRect(), b = row.getBoundingClientRect();
      if (a.left < b.left || a.right > b.right) row.scrollBy({ left: a.left - b.left - (b.width - a.width) / 2 });
    });
  }, [at, Boolean(tour)]);

  /** Change the current step (added, with the first of everything, if she hadn't yet). */
  function update(patch: Partial<MyStep>, merge?: string) {
    if (!merge) haptic();
    commit({ ...recipe, [at]: { ...(recipe[at] ?? newStep()), ...patch } }, merge);
  }
  function remove() {
    haptic();
    const next = { ...recipe };
    delete next[at];
    commit(next);
  }
  /* -- looking closely: two fingers (or the mouse wheel) zoom in on her photo, one finger moves it; holding it, her bare face -- */
  function applyZoom(z: number, tx: number, ty: number) {
    const c = view.current;
    if (!c) return;
    const W = c.offsetWidth, H = c.offsetHeight;
    z = Math.min(ZOOM_MAX, Math.max(1, z));
    tx = Math.min(0, Math.max(W - W * z, tx)); ty = Math.min(0, Math.max(H - H * z, ty));
    zoom.current = { z, tx, ty };
    c.style.transformOrigin = "0 0";
    c.style.transform = z > 1.001 ? `translate(${tx}px, ${ty}px) scale(${z})` : "";
    setZoomed(z > 1.05);
    if (splitAt.current != null) show();
  }
  /** Zoom by `f` keeping the point (x, y) of the stage where it is. */
  function zoomAt(f: number, x: number, y: number) {
    const { z, tx, ty } = zoom.current, z2 = Math.min(ZOOM_MAX, Math.max(1, z * f));
    applyZoom(z2, x - ((x - tx) * z2) / z, y - ((y - ty) * z2) / z);
  }
  function resetZoom() { haptic(); applyZoom(1, 0, 0); }
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (tutor.current) return;
      event.preventDefault();
      const on = el.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - on.left, event.clientY - on.top);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const local = (p: [number, number]): [number, number] => {
    const on = stage.current!.getBoundingClientRect();
    return [p[0] - on.left, p[1] - on.top];
  };

  function down(event: ReactPointerEvent<HTMLElement>) {
    if (tour) return;
    fingers.current.set(event.pointerId, [event.clientX, event.clientY]);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (fingers.current.size >= 2) {           // two fingers: zoom and move
      const [a, b] = [...fingers.current.values()];
      const { z, tx, ty } = zoom.current;
      pinch.current = { d: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])), z, m: local([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), tx, ty };
      settle.current = true;
      drag.current = null;
      hold(false);
      return;
    }
    if (settle.current || split != null) return;
    drag.current = { x: event.clientX, y: event.clientY, tx: zoom.current.tx, ty: zoom.current.ty, moved: false };
    hold(true);
  }
  function move(event: ReactPointerEvent<HTMLElement>) {
    if (tour) return;
    if (fingers.current.has(event.pointerId)) fingers.current.set(event.pointerId, [event.clientX, event.clientY]);
    const pz = pinch.current;
    if (pz && fingers.current.size >= 2) {
      const [a, b] = [...fingers.current.values()], m = local([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      const z2 = Math.min(ZOOM_MAX, Math.max(1, (pz.z * Math.hypot(a[0] - b[0], a[1] - b[1])) / pz.d));
      applyZoom(z2, m[0] - ((pz.m[0] - pz.tx) * z2) / pz.z, m[1] - ((pz.m[1] - pz.ty) * z2) / pz.z);
      return;
    }
    const d = drag.current;
    if (!d || settle.current) return;
    const dx = event.clientX - d.x, dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG) return;
    d.moved = true;
    hold(false);                                // (moving her finger: she wants to look elsewhere, not at her bare face)
    if (zoom.current.z > 1.001) applyZoom(zoom.current.z, d.tx + dx, d.ty + dy);
  }
  function up(event: ReactPointerEvent<HTMLElement>) {
    fingers.current.delete(event.pointerId);
    if (pinch.current || settle.current) {
      if (fingers.current.size < 2) pinch.current = null;
      if (fingers.current.size === 0) settle.current = false;
      return;
    }
    drag.current = null;
    hold(false);
  }
  function hold(on: boolean) {
    window.clearTimeout(holdTimer.current);
    if (on) holdTimer.current = window.setTimeout(() => setPeek(true), zoom.current.z > 1.001 ? HOLD_ZOOMED_MS : HOLD_MS);
    else setPeek(false);
  }

  /* -- her own tutorial: her recipe going on step by step, with her shapes as the guides -- */

  const tourRun = useRef(0);
  function startTour() {
    const steps = mySteps(recipe), picks = minePicks(recipe), c = view.current;
    if (!steps.length || !picks || !c) return;
    haptic();
    const colors = Object.fromEntries(STEP_KEYS.map((k) => [k, "#d9a6a0"])) as Record<StepKey, string>;
    // (foundation and concealer in her skin's colour, a contour her skin deeper: as their swatches show them)
    for (const s of steps) colors[s.key] = s.key === "base" || s.key === "conceal" ? skin : s.colors[0] ?? swatch(myStep.get(s.key)!, recipe[s.key] ?? null);
    const quick = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    tutor.current?.stop();
    tutor.current = new Tutor(c, small, steps, "no-makeup", "natural", null, picks.blush?.place ?? "apples", colors, quick, null, picks);
    setAuto(true);
    applyZoom(1, 0, 0);
    setTour({ steps, at: -1 });
    goTour(0, steps);
  }
  /** Show step i of her tutorial (applied, with its guide); playing by itself, the next one follows after a pause to read. */
  async function goTour(i: number, steps = tour?.steps ?? []) {
    const t = tutor.current;
    if (!t) return;
    const run = ++tourRun.current, n = steps.length, k = Math.max(-1, Math.min(i, n));
    setTour({ steps, at: k });
    if (k < 0 || k >= n) { setMoving(false); await t.show(k < 0 ? 0 : n).catch(() => setError(true)); if (k >= n) setAuto(false); return; }
    setMoving(true);
    haptic();
    const finished = await t.play(k).catch(() => false);
    if (run !== tourRun.current) return;
    setMoving(false);
    if (finished && autoOn.current) window.setTimeout(() => { if (run === tourRun.current && autoOn.current) goTour(k + 1, steps); }, READ);
  }
  function endTour() {
    tourRun.current++;
    tutor.current?.stop();
    tutor.current = null;
    setTour(null);
    setMoving(false);
    pump();
  }
  useEffect(() => { if (tour) endTour(); }, [recipe]);   // (a change of her recipe ends her tutorial)

  /* -- saving, her saved makeups, booking -- */

  function thumb(): string | undefined {
    const c = view.current;
    if (!c) return undefined;
    const P = small.points;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 468; i++) { x0 = Math.min(x0, P[i][0]); x1 = Math.max(x1, P[i][0]); y0 = Math.min(y0, P[i][1]); y1 = Math.max(y1, P[i][1]); }
    const t = document.createElement("canvas");
    t.width = 96; t.height = 120;
    const w = (x1 - x0) * 1.15, h = w * 1.25, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    t.getContext("2d")!.drawImage(c, cx - w / 2, cy - h / 2, w, h, 0, 0, t.width, t.height);
    try { return t.toDataURL("image/jpeg", 0.72); } catch { return undefined; }
  }
  function save() {
    const name = (naming ?? "").trim() || `میکاپ من ${persian(saved.length + 1)}`;
    const item: SavedMakeup = { id: current?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, at: Date.now(), recipe, thumb: thumb() };
    haptic();
    if (saveMakeup(item)) { setSaved(savedMakeups()); setCurrent(item); setNote(`«${name}» روی همین گوشی ذخیره شد.`); }
    else setNote("ذخیره ممکن نشد؛ حافظه مرورگر پر است یا اجازه ذخیره ندارد.");
    setNaming(null);
  }
  function load(item: SavedMakeup) {
    haptic();
    setCurrent(item);
    commit(item.recipe);
    setAt(MY_STEPS.find((d) => item.recipe[d.key])?.key ?? "base");
    setNote(`«${item.name}» باز شد.`);
  }
  function drop(item: SavedMakeup) {
    haptic();
    removeMakeup(item.id);
    setSaved(savedMakeups());
    if (current?.id === item.id) setCurrent(null);
    setNote(`«${item.name}» حذف شد.`);
  }
  async function download() {
    const picks = minePicks(recipe);
    if (!picks) return;
    haptic();
    try {
      const c = await paintMineFull(shot, picks);
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("blob");
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = "h-beauty-my-makeup.jpg"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setNote("ساختن عکس ممکن نشد.");
    }
  }
  function startOver() {
    haptic();
    commit({});
    setCurrent(null);
    setAt("base");
    setNote("");
  }

  const swatch = (d: MyStepDef, s: MyStep | null) => {
    const shade = d.shades.find((x) => x.id === s?.shade) ?? d.shades[0];
    return shade?.hex ?? (shade?.tint ? tinted(skin, shade.tint) : "#1b1311");
  };
  const keep = { onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation() };
  const tourStep = tour && tour.at >= 0 && tour.at < tour.steps.length ? tour.steps[tour.at] : null;
  /** A row of swatches with "none" first (eyeshadow's second shade and inner-corner light). */
  const optional = (label: string, list: MyShade[], value: string | undefined, set: (id: string | undefined) => void) => (
    <div className="mine__group">
      <span>{label} <small>{list.find((x) => x.id === value)?.name ?? "بدون"}</small></span>
      <div className="tryon__swatches" role="group" aria-label={label}>
        <button type="button" className="tryon__swatch tryon__swatch--look" aria-pressed={!value} onClick={() => set(undefined)}>بدون</button>
        {list.map((x) => (
          <button key={x.id} type="button" className="tryon__swatch" data-finish={x.finish} aria-label={x.name} title={x.name}
            aria-pressed={value === x.id} style={{ "--swatch": x.hex } as CSSProperties} onClick={() => set(x.id)} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="steps mine">
      <div ref={stage} className="tryon__stage steps__stage mine__stage" data-zoomed={zoomed ? "" : undefined}
        data-tour={tour ? tourStep?.key ?? (tour.at < 0 ? "start" : "end") : undefined} data-moving={moving ? "" : undefined}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => { if (!fingers.current.size) hold(false); }}
        onContextMenu={(event) => event.preventDefault()}>
        <canvas ref={view} className="steps__view" role="img" data-steps={count}
          aria-label={peek ? "عکس شما بدون میکاپ" : tourStep ? `آموزش میکاپ من: ${tourStep.title}` : count ? `عکس شما با میکاپ خودتان، ${persian(count)} قدم` : "عکس شما بدون میکاپ"} />
        {peek ? <span className="tryon__tag tryon__tag--before">بدون میکاپ</span> : null}
        {split != null && !tour ? (
          <>
            <span className="tryon__divider" style={{ insetInlineEnd: `${split}%` }} aria-hidden="true" />
            <span className="tryon__tag tryon__tag--after">بعد</span>
            <span className="tryon__tag tryon__tag--before">قبل</span>
            <input className="tryon__slider" type="range" min={0} max={100} value={split} dir="ltr" aria-label="مقایسه قبل و بعد"
              onChange={(event) => setSplit(Number(event.target.value))} />
          </>
        ) : null}
        {!tour ? (
          <div className="mine__history" {...keep}>
            <button type="button" aria-label="برگرداندن" disabled={!past.current.length} onClick={undo}><Icon name="undo" size={18} /></button>
            <button type="button" aria-label="انجام دوباره" disabled={!future.current.length} onClick={redo}><Icon name="redo" size={18} /></button>
            {count ? (
              <button type="button" aria-label="مقایسه قبل و بعد کنار هم" aria-pressed={split != null}
                onClick={() => { haptic(); setSplit((x) => (x == null ? 50 : null)); }}><Icon name="compare" size={18} /></button>
            ) : null}
            {zoomed ? <button type="button" aria-label="اندازه اصلی عکس" onClick={resetZoom}><Icon name="zoomOut" size={18} /></button> : null}
          </div>
        ) : null}
        {tour ? (
          <div className="steps__bar" {...keep}>
            <button type="button" className="steps__nav" aria-label="قدم قبلی" disabled={tour.at <= 0} onClick={() => { setAuto(false); goTour(tour.at - 1, tour.steps); }}><Icon name="back" size={20} /></button>
            <div className="steps__label">
              <small>{tourStep ? `قدم ${persian(tour.at + 1)} از ${persian(tour.steps.length)}` : tour.at < 0 ? "میکاپ من" : "کامل شد"}</small>
              <strong>{tourStep ? tourStep.title : "میکاپ من، قدم‌به‌قدم"}</strong>
            </div>
            <button type="button" className="steps__nav" aria-label={auto ? "توقف پخش" : "پخش خودکار"} aria-pressed={auto}
              onClick={() => { haptic(); const next = !auto; setAuto(next); if (next && !moving) goTour(tour.at + 1, tour.steps); }}>
              <Icon name={auto ? "pause" : "play"} size={18} weight="fill" />
            </button>
            {tour.at >= tour.steps.length ? (
              <button type="button" className="steps__nav steps__nav--go" aria-label="بستن آموزش" onClick={endTour}><Icon name="check" size={20} weight="bold" /></button>
            ) : (
              <button type="button" className="steps__nav steps__nav--go" aria-label="قدم بعدی" onClick={() => { setAuto(false); goTour(tour.at + 1, tour.steps); }}><Icon name="forward" size={20} /></button>
            )}
          </div>
        ) : count === 0 ? (
          <span className="tryon__hint">از چهره بدون میکاپ شروع کنید؛ قدم‌ها را یکی‌یکی اضافه کنید</span>
        ) : null}
        {error ? <div className="tryon__busy" role="alert"><strong>نمایش میکاپ ممکن نشد</strong>
          <Button variant="light" size="sm" icon="rebook" onClick={() => pump()}>دوباره</Button></div> : null}
      </div>

      {tour ? (
        <section className="steps__card mine__card" aria-live="polite">
          {tourStep ? (
            <>
              <header><h3>{tourStep.title}</h3><small dir="ltr">{tourStep.en}</small></header>
              <dl className="steps__facts">
                <div><dt>محصول</dt><dd>{tourStep.colors.map((c) => <i key={c} className="steps__swatch" style={{ "--swatch": c } as CSSProperties} />)}{tourStep.product}</dd></div>
                <div><dt>ابزار</dt><dd>{tourStep.tool}</dd></div>
              </dl>
              <p className="steps__how">{tourStep.how}</p>
              {tourStep.tip ? <p className="steps__tip"><Icon name="magic" size={14} /> {tourStep.tip}</p> : null}
              <button type="button" className="steps__replay" disabled={moving} onClick={() => { setAuto(false); goTour(tour.at, tour.steps); }}><Icon name="rebook" size={14} /> دوباره نشان بده</button>
            </>
          ) : (
            <>
              <header><h3>{tour.at < 0 ? "میکاپ من، قدم‌به‌قدم" : "میکاپ شما کامل شد"}</h3></header>
              <p className="steps__how">{tour.at < 0 ? "هر قدم میکاپ خودتان با همان رنگ، ابزار و جای کار روی عکستان اجرا می‌شود و روش زدنش را می‌بینید."
                : "همین قدم‌ها را جلوی آینه تکرار کنید؛ هر قدم را از دکمه‌های روی عکس دوباره ببینید."}</p>
            </>
          )}
          <div className="steps__actions">
            <Button variant="secondary" icon="close" onClick={endTour}>بازگشت به ساختن میکاپ</Button>
          </div>
        </section>
      ) : (
        <>
          <ol className="steps__rail" aria-label="قدم‌های میکاپ من">
            {MY_STEPS.map((d) => (
              <li key={d.key}>
                <button type="button" aria-current={d.key === at ? "step" : undefined} data-done={recipe[d.key] ? "" : undefined}
                  onClick={() => { haptic(); setAt(d.key); }}>
                  <span className="steps__dot mine__dot" style={recipe[d.key] ? ({ "--swatch": swatch(d, recipe[d.key] ?? null) } as CSSProperties) : undefined}>
                    {recipe[d.key] ? null : <Icon name="plus" size={12} weight="bold" />}
                  </span>
                  <span>{d.title}</span>
                </button>
              </li>
            ))}
          </ol>

          <section ref={card} className="steps__card mine__card" aria-label={`${def.title} در میکاپ شما`}>
            <header>
              <h3>{def.title}</h3>
              {step ? <button type="button" className="mine__remove" onClick={remove}><Icon name="trash" size={14} /> حذف این قدم</button> : <small dir="ltr">{def.en}</small>}
            </header>
            <p className="steps__note">{step ? def.hint : `${def.hint} برای اضافه کردن، یک رنگ یا گزینه را انتخاب کنید.`}</p>

            {def.shades.length ? (
              <div className="mine__group">
                <span>{def.shades2 ? "رنگ پلک" : "رنگ"} <small>{def.shades.find((s) => s.id === shown.shade)?.name}</small></span>
                <div className="tryon__swatches" role="group" aria-label={`رنگ ${def.title}`}>
                  {def.shades.map((s) => (
                    <button key={s.id} type="button" className="tryon__swatch" data-finish={s.finish} aria-label={s.name} title={s.name}
                      aria-pressed={step?.shade === s.id} style={{ "--swatch": s.hex ?? tinted(skin, s.tint) } as CSSProperties}
                      onClick={() => update({ shade: s.id, ...(def.key === "shadow" || def.key === "lips" ? { finish: undefined } : {}) })} />
                  ))}
                </div>
              </div>
            ) : null}
            {def.shades2 ? optional("رنگ چین پلک و گوشه بیرونی", def.shades2, raw?.shade2, (id) => update({ shade2: id })) : null}
            {def.inners ? optional("نور گوشه چشم", def.inners, raw?.inner, (id) => update({ inner: id })) : null}
            {def.finishes ? (
              <div className="mine__group">
                <span>بافت</span>
                <div className="steps__chips" role="group" aria-label={`بافت ${def.title}`}>
                  {def.finishes.map((f) => (
                    <button key={f.id} type="button" className="chip" aria-pressed={step?.finish === f.id} onClick={() => update({ finish: f.id })}>{f.name}</button>
                  ))}
                </div>
              </div>
            ) : null}
            {def.places ? (
              <div className="mine__group">
                <span>{def.key === "lashes" || def.key === "liner" || def.key === "brows" || def.key === "lenses" ? "مدل" : "جای کار"}</span>
                <div className="steps__chips" role="group" aria-label={`جای ${def.title}`}>
                  {def.places.map((p) => (
                    <button key={p.id} type="button" className="chip" aria-pressed={step?.place === p.id} onClick={() => update({ place: p.id })}>{p.name}</button>
                  ))}
                  {def.key === "liner" ? (
                    <button type="button" className="chip" aria-pressed={Boolean(step?.lower)} onClick={() => update({ lower: !step?.lower })}>خط پایین چشم</button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {def.tools.length > 1 ? (
              <div className="mine__group">
                <span>ابزار</span>
                <div className="steps__chips" role="group" aria-label={`ابزار ${def.title}`}>
                  {def.tools.map((t) => (
                    <button key={t.id} type="button" className="chip" aria-pressed={step?.tool === t.id} onClick={() => update({ tool: t.id })}>{t.name}</button>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="steps__amount">
              <span>شدت</span>
              <input type="range" min={0} max={150} step={5} value={Math.round((step?.amount ?? 0) * 100)} dir="ltr" aria-label={`شدت ${def.title}`}
                onChange={(event) => update({ amount: Number(event.target.value) / 100 }, `amount:${at}`)} />
              <output>{persian(Math.round((step?.amount ?? 0) * 100))}٪</output>
            </label>
          </section>

          {count ? (
            <div className="mine__show">
              <Button variant="secondary" icon="play" onClick={startTour}>آموزش قدم‌به‌قدم میکاپ من</Button>
              {onLive ? <Button variant="secondary" icon="live" onClick={() => { haptic(); onLive(recipe); }}>آینه زنده با میکاپ من</Button> : null}
            </div>
          ) : null}

          <section className="mine__saved" aria-labelledby="mine-saved-title">
            <div className="mine__saved-head">
              <h3 id="mine-saved-title">میکاپ‌های من</h3>
              <small>{current ? `در حال ویرایش «${current.name}»` : "روی همین گوشی"}</small>
            </div>
            {saved.length ? (
              <ul className="mine__saved-list">
                {saved.map((s) => (
                  <li key={s.id} data-current={current?.id === s.id ? "" : undefined}>
                    <button type="button" className="mine__saved-open" onClick={() => load(s)} title={recipeLines(s.recipe).join("\n")}>
                      {s.thumb ? <img src={s.thumb} alt="" /> : <span className="mine__saved-empty"><Icon name="palette" size={20} /></span>}
                      <span>{s.name}</span>
                    </button>
                    <button type="button" className="mine__saved-drop" aria-label={`حذف ${s.name}`} onClick={() => drop(s)}><Icon name="close" size={13} /></button>
                  </li>
                ))}
              </ul>
            ) : <p className="steps__note">هنوز میکاپی ذخیره نکرده‌اید؛ میکاپ خودتان را بسازید و ذخیره کنید.</p>}
            {naming !== null ? (
              <form className="mine__name" onSubmit={(event) => { event.preventDefault(); save(); }}>
                <label className="field">
                  <span>نام این میکاپ</span>
                  <input value={naming} maxLength={40} autoFocus placeholder={`میکاپ من ${persian(saved.length + 1)}`} onChange={(event) => setNaming(event.target.value)} />
                </label>
                <div className="steps__actions">
                  <Button variant="gold" type="submit" icon="save">ذخیره</Button>
                  <Button variant="secondary" onClick={() => setNaming(null)}>انصراف</Button>
                </div>
              </form>
            ) : null}
            {note ? <p className="mine__note" role="status">{note}</p> : null}
          </section>

          <div className="steps__actions mine__actions">
            <Button variant="gold" icon="book" disabled={!count} onClick={() => onBook(recipe, current?.name ?? "میکاپ من")}>رزرو با این میکاپ</Button>
            <Button variant="secondary" icon="save" disabled={!count} onClick={() => setNaming(current?.name ?? "")}>{current ? "ذخیره تغییرات" : "ذخیره میکاپ"}</Button>
            <Button variant="tonal" icon="download" disabled={!count} onClick={download}>ذخیره عکس</Button>
            <Button variant="ghost" icon="rebook" disabled={!count} onClick={startOver}>از نو</Button>
          </div>
          <p className="tryon__fine">میکاپ‌ها فقط روی همین گوشی ذخیره می‌شوند. با رزرو، فقط دستور میکاپ (رنگ‌ها، ابزار و شدت هر قدم) برای سالن فرستاده می‌شود، نه عکس شما.</p>
        </>
      )}
    </div>
  );
}
