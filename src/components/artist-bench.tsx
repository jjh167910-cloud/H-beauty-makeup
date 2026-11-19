/**
 * The artist's bench (/bench): the roadmap's Phase 2 gate (src/lib/bench.ts). Signed in with the salon's passcode, the
 * artist adds her benchmark photos (they stay on this phone: only a hash of each goes with its scores), picks a look,
 * and sees it painted by the old engine and the new one, «الف» and «ب» in an order she can't tell apart, each at full
 * size with a tap; she scores each on the rubric's lines, 1 to 5. «نتیجه» shows the gate: every line, her eyes, every
 * look; and a summary she can send.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { MAKEUP_STYLES, styleById } from "@/data/makeup-styles";
import { BENCH_LINES, GATE, benchGate, newIsFirst, photoId, type BenchLine } from "@/lib/bench";
import { ChatError, benchClear, benchSave, benchScores, salonLogin, salonSignedIn, type BenchCard } from "@/lib/chat";
import type { Shot } from "@/lib/tryon";

const persian = (s: string | number) => String(s).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
const fixed = (v: number | null) => (v == null ? "—" : persian(v.toFixed(2)));
const CATALOG = MAKEUP_STYLES.map((s) => s.id);
const ENGINE_KEY = "hb-engine";

type Photo = { id: string; name: string; thumb: string; shot: Shot | null; problem?: string };
type Scores = Partial<Record<BenchLine, number>>;
type Side = { engine: "v1" | "v2"; url: string; scores: Scores; note: string };

export default function ArtistBench() {
  const [signedIn, setSignedIn] = useState(salonSignedIn);
  useEffect(() => { document.title = "سنجش آرتیست · حنانه بیوتی"; }, []);
  return <main className="salon bench">{signedIn ? <Bench onOut={() => setSignedIn(false)} /> : <Login onIn={() => setSignedIn(true)} />}</main>;
}

function Login({ onIn }: { onIn: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form className="salon__login" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setProblem(null);
      try { await salonLogin(passcode); onIn(); } catch (error) {
        setProblem(error instanceof ChatError && error.code === "passcode" ? "رمز درست نیست." : "ورود انجام نشد؛ دوباره امتحان کنید.");
      }
      setBusy(false);
    }}>
      <img className="chat__avatar" src="/icons/hananeh-signature.svg" alt="" />
      <h1>سنجش آرتیست · حنانه بیوتی</h1>
      <p>امتیاز شما به هر میکاپ، با موتور قدیم و جدید، دروازه‌ی رفتن به موتور جدید است. با رمز سالن وارد شوید.</p>
      <label><span>رمز سالن</span>
        <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="current-password" dir="ltr" />
      </label>
      {problem ? <p className="salon__problem" role="alert">{problem}</p> : null}
      <Button type="submit" variant="gold" disabled={busy || !passcode}>{busy ? "در حال ورود…" : "ورود"}</Button>
    </form>
  );
}

function Bench({ onOut }: { onOut: () => void }) {
  const [tab, setTab] = useState<"score" | "result">("score");
  const [cards, setCards] = useState<BenchCard[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [look, setLook] = useState(CATALOG[0]);
  const [sides, setSides] = useState<[Side, Side] | null>(null);
  const [painting, setPainting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const files = useRef<HTMLInputElement>(null);

  const fail = (error: unknown) => {
    if (error instanceof ChatError && error.status === 401) onOut();
    else setProblem(error instanceof ChatError && error.code === "offline" ? "اینترنت وصل نیست." : "کار انجام نشد؛ دوباره امتحان کنید.");
  };
  useEffect(() => { benchScores().then(setCards).catch(fail); }, []);

  const current = photos.find((p) => p.id === photo) ?? null;
  const done = useMemo(() => new Set(cards.filter((c) => c.photo === photo).map((c) => `${c.look}|${c.engine}`)), [cards, photo]);
  const scored = (id: string) => done.has(`${id}|v1`) && done.has(`${id}|v2`);

  // (her benchmark photos: prepared here, on this phone; only their hash is ever sent)
  async function add(list: File[]) {
    if (!list.length) return;
    const m = await import("@/lib/tryon");
    for (const file of list) {
      const id = await photoId(file);
      if (photos.some((p) => p.id === id)) continue;
      const entry: Photo = { id, name: `عکس ${persian(photos.length + 1)}`, thumb: URL.createObjectURL(file), shot: null };
      setPhotos((was) => [...was, entry]);
      try {
        const prep = await m.preparePhoto(file);
        setPhotos((was) => was.map((p) => (p.id === id ? { ...p, shot: prep.plain } : p)));
        setPhoto((was) => was ?? id);
      } catch {
        setPhotos((was) => was.map((p) => (p.id === id ? { ...p, problem: "چهره پیدا نشد" } : p)));
      }
    }
  }

  // (the look on the photo by both engines, «الف» and «ب» in an order of their own)
  useEffect(() => {
    if (!current?.shot) { setSides(null); return; }
    let live = true;
    setPainting(true); setSides(null);
    (async () => {
      const m = await import("@/lib/tryon");
      await m.downloadModels([look, "no-makeup"], () => {});
      const was = sessionStorage.getItem(ENGINE_KEY);
      const paint = async (engine: "v1" | "v2") => {
        sessionStorage.setItem(ENGINE_KEY, engine);
        return (await m.paintLook(current.shot!, look, "natural")).toDataURL("image/jpeg", 0.93);
      };
      try {
        const old = await paint("v1"), now = await paint("v2");
        const prior = (engine: "v1" | "v2"): Side => {
          const c = cards.find((x) => x.look === look && x.photo === current.id && x.engine === engine);
          return { engine, url: engine === "v1" ? old : now, scores: (c?.scores ?? {}) as Scores, note: c?.note ?? "" };
        };
        const pair: [Side, Side] = newIsFirst(look, current.id) ? [prior("v2"), prior("v1")] : [prior("v1"), prior("v2")];
        if (live) setSides(pair);
      } catch { if (live) setProblem("این میکاپ روی این عکس کشیده نشد."); }
      finally {
        if (was == null) sessionStorage.removeItem(ENGINE_KEY); else sessionStorage.setItem(ENGINE_KEY, was);
        if (live) setPainting(false);
      }
    })();
    return () => { live = false; };
  }, [current?.id, current?.shot, look]);

  const complete = sides?.every((s) => BENCH_LINES.every((l) => s.scores[l.id]));
  async function save() {
    if (!sides || !current || !complete) return;
    setSaving(true); setProblem(null);
    try {
      for (const s of sides) await benchSave({ look, photo: current.id, engine: s.engine, scores: s.scores as Record<string, number>, note: s.note });
      const next = await benchScores();
      setCards(next);
      // (on to the next look she hasn't scored on this photo)
      const left = CATALOG.filter((id) => !next.some((c) => c.photo === current.id && c.look === id && c.engine === "v2"));
      if (left.length) setLook(left.find((id) => CATALOG.indexOf(id) > CATALOG.indexOf(look)) ?? left[0]);
    } catch (error) { fail(error); }
    setSaving(false);
  }

  const gate = useMemo(() => benchGate(cards, CATALOG), [cards]);
  const summary = () => [
    "سنجش آرتیست · حنانه بیوتی (دروازه‌ی فاز ۲)",
    `تصویرهایی که با هر دو موتور امتیاز گرفته‌اند: ${persian(gate.pairs)}`,
    ...gate.lines.map((l) => `${l.name}: قدیم ${fixed(l.v1)} · جدید ${fixed(l.v2)}`),
    `چشم‌ها، جدید منهای قدیم: ${fixed(gate.eyesGain)} (لازم: ${persian(GATE.eyes)})`,
    `میکاپ‌هایی با ${persian(GATE.look)} یا بیشتر: ${persian(gate.looks.filter((l) => (l.v2 ?? 0) >= GATE.look).length)} از ${persian(CATALOG.length)}`,
    ...gate.looks.filter((l) => l.v2 == null || l.v2 < GATE.look).map((l) => `  ${styleById.get(l.look)?.title ?? l.look}: ${l.v2 == null ? "امتیاز نگرفته" : fixed(l.v2)}`),
    gate.pass.all ? "نتیجه: دروازه باز است ✓" : "نتیجه: هنوز نه",
  ].join("\n");

  return (
    <>
      <header className="salon__head">
        <div className="salon__brand">
          <img className="chat__avatar" src="/icons/hananeh-signature.svg" alt="" />
          <h1>سنجش آرتیست</h1>
        </div>
        <div className="salon__tools" role="tablist" aria-label="سنجش">
          <button type="button" role="tab" className="chip" aria-selected={tab === "score"} aria-pressed={tab === "score"} onClick={() => setTab("score")}>امتیاز دادن</button>
          <button type="button" role="tab" className="chip" aria-selected={tab === "result"} aria-pressed={tab === "result"} onClick={() => setTab("result")}>نتیجه</button>
        </div>
      </header>
      <div className="bench__body">
        {problem ? <p className="salon__problem" role="alert">{problem}</p> : null}
        {tab === "score" ? (
          <>
            <section className="bench__photos" aria-label="عکس‌های محک">
              {photos.map((p) => (
                <button key={p.id} type="button" className="bench__photo" aria-pressed={p.id === photo} disabled={!p.shot} onClick={() => setPhoto(p.id)}>
                  <img src={p.thumb} alt="" />
                  <span>{p.problem ?? (p.shot ? p.name : "در حال آماده کردن…")}</span>
                </button>
              ))}
              <Button variant="secondary" icon="plus" onClick={() => files.current?.click()}>افزودن عکس</Button>
              <input ref={files} type="file" accept="image/*" multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ""; }} />
            </section>
            <p className="salon__hint">
              عکس‌های محک فقط روی همین گوشی می‌مانند و جایی فرستاده نمی‌شوند؛ فقط امتیازها (و یک شناسه‌ی بی‌نام از هر عکس) در سالن ذخیره می‌شود.
              هر میکاپ دو بار کشیده می‌شود، «الف» و «ب»: یکی موتور قدیم، یکی جدید، به ترتیبی که از پیش معلوم نیست.
            </p>
            {current ? (
              <>
                <div className="bench__looks" role="listbox" aria-label="میکاپ‌ها">
                  {MAKEUP_STYLES.map((s) => (
                    <button key={s.id} type="button" role="option" className="chip" aria-selected={s.id === look} aria-pressed={s.id === look} onClick={() => setLook(s.id)}>
                      {scored(s.id) ? "✓ " : ""}{s.title}
                    </button>
                  ))}
                </div>
                <p className="bench__count" role="status">
                  {persian(CATALOG.filter(scored).length)} از {persian(CATALOG.length)} میکاپ روی {current.name} امتیاز گرفته است.
                </p>
                {painting || !sides ? <p className="salon__empty" role="status">در حال کشیدن «{styleById.get(look)?.title}» با دو موتور…</p> : (
                  <div className="bench__pair">
                    {sides.map((s, i) => (
                      <figure key={s.engine} className="bench__side">
                        <figcaption>تصویر {i === 0 ? "الف" : "ب"}</figcaption>
                        <button type="button" className="bench__shot" onClick={() => setZoom(s.url)} aria-label={`تصویر ${i === 0 ? "الف" : "ب"}، بزرگ‌نمایی`}>
                          <img src={s.url} alt={`«${styleById.get(look)?.title}»، تصویر ${i === 0 ? "الف" : "ب"}`} />
                        </button>
                        {BENCH_LINES.map((l) => (
                          <fieldset key={l.id} className="bench__line">
                            <legend title={l.hint}>{l.name}</legend>
                            {[1, 2, 3, 4, 5].map((v) => (
                              <button key={v} type="button" className="bench__score" aria-pressed={s.scores[l.id] === v}
                                aria-label={`${l.name}، تصویر ${i === 0 ? "الف" : "ب"}: ${v}`}
                                onClick={() => setSides((was) => was && (was.map((x, j) => (j === i ? { ...x, scores: { ...x.scores, [l.id]: v } } : x)) as [Side, Side]))}>
                                {persian(v)}
                              </button>
                            ))}
                          </fieldset>
                        ))}
                        <label className="bench__note"><span>یادداشت (اختیاری)</span>
                          <input value={s.note} maxLength={300} onChange={(e) => {
                            const note = e.target.value;
                            setSides((was) => was && (was.map((x, j) => (j === i ? { ...x, note } : x)) as [Side, Side]));
                          }} />
                        </label>
                      </figure>
                    ))}
                  </div>
                )}
                <Button variant="gold" block disabled={!complete || saving} onClick={() => void save()}>
                  {saving ? "در حال ذخیره…" : complete ? "ذخیره و میکاپ بعدی" : "به هر خط هر دو تصویر امتیاز دهید"}
                </Button>
              </>
            ) : <p className="salon__empty">اول یک یا چند عکس محک اضافه کنید.</p>}
          </>
        ) : (
          <section className="bench__result" aria-label="نتیجه">
            <p className="bench__verdict" data-pass={gate.pass.all ? "" : undefined}>{gate.pass.all ? "دروازه باز است: موتور جدید آماده است." : "هنوز نه: موتور قدیم می‌ماند."}</p>
            <table className="bench__table">
              <thead><tr><th>خط</th><th>قدیم</th><th>جدید</th></tr></thead>
              <tbody>{gate.lines.map((l) => (
                <tr key={l.id} data-low={l.v1 != null && l.v2 != null && l.v2 < l.v1 ? "" : undefined}><td>{l.name}</td><td>{fixed(l.v1)}</td><td>{fixed(l.v2)}</td></tr>
              ))}</tbody>
            </table>
            <ul className="bench__checks">
              <li data-pass={gate.pass.lines ? "" : undefined}>جدید در هر خط دست‌کم به خوبی قدیم ({persian(gate.pairs)} تصویر با هر دو موتور)</li>
              <li data-pass={gate.pass.eyes ? "" : undefined}>چشم‌ها {persian(GATE.eyes)} امتیاز بهتر (اکنون {fixed(gate.eyesGain)})</li>
              <li data-pass={gate.pass.looks ? "" : undefined}>
                هر {persian(CATALOG.length)} میکاپ {persian(GATE.look)} یا بیشتر (اکنون {persian(gate.looks.filter((l) => (l.v2 ?? 0) >= GATE.look).length)})
              </li>
            </ul>
            <ol className="bench__looklist">
              {[...gate.looks].sort((a, b) => (a.v2 ?? -1) - (b.v2 ?? -1)).map((l) => (
                <li key={l.look} data-low={l.v2 == null || l.v2 < GATE.look ? "" : undefined}>
                  <span>{styleById.get(l.look)?.title ?? l.look}</span><b>{l.v2 == null ? "امتیاز نگرفته" : fixed(l.v2)}</b>
                </li>
              ))}
            </ol>
            <div className="salon__tools">
              <Button variant="gold" icon="share" onClick={async () => {
                const text = summary();
                try { if (navigator.share) await navigator.share({ title: "سنجش آرتیست", text }); else { await navigator.clipboard.writeText(text); setProblem("خلاصه کپی شد."); } }
                catch { /* (closed) */ }
              }}>فرستادن خلاصه</Button>
              <Button variant="ghost" onClick={async () => {
                if (!window.confirm("همه‌ی امتیازها پاک شود و دور تازه شروع شود؟")) return;
                try { await benchClear(); setCards([]); } catch (error) { fail(error); }
              }}>دور تازه</Button>
            </div>
          </section>
        )}
      </div>
      {zoom ? (
        <div className="bench__zoom" role="dialog" aria-modal="true" aria-label="بزرگ‌نمایی">
          <Button variant="secondary" icon="close" className="bench__close" onClick={() => setZoom(null)}>بستن</Button>
          <div className="bench__zoomed" ref={(el) => { if (el) requestAnimationFrame(() => { el.scrollLeft = -(el.scrollWidth - el.clientWidth) / 2; el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.35; }); }}>
            <img src={zoom} alt="بزرگ‌نمایی، اندازه‌ی واقعی" />
          </div>
        </div>
      ) : null}
    </>
  );
}
