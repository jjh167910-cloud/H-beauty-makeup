import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { persian } from "@/lib/persian";
import { lookPhoto } from "@/data/makeup-photos";
import { FINISHES, LIPSTICKS, lipstickById } from "@/data/lipsticks";
import { styleById, variedLooks, type MakeupStyle } from "@/data/makeup-styles";
import { loadDraft, minePicks, saveDraft, type MyMakeup } from "@/data/my-makeup";
import {
  downloadMB, downloadModels, downloadHdModels, hdDownloadAvailable, hdModelsReady, HD_DOWNLOAD_MB, engine, errorText, faceShot, modelsReady, paintLook, paintThumb, preparePhoto, relight, studio, warmUp, withPoints,
  type Finish, type Level, type LipChoice, type Prepared, type ProductPicks, type Pt, type Shot, type StepKey,
} from "@/lib/tryon";
import { LiveMirror, type LiveStats } from "@/lib/live-tryon";
import { editedParts, outlineDoubt, withOffsets, type Doubt, type Offsets, type Part } from "@/lib/outline";
import OutlineEditor from "./tryon-outline";
import { Icon } from "./icons";
import { Button, Media, haptic } from "./ui";

const TryOnMine = lazy(() => import("./tryon-mine"));

/* AI makeup try-on on the customer's own photo or live camera. Runs fully on the phone; lazy-loaded. */

type Phase = "check" | "get" | "download" | "look-download" | "pick" | "live" | "face" | "sharp" | "paint" | "done" | "error";
const LEVELS: Array<[Level, string]> = [["soft", "ملایم"], ["natural", "طبیعی"], ["bold", "پررنگ"]];
/** Why the app suggests checking the outlines. */
const DOUBTS: Record<Doubt["reason"], string> = {
  profile: "صورت از نیم‌رخ است؛ اگر میکاپ جای دقیقش نیست، خطوط صورت را تنظیم کنید.",
  lips: "مرز لب‌ها در این عکس کم‌رنگ است؛ برای رژ دقیق‌تر خط لب را تنظیم کنید.",
  small: "صورت در عکس کوچک است؛ برای دقت بیشتر خطوط صورت را تنظیم کنید.",
};

/** Each part of her face's own intensity (percent of the look's), and the look's steps it scales. */
type Zone = "eyes" | "face" | "lips";
type Zones = Record<Zone, number>;
const ZONES: Array<[Zone, string, StepKey[]]> = [
  ["eyes", "چشم", ["shadow", "liner", "lashes"]],
  ["face", "پوست و گونه", ["base", "conceal", "contour", "blush", "glow"]],
  ["lips", "لب", ["lips"]],
];
const ZONES_AS_LOOK: Zones = { eyes: 100, face: 100, lips: 100 };
const zonesKey = (z: Zones) => `${z.eyes}.${z.face}.${z.lips}`;
/** For the engine: each step's intensity (null: all as the look). */
function picksFor(z: Zones): ProductPicks | null {
  if (zonesKey(z) === zonesKey(ZONES_AS_LOOK)) return null;
  const gain: Partial<Record<StepKey, number>> = {};
  for (const [zone, , steps] of ZONES) for (const step of steps) gain[step] = z[zone] / 100;
  return { gain };
}

/** Her lipstick pick: a shade from LIPSTICKS and/or a finish; null = the look's own. */
type LipPick = { shade: string | null; finish: Finish | null };
const LOOK_LIP: LipPick = { shade: null, finish: null };
const lipKey = (pick: LipPick) => `${pick.shade ?? "look"}.${pick.finish ?? "-"}`;
/** For the engine: the shade's swatch colour, and the finish (her pick, else the shade's own). */
function lipFor(pick: LipPick): LipChoice | null {
  const shade = pick.shade ? lipstickById.get(pick.shade) : undefined;
  if (!shade && !pick.finish) return null;
  return { shade: shade?.hex ?? null, finish: pick.finish ?? shade?.finish ?? null };
}

export default function TryOnView({ style, onBook }: {
  style: MakeupStyle;
  /** Book the look she's trying, or her own makeup (`mine`: its name and recipe). */
  onBook: (id: string, mine?: { name: string; recipe: MyMakeup }) => void;
}) {
  const [phase, setPhase] = useState<Phase>("check");
  const [progress, setProgress] = useState(0);
  const [hdStatus, setHdStatus] = useState<"checking" | "unavailable" | "available" | "downloading" | "ready">("checking");
  const [hdProgress, setHdProgress] = useState(0);
  const [hdError, setHdError] = useState("");
  const hdAbort = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [look, setLook] = useState(style.id);
  const [level, setLevel] = useState<Level>("natural");
  /** Her photo as taken ("p") and sharpened ("s"), when it was soft; each also in studio light ("pt", "st"). */
  const [before, setBefore] = useState<Record<string, string>>({});
  /** Show the sharpened photo (when there is one). */
  const [clear, setClear] = useState(true);
  /** Her photo in studio light (studio-gl.ts), before and after alike; on unless she turns it off. */
  const [lit, setLit] = useState(true);
  const [lip, setLip] = useState<LipPick>(LOOK_LIP);
  /** Results per look, intensity and photo ("id:level:p" / "id:level:s"). */
  const [after, setAfter] = useState<Record<string, string>>({});
  const [cut, setCut] = useState(50);
  const [sharpDone, setSharpDone] = useState(0);
  /** What the phone is doing to her photo: sharpening it, or redrawing her face in HD. */
  const [sharpStep, setSharpStep] = useState<"sharp" | "hd">("sharp");
  const [kind] = useState(engine);
  /** The finished look (with before / after), or her own makeup («میکاپ من»). */
  const [mode, setMode] = useState<"result" | "mine">("result");
  /** Her own makeup, kept on her phone between visits. */
  const [myMakeup, setMyMakeup] = useState<MyMakeup>(loadDraft);
  useEffect(() => { saveDraft(myMakeup); }, [myMakeup]);
  const prepared = useRef<Prepared | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const job = useRef(0);
  /** The latest photo she gave: an earlier one still being prepared is dropped. */
  const photoJob = useRef(0);
  const sourcePhoto = useRef<Blob | null>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const lastRun = useRef(1_500);
  const urls = useRef<string[]>([]);
  const liveView = useRef<HTMLCanvasElement>(null);
  const mirror = useRef<LiveMirror | null>(null);
  /** Her own makeup in the live mirror (null: the look). */
  const [liveMine, setLiveMine] = useState<MyMakeup | null>(null);
  const [live, setLive] = useState<LiveStats | null>(null);
  /** The face model's points on her photo (as taken / sharpened), her own outline moves, and the editor. */
  const auto = useRef<{ plain: Pt[]; sharp: Pt[] | null } | null>(null);
  const [outline, setOutline] = useState<Offsets>({});
  const [outlineVer, setOutlineVer] = useState(0);
  const [editing, setEditing] = useState<Part | null>(null);
  /** The app isn't sure it found her outlines well (null: it is, or she has seen the note). */
  const [doubt, setDoubt] = useState<Doubt | null>(null);
  /** Each part of her face's intensity, and whether its sliders are open. */
  const [zones, setZones] = useState<Zones>(ZONES_AS_LOOK);
  /** Where her finger has a slider while she moves it (painted when she lets go). */
  const [zoneDraft, setZoneDraft] = useState<Zones | null>(null);
  const [tuning, setTuning] = useState(false);
  /** Her photo without the makeup, while she holds the eye button. */
  const [peek, setPeek] = useState(false);
  /** The look rail: her own face in each look ("id:level:photo"), made one at a time while the phone is free. */
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbShot = useRef<{ key: string; shot: Shot } | null>(null);
  const thumbBusy = useRef(false);
  const [thumbTry, setThumbTry] = useState(0);
  /** The picture shown last: kept on screen, under the progress, while the next one is painted. */
  const shown = useRef<{ url: string; level: Level } | null>(null);

  useEffect(() => {
    let active = true;
    modelsReady([style.id]).then((ready) => {
      if (!active) return;
      setPhase(ready ? "pick" : "get");
      if (ready) warmUp(style.id);
    });
    return () => { active = false; job.current++; hdAbort.current?.abort(); mirror.current?.stop(); urls.current.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);

  async function download() {
    setPhase("download");
    setProgress(0);
    try {
      await downloadModels([style.id], setProgress, [lookPhoto(style.id, "sm")]);
      warmUp(style.id);
      setPhase("pick");
      haptic();
    } catch (reason) {
      setError(navigator.onLine === false ? "برای دانلود اولیه به اینترنت نیاز است." : errorText(reason));
      setPhase("error");
    }
  }

  // High-resolution model support is only checked after the app has produced a result.
  useEffect(() => {
    if (phase !== "done" || hdStatus !== "checking" || kind !== "gpu") return;
    let active = true;
    hdDownloadAvailable().then(async (available) => {
      const ready = available && await hdModelsReady();
      if (active) setHdStatus(!available ? "unavailable" : ready ? "ready" : "available");
    }).catch(() => { if (active) setHdStatus("unavailable"); });
    return () => { active = false; };
  }, [phase, hdStatus, kind]);

  async function enableHd() {
    if (hdAbort.current) return;
    const controller = new AbortController();
    hdAbort.current = controller;
    setHdStatus("downloading");
    setHdProgress(0);
    setHdError("");
    try {
      await downloadHdModels(setHdProgress, controller.signal);
      if (controller.signal.aborted) return;
      setHdStatus("ready");
      if (sourcePhoto.current) await takePhoto(sourcePhoto.current);
    } catch (reason) {
      setHdStatus("available");
      setHdError(controller.signal.aborted ? "" : navigator.onLine === false ? "برای دریافت HD به اینترنت نیاز است." : errorText(reason));
    } finally {
      if (hdAbort.current === controller) hdAbort.current = null;
    }
  }

  async function toUrl(c: HTMLCanvasElement, quality = 0.92): Promise<string> {
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw "failed";
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  }

  /** The photo to paint on: sharpened when she has that on and it exists, in studio light when she has that on and the phone can. */
  function shotFor(prep: Prepared, sharp: boolean, light: boolean = lit): [Shot, string] {
    const s = sharp && !!prep.sharp, relit = light ? (s ? prep.studio?.sharp : prep.studio?.plain) : null;
    return relit ? [relit, s ? "st" : "pt"] : s ? [prep.sharp!, "s"] : [prep.plain, "p"];
  }

  /** Her photos (as taken, sharpened, each in studio light) as pictures for the screen. */
  async function beforeUrls(prep: Prepared): Promise<Record<string, string>> {
    const shots: Array<[string, Shot | null | undefined]> = [["p", prep.plain], ["s", prep.sharp], ["pt", prep.studio?.plain], ["st", prep.studio?.sharp]];
    const out: Record<string, string> = {};
    for (const [key, shot] of shots) if (shot) out[key] = await toUrl(shot.photo);
    return out;
  }

  /** Paint a look on the current photo; `fresh` ignores results made for an earlier photo. */
  async function paint(id: string, fresh = false, lvl: Level = level, sharp = clear, pick: LipPick = lip, light = lit, z: Zones = zones) {
    const prep = prepared.current;
    if (!prep) return;
    setLook(id);
    const [shot, which] = shotFor(prep, sharp, light);
    const key = `${id}:${lvl}:${which}:${lipKey(pick)}:${zonesKey(z)}`;
    if (!fresh && after[key]) { setPhase("done"); return; }
    const ticket = ++job.current;
    if (!(await modelsReady([id]))) {
      if (ticket !== job.current) return;
      setPhase("look-download");
      setProgress(0);
      try {
        await downloadModels([id], setProgress, [lookPhoto(id, "sm")]);
      } catch (reason) {
        if (ticket === job.current) {
          setError(navigator.onLine === false ? "برای دریافت این سبک به اینترنت نیاز است." : errorText(reason));
          setPhase("error");
        }
        return;
      }
    }
    if (ticket !== job.current) return;
    setPhase("paint");
    // Estimated progress, written straight to the DOM once a second: no re-renders or
    // continuous animation while the phone's CPU is busy painting.
    const started = performance.now();
    const timer = window.setInterval(() => {
      const t = (performance.now() - started) / lastRun.current;
      if (bar.current) bar.current.style.width = `${Math.round(Math.min(0.95, 1 - Math.exp(-2.2 * t)) * 100)}%`;
    }, 1000);
    try {
      const url = await toUrl(await paintLook(shot, id, lvl, lipFor(pick), picksFor(z)));
      lastRun.current = Math.max(kind === "gpu" ? 400 : 2_000, performance.now() - started);
      if (ticket !== job.current) return;
      setAfter((map) => (fresh ? { [key]: url } : { ...map, [key]: url }));
      if (fresh) setCut(50);
      setPhase("done");
      haptic();
    } catch (reason) {
      if (ticket !== job.current) return;
      setError(errorText(reason));
      setPhase("error");
    } finally {
      window.clearInterval(timer);
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await takePhoto(file);
  }

  async function takePhoto(file: Blob) {
    sourcePhoto.current = file;
    job.current++;
    const ticket = ++photoJob.current;
    setAfter({});
    setThumbs({});
    shown.current = null;
    setPhase("face");
    try {
      const prep = await preparePhoto(file, (step, done) => { if (ticket === photoJob.current) { setPhase("sharp"); setSharpStep(step); setSharpDone(done); } });
      if (ticket !== photoJob.current) return;
      prepared.current = prep;
      auto.current = { plain: prep.plain.points, sharp: prep.sharp?.points ?? null };
      setOutline({}); setEditing(null); setDoubt(null);
      setBefore(await beforeUrls(prep));
      await paint(look, true);
      if (ticket !== photoJob.current) return;
      const shown = shotFor(prep, clear)[0];
      setDoubt(outlineDoubt(shown.points, shown.lips));
    } catch (reason) {
      if (ticket !== photoJob.current) return;
      prepared.current = null;
      setError(errorText(reason));
      setPhase("error");
    }
  }

  /** Her outline moves (from the editor): both photos get her points and the look is painted again. */
  function applyOutline(next: Offsets) {
    const prep = prepared.current, a = auto.current;
    setEditing(null);
    if (!prep || !a) return;
    const ownLips = editedParts(next).includes("lips");
    prep.plain = withPoints(prep.plain, withOffsets(a.plain, next, prep.plain.photo.width), ownLips);
    if (prep.sharp && a.sharp) prep.sharp = withPoints(prep.sharp, withOffsets(a.sharp, next, prep.sharp.photo.width), ownLips);
    if (prep.studio) {               // (the studio light follows her outline too)
      relight(prep);
      const ticket = photoJob.current;
      beforeUrls(prep).then((urls) => { if (ticket === photoJob.current) setBefore(urls); }).catch(() => undefined);
    }
    setOutline(next);
    setOutlineVer((v) => v + 1);
    setDoubt(null);
    setAfter({});
    setThumbs({});
    shown.current = null;
    paint(look, true);
  }

  /** Download the result photo. */
  function save(url: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = `h-beauty-${look}.jpg`;
    link.click();
  }

  /** Soft / natural / bold: repaints the photo (or the running mirror) at that intensity. */
  function changeLevel(next: Level) {
    if (next === level) return;
    haptic();
    setLevel(next);
    if (phase === "live") mirror.current?.setLevel(next);
    else if (prepared.current) paint(look, false, next);
  }

  /** One part of her face's intensity (repainted when she lets go of its slider). */
  function changeZone(zone: Zone, value: number, final: boolean) {
    const next = { ...(zoneDraft ?? zones), [zone]: value };
    if (!final) { setZoneDraft(next); return; }
    setZoneDraft(null);
    if (zonesKey(next) === zonesKey(zones)) return;
    setZones(next);
    haptic();
    if (phase === "live") mirror.current?.setProducts(picksFor(next));
    else if (prepared.current && mode === "result") paint(look, false, level, clear, lip, lit, next);
  }

  function resetZones() {
    haptic();
    setZoneDraft(null);
    setZones(ZONES_AS_LOOK);
    if (phase === "live") mirror.current?.setProducts(null);
    else if (prepared.current && mode === "result") paint(look, false, level, clear, lip, lit, ZONES_AS_LOOK);
  }

  /** Her lipstick: a shade (with its own finish), a finish, or back to the look's own. */
  function changeLip(next: LipPick) {
    haptic();
    setLip(next);
    if (phase === "live") mirror.current?.setLip(lipFor(next));
    else if (prepared.current && mode === "result") paint(look, false, level, clear, next);
  }

  /** Sharpened photo on / off (repaints the current look on that photo). */
  function toggleClear() {
    haptic();
    const next = !clear;
    setClear(next);
    paint(look, false, level, next);
  }

  /** Studio light and skin on / off: on her photo (repainted) and in the live mirror. */
  function toggleLit() {
    haptic();
    const next = !lit;
    setLit(next);
    if (phase === "live") mirror.current?.setStudio(next);
    else if (prepared.current && mode === "result") paint(look, false, level, clear, lip, next);
  }

  /** Live mirror: the camera starts once its canvas is on screen; leaving the phase stops it. */
  useEffect(() => {
    if (phase !== "live" || !liveView.current) return;
    const m = new LiveMirror(liveView.current, look, level, setLive, lipFor(lip), picksFor(zones));
    mirror.current = m;
    m.setStudio(lit);
    if (liveMine) m.setMine(minePicks(liveMine));
    let stopped = false;
    m.start().catch((reason) => {
      if (stopped) return;
      setError(errorText(reason));
      setPhase("error");
    });
    return () => { stopped = true; m.stop(); if (mirror.current === m) mirror.current = null; };
    // The look is switched on the running mirror (below), not by restarting the camera.
  }, [phase]);
  useEffect(() => { mirror.current?.setLook(look); }, [look]);

  useEffect(() => { if (phase !== "live") setLiveMine(null); }, [phase]);

  /** Open the live mirror with the look, or with her own makeup (`mine`). */
  function startLive(mine: MyMakeup | null = null) {
    job.current++;
    setLive(null);
    setLiveMine(mine);
    setPhase("live");
  }

  function closeLive() {
    if (prepared.current) paint(look);
    else setPhase("pick");
  }

  async function capture() {
    const m = mirror.current;
    if (!m) return;
    haptic();
    const shot = await m.snapshot().catch(() => null);
    if (shot) await takePhoto(shot);
  }

  const current = styleById.get(look) ?? style;
  const prep = prepared.current;
  const which = prep ? shotFor(prep, clear)[1] : "p";
  const result = after[`${look}:${level}:${which}:${lipKey(lip)}:${zonesKey(zones)}`];
  if (result) shown.current = { url: result, level };
  /** While the next picture is painted, the last one stays under the progress (not her bare photo). */
  const was = !result && phase === "paint" ? shown.current : null;
  const tuned = zoneDraft ?? zones;
  const shade = lip.shade ? lipstickById.get(lip.shade) : undefined;
  const lookFinish = current.look.lip;
  const finish = lip.finish ?? shade?.finish ?? lookFinish;
  const finishName = FINISHES.find(([key]) => key === finish)?.[1];
  const lipLabel = shade ? `${shade.name}${finishName ? ` · ${finishName}` : ""}` : `رژ همین سبک${lip.finish && finishName ? ` · ${finishName}` : ""}`;
  /** The look rail: her look first, then the looks most unlike those before (variedLooks). */
  const others = useMemo(() => variedLooks(style), [style]);
  const intro = phase === "check" || phase === "get" || phase === "download" || phase === "pick" || (phase === "error" && !before.p);
  const busy = phase === "paint" || phase === "face" || phase === "sharp" || phase === "look-download";
  /** Her own makeup needs the phone's graphics engine and a photo. */
  const canMine = kind === "gpu" && !!prep && (phase === "done" || phase === "error");
  const own = mode === "mine" && canMine;
  const shownAuto = auto.current ? (which.startsWith("s") && auto.current.sharp ? auto.current.sharp : auto.current.plain) : null;
  const shownShot = prep ? shotFor(prep, clear)[0] : null;
  const edited = editedParts(outline).length > 0;
  /** Her photo was sharpened (its switch); the studio light can be switched (the phone can run it). */
  const canSharp = !!prep?.sharp && phase !== "live";
  const canLight = phase === "live" ? kind === "gpu" && !!studio() : !!prep?.studio;
  const outlineOn = !own && !editing && phase === "done" && !!result;

  // The look rail: her face in each look, one at a time while the phone is free (graphics-chip engine; the rail's order,
  // so the looks she sees first come first). A look's files are let go once its picture is made.
  useEffect(() => {
    const prep = prepared.current;
    if (kind !== "gpu" || phase !== "done" || own || !prep || thumbBusy.current) return;
    const [shot, w] = shotFor(prep, clear);
    const next = others.find((item) => thumbs[`${item.id}:${level}:${w}`] === undefined);
    if (!next) return;
    const key = `${next.id}:${level}:${w}`, ticket = photoJob.current, shotKey = `${ticket}:${outlineVer}:${w}`;
    let started = false;
    const timer = window.setTimeout(async () => {
      started = true;
      thumbBusy.current = true;
      try {
        // Preview generation must never trigger an all-look background download.
        if (!(await modelsReady([next.id]))) {
          if (ticket === photoJob.current) setThumbs((map) => ({ ...map, [key]: "" }));
          return;
        }
        if (thumbShot.current?.key !== shotKey) thumbShot.current = { key: shotKey, shot: faceShot(shot) };
        const made = await paintThumb(thumbShot.current.shot, next.id, level, next.id === look);
        if (!made) { window.setTimeout(() => setThumbTry((n) => n + 1), 400); return; }   // (the phone was painting)
        const url = await toUrl(made, 0.85);
        if (ticket === photoJob.current) setThumbs((map) => ({ ...map, [key]: url }));
      } catch {
        if (ticket === photoJob.current) setThumbs((map) => ({ ...map, [key]: "" }));     // (the look's own photo stays)
      } finally {
        thumbBusy.current = false;
      }
    }, 150);
    return () => { if (!started) window.clearTimeout(timer); };
  }, [phase, thumbs, level, clear, lit, mode, outlineVer, thumbTry]);

  function showMode(next: "result" | "mine") {
    if (next === mode) return;
    haptic();
    setMode(next);
    if (next === "result" && prepared.current && !result) paint(look);
  }

  return (
    <div className="tryon">
      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={onFile} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={onFile} />

      {intro ? (
        <section className="tryon__intro">
          <div className="tryon__hero">
            <Media src={lookPhoto(style.id, "sm")} alt="" />
            <span className="tryon__badge"><Icon name="magic" size={14} weight="fill" /> هوش مصنوعی</span>
          </div>
          <h2>«{style.title}» روی چهره خودتان</h2>
          <p>آینه زنده را باز کنید، یا یک سلفی بگیرید یا عکسی از گالری انتخاب کنید؛ هوش مصنوعیِ داخل گوشی همین میکاپ را روی چهره شما اجرا می‌کند.</p>

          {phase === "get" ? (
            <div className="tryon__get">
              <Button variant="gold" size="lg" block icon="download" onClick={download}>آماده‌سازی هوش مصنوعی</Button>
              <small>حدود {persian(downloadMB())} مگابایت برای اولین سبک؛ بقیه سبک‌ها فقط هنگام انتخاب دریافت و برای استفاده آفلاین ذخیره می‌شوند.</small>
            </div>
          ) : null}
          {phase === "download" ? (
            <div className="tryon__get" role="status">
              <div className="tryon__bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              <small>در حال دانلود هوش مصنوعی… {persian(Math.round(progress * 100))}٪</small>
            </div>
          ) : null}
          {phase === "check" ? <div className="tryon__get"><small>در حال بررسی…</small></div> : null}
          {phase === "error" ? (
            <div className="tryon__get" role="alert">
              <strong>{error}</strong>
              <Button variant="secondary" icon="rebook" onClick={() => modelsReady([style.id]).then((ok) => (ok ? setPhase("pick") : download()))}>دوباره</Button>
            </div>
          ) : null}
          {phase === "pick" ? (
            <>
              <div className="tryon__actions">
                <Button variant="gold" size="lg" block icon="live" onClick={() => startLive()}>آینه زنده</Button>
                <Button variant="secondary" size="lg" block icon="camera" onClick={() => camera.current?.click()}>گرفتن سلفی</Button>
                <Button variant="secondary" size="lg" block icon="gallery" onClick={() => gallery.current?.click()}>انتخاب از گالری</Button>
              </div>
              <ul className="tryon__tips">
                <li>صورت کامل و روبه‌روی دوربین</li>
                <li>نور روشن و یکنواخت، بدون فیلتر</li>
                <li>بدون عینک، ماسک یا موی روی صورت</li>
              </ul>
            </>
          ) : null}
          <p className="tryon__privacy"><Icon name="privacy" size={16} /> عکس شما از گوشی خارج نمی‌شود؛ همه‌چیز روی خود دستگاه و بدون اینترنت انجام می‌شود.</p>
        </section>
      ) : (
        <section className="tryon__result">
          {canMine ? (
            <div className="tryon__modes" role="tablist" aria-label="نمایش">
              <button type="button" role="tab" aria-selected={!own} onClick={() => showMode("result")}><Icon name="compare" size={16} /> قبل و بعد</button>
              <button type="button" role="tab" aria-selected={own} onClick={() => showMode("mine")}><Icon name="brush" size={16} /> میکاپ من</button>
            </div>
          ) : null}
          {own && prep ? (
            <Suspense fallback={<div className="tryon__stage"><div className="tryon__img tryon__img--empty" /></div>}>
              <TryOnMine key={`${which}:${outlineVer}`} shot={shotFor(prep, clear)[0]} recipe={myMakeup} onRecipe={setMyMakeup}
                onBook={(recipe, name) => onBook(look, { name, recipe })}
                onLive={(recipe) => startLive(recipe)} />
            </Suspense>
          ) : editing && shownAuto && shownShot && before[which] ? (
            <OutlineEditor photo={before[which]} width={shownShot.photo.width} height={shownShot.photo.height} auto={shownAuto}
              offsets={outline} start={editing} onApply={applyOutline} onCancel={() => { haptic(); setEditing(null); }} />
          ) : phase === "live" ? (
            <div className="tryon__stage tryon__stage--live">
              <canvas ref={liveView} className="tryon__live" aria-label={liveMine ? "آینه زنده با میکاپ خودتان" : `آینه زنده با میکاپ ${current.title}`}
                data-fps={live?.fps ?? 0} data-net-ms={live?.netMs ?? 0} data-face={live?.face ? "" : undefined} data-engine={kind} data-mine={liveMine ? "" : undefined} />
              {!live ? <div className="tryon__busy" role="status"><strong>در حال روشن کردن دوربین…</strong></div> : null}
              {live && !live.face ? <span className="tryon__hint">صورت را روبه‌روی دوربین بگیرید</span> : null}
              {live ? <span className="tryon__tag tryon__tag--after">زنده · {liveMine ? "میکاپ من" : current.title}</span> : null}
            </div>
          ) : (
          <div className="tryon__stage" data-busy={busy ? "" : undefined} data-engine={kind} data-sharp={which.startsWith("s") ? "" : undefined} data-studio={which.endsWith("t") ? "" : undefined}
            data-blur={prep ? prep.blur.toFixed(2) : undefined} data-sharp-ms={prep?.sharp ? prep.sharpMs : undefined} data-hd-ms={prep?.hdMs}>
            {before[which] ? <img className="tryon__img" src={before[which]} alt="عکس شما بدون میکاپ" /> : <div className="tryon__img tryon__img--empty" />}
            {was ? <img className="tryon__was" src={was.url} alt="" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - cut}% 0 0)` }} /> : null}
            {result && phase === "done" ? (
              <>
                <img className="tryon__img tryon__img--after" src={result} alt={`عکس شما با میکاپ ${current.title}`} data-level={level} data-zones={zonesKey(zones)}
                  style={{ clipPath: `inset(0 ${peek ? 100 : 100 - cut}% 0 0)` }} />
                {peek ? null : <span className="tryon__divider" style={{ insetInlineEnd: `${cut}%` }} aria-hidden="true" />}
                {peek ? null : <span className="tryon__tag tryon__tag--after">بعد</span>}
                <span className="tryon__tag tryon__tag--before">قبل</span>
                <input className="tryon__slider" type="range" min={0} max={100} value={cut} dir="ltr"
                  aria-label="مقایسه قبل و بعد" onChange={(event) => setCut(Number(event.target.value))} />
                <button type="button" className="tryon__peek" aria-label="نگه دارید: عکس بدون میکاپ" aria-pressed={peek}
                  onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); haptic(); setPeek(true); }}
                  onPointerUp={() => setPeek(false)} onPointerCancel={() => setPeek(false)} onLostPointerCapture={() => setPeek(false)}
                  onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") setPeek(true); }} onKeyUp={() => setPeek(false)}
                  onContextMenu={(event) => event.preventDefault()}>
                  <Icon name="peek" size={20} />
                </button>
              </>
            ) : null}
            {phase === "face" || phase === "sharp" || phase === "paint" || phase === "look-download" ? (
              <div className="tryon__busy" role="status">
                <strong>{phase === "face" ? "در حال پیدا کردن چهره…" : phase === "sharp" ? (sharpStep === "hd" ? "در حال ساختن چهره HD با هوش مصنوعی…" : "در حال بهتر کردن وضوح عکس…") : phase === "look-download" ? `در حال دریافت سبک «${current.title}»…` : `در حال اجرای «${current.title}»…`}</strong>
                {phase === "paint" ? <div className="tryon__bar tryon__bar--light"><span ref={bar} style={{ width: "4%" }} /></div> : null}
                {phase === "look-download" ? <div className="tryon__bar tryon__bar--light"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div> : null}
                {phase === "sharp" ? <div className="tryon__bar tryon__bar--light"><span style={{ width: `${Math.max(4, Math.round(sharpDone * 100))}%` }} /></div> : null}
                <small>{phase === "look-download" ? "فقط یک‌بار برای این سبک؛ سپس آفلاین در دسترس است" : "روی گوشی شما و بدون اینترنت؛ چند ثانیه صبر کنید"}</small>
              </div>
            ) : null}
            {phase === "error" ? (
              <div className="tryon__busy" role="alert">
                <strong>{error}</strong>
                <Button variant="light" size="sm" icon="rebook" onClick={() => (prepared.current ? paint(look) : setPhase("pick"))}>دوباره</Button>
              </div>
            ) : null}
          </div>
          )}

          {outlineOn && doubt ? (
            <div className="tryon__doubt" role="note">
              <Icon name="outline" size={18} />
              <span>{DOUBTS[doubt.reason]}</span>
              <button type="button" className="chip" onClick={() => { haptic(); setEditing(doubt.part); }}>تنظیم</button>
              <button type="button" className="tryon__doubt-close" aria-label="بستن" onClick={() => setDoubt(null)}><Icon name="close" size={16} /></button>
            </div>
          ) : null}
          {!own && !liveMine && !editing && ((result && phase === "done") || phase === "live" || phase === "paint") ? (
            <div className="tryon__levels" role="group" aria-label="شدت میکاپ">
              <span>شدت میکاپ</span>
              {LEVELS.map(([key, label]) => (
                <button key={key} type="button" className="chip" aria-pressed={key === level} disabled={phase === "paint"} onClick={() => changeLevel(key)}>{label}</button>
              ))}
              <button type="button" className="chip tryon__tune-open" aria-expanded={tuning} aria-label="تنظیم هر بخش صورت"
                onClick={() => { haptic(); setTuning((on) => !on); }}><Icon name="tune" size={16} weight={tuning ? "fill" : "regular"} /></button>
            </div>
          ) : null}
          {tuning && !own && !liveMine && !editing && ((result && phase === "done") || phase === "live" || phase === "paint") ? (
            <div className="tryon__zones" role="group" aria-label="شدت هر بخش صورت">
              {ZONES.map(([zone, label]) => (
                <label key={zone} className="tryon__zone">
                  <span>{label}</span>
                  <input type="range" min={0} max={150} step={10} value={tuned[zone]}
                    onChange={(event) => changeZone(zone, Number(event.target.value), false)}
                    onPointerUp={(event) => changeZone(zone, Number(event.currentTarget.value), true)}
                    onKeyUp={(event) => changeZone(zone, Number(event.currentTarget.value), true)} />
                  <output>{persian(tuned[zone])}٪</output>
                </label>
              ))}
              {zonesKey(tuned) !== zonesKey(ZONES_AS_LOOK) ? <button type="button" className="chip" onClick={resetZones}>مثل خود سبک</button> : null}
            </div>
          ) : null}
          {kind === "gpu" && !own && !liveMine && !editing && ((result && phase === "done") || phase === "live" || phase === "paint") ? (
            <div className="tryon__lips">
              <div className="tryon__lips-head"><span>رژ لب</span><small aria-live="polite">{lipLabel}</small></div>
              <div className="tryon__swatches" role="group" aria-label="رنگ رژ لب">
                <button type="button" className="tryon__swatch tryon__swatch--look" aria-pressed={!lip.shade} disabled={phase === "paint"}
                  onClick={() => changeLip(LOOK_LIP)}>همین سبک</button>
                {LIPSTICKS.map((item) => (
                  <button key={item.id} type="button" className="tryon__swatch" data-finish={item.finish} aria-label={item.name} title={item.name}
                    aria-pressed={lip.shade === item.id} disabled={phase === "paint"} style={{ "--swatch": item.hex } as CSSProperties}
                    onClick={() => changeLip({ shade: item.id, finish: null })} />
                ))}
              </div>
              <div className="tryon__finishes" role="group" aria-label="بافت رژ لب">
                {FINISHES.map(([key, label]) => (
                  <button key={key} type="button" className="chip" aria-pressed={finish === key} disabled={phase === "paint"}
                    onClick={() => changeLip({ ...lip, finish: key })}>{label}</button>
                ))}
              </div>
            </div>
          ) : null}
          {outlineOn && !doubt ? (
            <div className="tryon__outline" role="group" aria-label="خطوط صورت">
              <span>{edited ? "خطوط صورت را خودتان تنظیم کرده‌اید" : "میکاپ جای دقیقش نیست؟"}</span>
              <button type="button" className="chip" onClick={() => { haptic(); setEditing("lips"); }}>
                <Icon name="outline" size={15} /> {edited ? "ویرایش" : "تنظیم خطوط"}
              </button>
              {edited ? <button type="button" className="chip" onClick={() => { haptic(); applyOutline({}); }}>خودکار</button> : null}
            </div>
          ) : null}
          {(canSharp || canLight) && !own && !editing && ((result && phase === "done") || phase === "paint" || phase === "live") ? (
            <div className="tryon__clarity" role="group" aria-label="کیفیت عکس">
              <span>{canSharp ? (prep?.hdMs ? "چهره شما روی گوشی HD شد" : "عکس شما نرم بود؛ روی گوشی واضح‌تر شد") : "نور و پوست مثل عکس آتلیه"}</span>
              <div className="tryon__clarity-chips">
                {canLight ? (
                  <button type="button" className="chip" aria-pressed={lit} disabled={phase === "paint"} onClick={toggleLit}>
                    <Icon name="light" size={14} weight={lit ? "fill" : "regular"} /> نور و پوست استودیویی
                  </button>
                ) : null}
                {canSharp ? (
                  <button type="button" className="chip" aria-pressed={clear} disabled={phase === "paint"} onClick={toggleClear}>
                    <Icon name="magic" size={14} weight={clear ? "fill" : "regular"} /> وضوح بیشتر
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!own && !editing && kind === "gpu" && phase === "done" && hdStatus !== "unavailable" ? (
            <div className="tryon__get" role="group" aria-label="افزایش کیفیت HD">
              {hdStatus === "available" ? (
                <Button variant="secondary" icon="download" onClick={enableHd}>افزایش کیفیت چهره HD · دانلود اختیاری {persian(HD_DOWNLOAD_MB)} مگابایت</Button>
              ) : hdStatus === "downloading" ? (
                <div role="status" style={{ width: "100%" }}>
                  <div className="tryon__bar"><span style={{ width: `${Math.round(hdProgress * 100)}%` }} /></div>
                  <small>دریافت اختیاری HD… {persian(Math.round(hdProgress * 100))}٪</small>
                  <Button variant="secondary" icon="close" onClick={() => hdAbort.current?.abort()}>توقف دانلود HD</Button>
                  <small>بخش‌های کامل ذخیره می‌شوند؛ بعداً می‌توانید ادامه دهید.</small>
                </div>
              ) : hdStatus === "ready" ? <small>بسته HD روی گوشی ذخیره شده است؛ در صورت نیاز برای عکس‌های تار استفاده می‌شود.</small> : null}
              {hdStatus === "available" ? <small>مخصوص عکس‌های تار؛ برای استفاده عادی لازم نیست.</small> : null}
              {hdError ? <small role="alert">{hdError}</small> : null}
            </div>
          ) : null}
          {own ? null : <div className="tryon__looks-head">
            <span>{kind === "gpu" && prep && phase !== "live" ? "سبک‌ها روی چهره شما" : "سبک‌های دیگر"}</span>
          </div>}
          {own ? null : <div className="tryon__looks" role="group" aria-label="امتحان سبک‌های دیگر">
            {others.map((item) => (
              <button key={item.id} type="button" aria-pressed={!liveMine && item.id === look} disabled={phase === "live" ? false : !prepared.current || busy}
                onClick={() => {
                  haptic();
                  if (liveMine) { setLiveMine(null); mirror.current?.setMine(null); setMode("result"); }
                  if (phase === "live") setLook(item.id); else paint(item.id);
                }}>
                {thumbs[`${item.id}:${level}:${which}`]
                  ? <span className="media block tryon__her" data-loaded=""><img src={thumbs[`${item.id}:${level}:${which}`]} alt="" decoding="async" /></span>
                  : <Media src={lookPhoto(item.id, "sm")} alt="" loading="lazy" />}
                <span>{item.title}</span>
                {!liveMine && item.id === look ? <i aria-hidden="true"><Icon name="check" size={10} weight="bold" /></i> : null}
              </button>
            ))}
          </div>}

          {phase === "live" ? (
            <div className="tryon__row">
              <Button variant="gold" icon="capture" onClick={capture} disabled={!live?.face}>گرفتن عکس</Button>
              <Button variant="secondary" icon="close" onClick={closeLive}>{liveMine ? "بازگشت به میکاپ من" : "بستن آینه"}</Button>
            </div>
          ) : null}
          <div className="tryon__row">
            {phase !== "live" ? <Button variant="secondary" icon="live" onClick={() => { setMode("result"); startLive(); }}>آینه زنده</Button> : null}
            <Button variant="secondary" icon="gallery" onClick={() => gallery.current?.click()}>عکس دیگر</Button>
            {result && phase === "done" && !own ? <Button variant="tonal" icon="download" onClick={() => save(result)}>ذخیره عکس</Button> : null}
            {own ? null : liveMine ? <Button variant="gold" icon="book" onClick={() => onBook(look, { name: "میکاپ من", recipe: liveMine })}>رزرو با این میکاپ</Button>
              : <Button variant="gold" icon="book" onClick={() => onBook(look)}>رزرو همین میکاپ</Button>}
          </div>
          {own ? null : <p className="tryon__fine">تصویر با هوش مصنوعی ساخته شده و تقریبی است؛ آرتیست سالن رنگ‌ها را با پوست و فرم چهره شما تنظیم می‌کند.</p>}
        </section>
      )}
    </div>
  );
}
