import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { PARTS, handlesOf, linesOf, moved, viewOf, withMove, withOffsets, type Offsets, type Part } from "@/lib/outline";
import type { Pt } from "@/lib/tryon";
import { persian } from "@/lib/persian";
import { Button, haptic } from "./ui";

/*
 * Her own outlines on her photo: per part (lips, eyes, brows, face edge) the face model's outline with a few
 * points she moves. One finger always moves a point, never the photo: touching near a point takes that point,
 * touching anywhere else moves the point already taken (so her finger doesn't hide it), and it follows her finger
 * by as much as her finger moves. Two fingers zoom and move the photo (also the wheel and the +/- buttons). The
 * arrows nudge the taken point a pixel at a time, and a loupe shows the point while she moves it. The buttons sit
 * under the photo, so every point on it can be reached.
 */

/** Sizes as shares of the stage's width (the page may be shown scaled): a point, how near a touch takes a point. */
const DOT = 0.022, REACH = 0.1;
/** Loupe size (share of the stage) and zoom; how far she can zoom in from the part's view; the +/- step. */
const LOUPE = 0.3, LOUPE_ZOOM = 2.6, MAX_ZOOM = 5, ZOOM_STEP = 1.5;
/** A nudge moves the point this many screen pixels. */
const NUDGE = 1.5;

type View = [number, number, number];   // x, y, side (photo pixels)
type Props = {
  /** Her photo (shown) and its size; the face model's points on it; her moves so far. */
  photo: string; width: number; height: number; auto: Pt[]; offsets: Offsets;
  start: Part;
  onApply: (offsets: Offsets) => void;
  onCancel: () => void;
};
type Gesture =
  | { kind: "point"; k: number; sx: number; sy: number; x: number; y: number; moved: boolean }
  | { kind: "pinch"; d: number; at: [number, number]; view: View };

export default function OutlineEditor({ photo, width, height, auto, offsets, start, onApply, onCancel }: Props) {
  const [part, setPart] = useState<Part>(start);
  const [moves, setMoves] = useState<Offsets>(offsets);
  const home = useMemo(() => viewOf(part, auto), [part, auto]);
  const [view, setView] = useState<View>(home);
  const [picked, setPicked] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [box, setBox] = useState({ w: 360, m: 360 });   // the stage's width and its shorter side (screen pixels)
  const svg = useRef<SVGSVGElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, [number, number]>());
  const gesture = useRef<Gesture | null>(null);

  // Another part (or her outlines found again): its own view, nothing picked, in the same render (an effect would
  // show one frame of the new part under the old zoom, and a finger landing then would move at the old scale).
  const [homeShown, setHomeShown] = useState(home);
  if (homeShown !== home) { setHomeShown(home); setView(home); setPicked(null); }

  const points = useMemo(() => withOffsets(auto, moves, width), [auto, moves, width]);
  const base = useMemo(() => handlesOf(part, auto), [part, auto]);
  const partMoves = moves[part] ?? [];
  const handles = base.map((h) => ({ ...h, x: h.x + (partMoves[h.k]?.[0] ?? 0) * width, y: h.y + (partMoves[h.k]?.[1] ?? 0) * width }));
  const lines = linesOf(part, points);
  const info = PARTS.find((p) => p.id === part)!;
  const changed = (p: Part) => moved(moves[p]);
  const unit = view[2] / box.m;                       // photo pixels per screen pixel

  /* Bring the editor's top into view in whatever scrolls it (the nearest scrolling box; else the page). */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let box: HTMLElement | null = el.parentElement;
    while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
    const dy = el.getBoundingClientRect().top - (box ? box.getBoundingClientRect().top : 0) - 8;
    if (Math.abs(dy) > 2) (box ?? window).scrollBy({ top: dy });   // at once: a finger must not land on a moving photo
  }, []);

  /* Inside an app's web view, the app may take a finger's movement for its own scrolling unless the page keeps it. */
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const keep = (event: TouchEvent) => { if (event.cancelable) event.preventDefault(); };
    el.addEventListener("touchstart", keep, { passive: false });
    el.addEventListener("touchmove", keep, { passive: false });
    return () => { el.removeEventListener("touchstart", keep); el.removeEventListener("touchmove", keep); };
  }, []);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setBox({ w: r.width, m: Math.min(r.width, r.height) }); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Screen point to photo point on a view. */
  function toPhoto(v: View, sx: number, sy: number): [number, number] {
    const r = svg.current!.getBoundingClientRect(), m = Math.min(r.width, r.height), u = v[2] / m;
    return [v[0] + (sx - r.left - (r.width - m) / 2) * u, v[1] + (sy - r.top - (r.height - m) / 2) * u];
  }
  /** The view of this side that shows photo point `p` at screen point (sx, sy), kept over the photo. */
  function viewAt(side: number, p: [number, number], sx: number, sy: number): View {
    const r = svg.current!.getBoundingClientRect(), m = Math.min(r.width, r.height);
    const s = Math.min(Math.max(side, home[2] / MAX_ZOOM), Math.max(width, height, home[2]) * 1.2), u = s / m;
    let x = p[0] - (sx - r.left - (r.width - m) / 2) * u, y = p[1] - (sy - r.top - (r.height - m) / 2) * u;
    x = Math.min(Math.max(x, -s / 2), width - s / 2); y = Math.min(Math.max(y, -s / 2), height - s / 2);
    return [x, y, s];
  }

  function place(k: number, x: number, y: number) {
    const h = base.find((item) => item.k === k);
    if (!h) return;
    x = Math.min(width, Math.max(0, x)); y = Math.min(height, Math.max(0, y));
    setMoves((all) => ({ ...all, [part]: withMove(all[part], k, (x - h.x) / width, (y - h.y) / width) }));
  }

  function onDown(event: PointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    // a first finger starts afresh: a finger whose lifting never reached the page must not turn this into zooming
    if (event.isPrimary) { pointers.current.clear(); gesture.current = null; }
    pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
    const all = [...pointers.current.values()];
    if (all.length >= 2) {           // two fingers: zoom and move the photo (the point stays where it was)
      const g = gesture.current;
      if (g?.kind === "point" && g.moved) place(g.k, g.x, g.y);
      gesture.current = { kind: "pinch", d: Math.hypot(all[0][0] - all[1][0], all[0][1] - all[1][1]) || 1, at: [(all[0][0] + all[1][0]) / 2, (all[0][1] + all[1][1]) / 2], view };
      setDragging(false);
      return;
    }
    // one finger: the point near it, else the point already taken, else the nearest one
    const p = toPhoto(view, event.clientX, event.clientY);
    let near = -1, nearD = Infinity;
    handles.forEach((h) => { const d = Math.hypot(h.x - p[0], h.y - p[1]); if (d < nearD) { near = h.k; nearD = d; } });
    const k = nearD <= REACH * box.w * unit || picked == null ? near : picked;
    const h = handles.find((item) => item.k === k);
    if (!h) return;
    // taken once the finger moves or lifts (a second finger first means zooming, and changes nothing)
    gesture.current = { kind: "point", k, sx: event.clientX, sy: event.clientY, x: h.x, y: h.y, moved: false };
  }

  function take(k: number) {
    if (k !== picked) { haptic(); setPicked(k); }
  }

  function onMove(event: PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "point") {        // the point moves as much as her finger does
      const dx = event.clientX - g.sx, dy = event.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) < 3) return;
      if (!g.moved) take(g.k);
      g.moved = true;
      setDragging(true);
      place(g.k, g.x + dx * unit, g.y + dy * unit);
    } else {
      const all = [...pointers.current.values()];
      if (all.length < 2) return;
      const d = Math.hypot(all[0][0] - all[1][0], all[0][1] - all[1][1]) || 1;
      setView(viewAt(g.view[2] * (g.d / d), toPhoto(g.view, g.at[0], g.at[1]), (all[0][0] + all[1][0]) / 2, (all[0][1] + all[1][1]) / 2));
    }
  }

  function onUp(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (g?.kind === "point" && !g.moved && event.type === "pointerup") take(g.k);   // a tap takes the point
    if (pointers.current.size === 0 || gesture.current?.kind === "pinch") gesture.current = null;   // after two fingers, lift both
    setDragging(false);
  }

  function onWheel(event: WheelEvent<SVGSVGElement>) {
    setView(viewAt(view[2] * Math.exp(event.deltaY * 0.0015), toPhoto(view, event.clientX, event.clientY), event.clientX, event.clientY));
  }

  function zoomBy(k: number) {
    haptic();
    const r = svg.current!.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    setView(viewAt(view[2] / k, toPhoto(view, cx, cy), cx, cy));
  }

  /** Nudge the taken point (arrows on screen, or arrow keys on a focused point; shift: more). */
  function nudge(k: number | null, dx: number, dy: number, more = false) {
    if (k == null) return;
    const h = handles.find((item) => item.k === k);
    const step = NUDGE * (more ? 4 : 1) * unit;
    if (h) { setPicked(k); place(k, h.x + dx * step, h.y + dy * step); }
  }
  function onKey(event: KeyboardEvent<SVGCircleElement>, k: number) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!d) return;
    event.preventDefault();
    nudge(k, d[0], d[1], event.shiftKey);
  }

  function resetPart() {
    haptic();
    setMoves((all) => { const next = { ...all }; delete next[part]; return next; });
    setView(home);
  }

  const dot = DOT * box.w * unit, stroke = 1.6 * unit;
  const held = dragging && picked != null ? handles.find((h) => h.k === picked) : undefined;
  const loupeSide = (LOUPE * box.w * unit) / LOUPE_ZOOM;
  const loupeLeft = held ? held.x > view[0] + view[2] / 2 : false;

  const scene = (k: number) => (
    <>
      <image href={photo} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />
      {lines.map((line, i) => (
        <polygon key={i} points={line.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="#fff" strokeOpacity={0.9}
          strokeWidth={stroke / k} strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 1px rgb(0 0 0 / .6))" }} />
      ))}
      {handles.map((h, i) => (
        <circle key={h.k} cx={h.x} cy={h.y} r={(picked === h.k ? dot * 1.25 : dot) / k} className="contour__dot" data-picked={picked === h.k ? "" : undefined}
          strokeWidth={(stroke * 1.2) / k} {...(k === 1 ? {
            tabIndex: 0, role: "button", "aria-pressed": picked === h.k,
            "aria-label": `نقطهٔ ${persian(i + 1)} از ${persian(handles.length)} · ${info.name}`,
            onKeyDown: (event: KeyboardEvent<SVGCircleElement>) => onKey(event, h.k), onFocus: () => setPicked(h.k),
          } : {})} />
      ))}
    </>
  );

  return (
    <div ref={root} className="contour" role="group" aria-label="تنظیم خطوط صورت">
      <div className="contour__stage">
        <svg ref={svg} className="contour__view" viewBox={`${view[0]} ${view[1]} ${view[2]} ${view[2]}`} preserveAspectRatio="xMidYMid meet"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} data-part={part}>
          {scene(1)}
        </svg>
        {held ? (
          <svg className="contour__loupe" data-side={loupeLeft ? "left" : "right"} aria-hidden="true"
            viewBox={`${held.x - loupeSide / 2} ${held.y - loupeSide / 2} ${loupeSide} ${loupeSide}`}>
            {scene(LOUPE_ZOOM)}
            <path d={`M${held.x - loupeSide * 0.12} ${held.y}h${loupeSide * 0.24}M${held.x} ${held.y - loupeSide * 0.12}v${loupeSide * 0.24}`}
              stroke="#fff" strokeWidth={unit / LOUPE_ZOOM} />
          </svg>
        ) : null}
      </div>
      <div className="contour__tools">
        <div className="contour__zoom" role="group" aria-label="اندازهٔ نمایش">
          <button type="button" aria-label="کوچک‌نمایی" onClick={() => zoomBy(1 / ZOOM_STEP)}>−</button>
          <button type="button" aria-label="بزرگ‌نمایی" onClick={() => zoomBy(ZOOM_STEP)}>+</button>
        </div>
        <div className="contour__nudge" role="group" aria-label="جابه‌جایی دقیق نقطه">
          <button type="button" aria-label="چپ" disabled={picked == null} onClick={() => nudge(picked, -1, 0)}>◀</button>
          <button type="button" aria-label="بالا" disabled={picked == null} onClick={() => nudge(picked, 0, -1)}>▲</button>
          <button type="button" aria-label="پایین" disabled={picked == null} onClick={() => nudge(picked, 0, 1)}>▼</button>
          <button type="button" aria-label="راست" disabled={picked == null} onClick={() => nudge(picked, 1, 0)}>▶</button>
        </div>
      </div>

      <div className="contour__parts" role="tablist" aria-label="بخش‌های صورت">
        {PARTS.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === part} onClick={() => { haptic(); setPart(p.id); }}>
            {p.name}{changed(p.id) ? <i aria-label="تنظیم شده" /> : null}
          </button>
        ))}
      </div>
      <p className="contour__hint">
        {info.hint}
        <small>یک انگشت: نقطه را جابه‌جا می‌کند (هر جای عکس بکشید) · دو انگشت: بزرگ‌نمایی و حرکت عکس · فلش‌ها: جابه‌جایی دقیق</small>
      </p>
      <div className="contour__actions">
        <Button variant="secondary" size="sm" icon="undo" onClick={resetPart} disabled={!changed(part)}>بازنشانی</Button>
        <Button variant="secondary" size="sm" icon="close" onClick={onCancel}>لغو</Button>
        <Button variant="gold" size="sm" icon="check" onClick={() => { haptic(); onApply(moves); }}>اعمال</Button>
      </div>
    </div>
  );
}
