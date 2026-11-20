/**
 * The artist's bench (/bench): the roadmap's Phase 2 gate (src/lib/bench.ts). Signed in with the salon's passcode, the
 * artist adds her benchmark photos (they stay on this phone: only a hash of each goes with its scores) and picks a look.
 * She sees what the look should be (its catalog photo, «مرجع», and its products), her photo untouched («بدون میکاپ»),
 * and the look painted by the old engine and the new one, «الف» and «ب» in an order she can't tell apart; a viewer
 * flicks between all four at full size. She answers each of the rubric's questions for both pictures, 1 to 5.
 * «نتیجه» shows the gate: every line, her eyes, every look; and a summary she can send.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { lookRecipe } from "@/data/look-recipes";
import { lookPhoto } from "@/data/makeup-photos";
import { MAKEUP_STYLES, styleById } from "@/data/makeup-styles";
import { mySteps } from "@/data/my-makeup";
import { BENCH_LINES, GATE, benchGate, newIsFirst, photoId, type BenchLine } from "@/lib/bench";
import { ChatError, benchClear, benchSave, benchScores, salonLogin, salonSignedIn, type BenchCard } from "@/lib/chat";
import type { Shot } from "@/lib/tryon";

const persian = (s: string | number) => String(s).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
const fixed = (v: number | null) => (v == null ? "—" : persian(v.toFixed(2)));
const CATALOG = MAKEUP_STYLES.map((s) => s.id);
const ENGINE_KEY = "hb-engine";
const SIDE = ["الف", "ب"] as const;

type Photo = { id: string; name: string; thumb: string; shot: Shot | null; bare?: string; problem?: string };
type Scores = Partial<Record<BenchLine, number>>;
type Side = { engine: "v1" | "v2"; url: string; scores: Scores; note: string };
type View = { id: "ref" | "bare" | "a" | "b"; label: string; url: string };

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
      <p>شما به هر میکاپ امتیاز می‌دهید. امتیازهای شما تعیین می‌کند که نسخه‌ی جدید میکاپ به اپ برود یا نه. با رمز سالن وارد شوید.</p>
      <label><span>رمز سالن</span>
        <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="current-password" dir="ltr" />
      </label>
      {problem ? <p className="salon__problem" role="alert">{problem}</p> : null}
      <Button type="submit" variant="gold" disabled={busy || !passcode}>{busy ? "در حال ورود…" : "ورود"}</Button>
    </form>
  );
}

/** What she judges, and against what: shown open until her first scores, then folded away. */
function Guide({ open }: { open: boolean }) {
  return (
    <details className="bench__guide" open={open}>
      <summary>راهنما: چه چیزی را می‌سنجید؟</summary>
      <p className="bench__question">
        سؤال اصلی برای هر تصویر: <b>«اگر همین میکاپ را با محصولات واقعی روی همین صورت اجرا می‌کردم، عکسش همین می‌شد؟»</b>
      </p>
      <dl className="bench__terms">
        <dt>مرجع</dt>
        <dd>همین میکاپ روی مدل کاتالوگ. نشان می‌دهد میکاپ قرار است چه باشد: کدام محصول، کجای صورت، چه رنگی. صورت و پوست مدل فرق دارد، پس لازم نیست تصویر عین مرجع باشد.</dd>
        <dt>بدون میکاپ</dt>
        <dd>همان عکس شما، دست‌نخورده. برای دیدن اینکه پوست، چشم و فرم صورت خود او مانده یا نه.</dd>
        <dt>الف و ب</dt>
        <dd>
          دو نسخه از همین میکاپ روی همین عکس: یکی نسخه‌ی فعلی اپ، یکی نسخه‌ی جدید. ترتیبشان عمداً معلوم نیست.
          هر کدام را جدا نمره بدهید؛ ممکن است هر دو خوب یا هر دو بد باشند.
        </dd>
      </dl>
      <ol className="bench__steps">
        <li>یک عکس رو به دوربین، در نور خوب و بدون میکاپ اضافه کنید (از خودتان، یا از مشتری با اجازه‌ی او). عکس روی همین گوشی می‌ماند.</li>
        <li>یک میکاپ را انتخاب کنید و ببینید قرار است چه باشد.</li>
        <li>روی هر تصویر بزنید تا بزرگ شود؛ بین مرجع، بدون میکاپ، الف و ب جابه‌جا شوید.</li>
        <li>به هر سؤال، برای الف و برای ب، نمره‌ای از ۱ تا ۵ بدهید.</li>
        <li>«ذخیره» را بزنید تا میکاپ بعدی بیاید. هر وقت خسته شدید بس کنید؛ نمره‌ها می‌مانند.</li>
      </ol>
      <p className="salon__hint">فقط نمره‌ها (و یک شناسه‌ی بی‌نام از هر عکس) در سالن ذخیره می‌شود. عکس هرگز فرستاده نمی‌شود.</p>
    </details>
  );
}

/** The look as it should be: its catalog photo and its products, colours and places. */
function Target({ look, onRef }: { look: string; onRef: () => void }) {
  const title = styleById.get(look)?.title ?? look;
  const steps = useMemo(() => { const r = lookRecipe(look); return r ? mySteps(r) : []; }, [look]);
  return (
    <section className="bench__target" aria-label="این میکاپ قرار است چه باشد">
      <button type="button" className="bench__ref" onClick={onRef} aria-label="مرجع، بزرگ‌نمایی">
        <img src={lookPhoto(look, "sm")} alt={`مرجع: «${title}» روی مدل کاتالوگ`} />
        <span>مرجع</span>
      </button>
      <div>
        <h2>«{title}» قرار است این باشد:</h2>
        <ul className="bench__recipe">
          {steps.filter((s) => !s.guideOnly).map((s) => (
            <li key={s.key}>
              <b>{s.title}</b>
              {s.colors.map((c) => <i key={c} className="bench__swatch" style={{ background: c }} aria-hidden="true" />)}
              <span>{s.product.slice(s.title.length).trim() || "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Full size, one picture at a time, the same place kept as she flicks between them (her photo and «الف» and «ب» are one size). */
function Viewer({ views, start, onClose }: { views: View[]; start: View["id"]; onClose: () => void }) {
  const [at, setAt] = useState(start);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) requestAnimationFrame(() => { el.scrollLeft = -(el.scrollWidth - el.clientWidth) / 2; el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.35; });
  }, []);
  const view = views.find((v) => v.id === at) ?? views[0];
  return (
    <div className="bench__zoom" role="dialog" aria-modal="true" aria-label="بزرگ‌نمایی">
      <div className="bench__zoombar">
        <div className="bench__views">
          {views.map((v) => <button key={v.id} type="button" className="chip" aria-pressed={v.id === at} onClick={() => setAt(v.id)}>{v.label}</button>)}
        </div>
        <Button variant="secondary" icon="close" onClick={onClose}>بستن</Button>
      </div>
      <div className="bench__zoomed" ref={box}>
        <img src={view.url} alt={`${view.label}، اندازه‌ی واقعی`} />
      </div>
    </div>
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
  const [zoom, setZoom] = useState<View["id"] | null>(null);
  const files = useRef<HTMLInputElement>(null);

  const fail = (error: unknown) => {
    if (error instanceof ChatError && error.status === 401) onOut();
    else setProblem(error instanceof ChatError && error.code === "offline" ? "اینترنت وصل نیست." : "کار انجام نشد؛ دوباره امتحان کنید.");
  };
  useEffect(() => { benchScores().then(setCards).catch(fail); }, []);

  const current = photos.find((p) => p.id === photo) ?? null;
  const done = useMemo(() => new Set(cards.filter((c) => c.photo === photo).map((c) => `${c.look}|${c.engine}`)), [cards, photo]);
  const scored = (id: string) => done.has(`${id}|v1`) && done.has(`${id}|v2`);
  const title = styleById.get(look)?.title ?? look;

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
        const bare = prep.plain.photo.toDataURL("image/jpeg", 0.93);
        setPhotos((was) => was.map((p) => (p.id === id ? { ...p, shot: prep.plain, bare } : p)));
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
  const missing = sides ? sides.reduce((n, s) => n + BENCH_LINES.filter((l) => !s.scores[l.id]).length, 0) : 0;
  const setSide = (i: number, change: Partial<Side>) =>
    setSides((was) => was && (was.map((x, j) => (j === i ? { ...x, ...change } : x)) as [Side, Side]));
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
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) { fail(error); }
    setSaving(false);
  }

  const views: View[] = [
    { id: "ref", label: "مرجع", url: lookPhoto(look) },
    ...(current?.bare ? [{ id: "bare", label: "بدون میکاپ", url: current.bare } as View] : []),
    ...(sides ? sides.map((s, i) => ({ id: i === 0 ? "a" : "b", label: SIDE[i], url: s.url }) as View) : []),
  ];

  const gate = useMemo(() => benchGate(cards, CATALOG), [cards]);
  const summary = () => [
    "سنجش آرتیست · حنانه بیوتی (معیار قبولی موتور جدید)",
    `تصویرهایی که با هر دو موتور امتیاز گرفته‌اند: ${persian(gate.pairs)}`,
    ...gate.lines.map((l) => `${l.name}: قدیم ${fixed(l.v1)} · جدید ${fixed(l.v2)}`),
    `چشم‌ها، جدید منهای قدیم: ${fixed(gate.eyesGain)} (لازم: ${persian(GATE.eyes)})`,
    `میکاپ‌هایی با ${persian(GATE.look)} یا بیشتر: ${persian(gate.looks.filter((l) => (l.v2 ?? 0) >= GATE.look).length)} از ${persian(CATALOG.length)}`,
    ...gate.looks.filter((l) => l.v2 == null || l.v2 < GATE.look).map((l) => `  ${styleById.get(l.look)?.title ?? l.look}: ${l.v2 == null ? "امتیاز نگرفته" : fixed(l.v2)}`),
    gate.pass.all ? "نتیجه: آماده است ✓" : "نتیجه: هنوز نه",
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
            <Guide open={cards.length === 0} />
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
                <Target look={look} onRef={() => setZoom("ref")} />
                {painting || !sides ? <p className="salon__empty" role="status">در حال کشیدن «{title}»…</p> : (
                  <>
                    <div className="bench__pair">
                      {current.bare ? (
                        <figure className="bench__side bench__side--bare">
                          <figcaption>بدون میکاپ</figcaption>
                          <button type="button" className="bench__shot" onClick={() => setZoom("bare")} aria-label="بدون میکاپ، بزرگ‌نمایی">
                            <img src={current.bare} alt={`${current.name}، بدون میکاپ`} />
                          </button>
                        </figure>
                      ) : null}
                      {sides.map((s, i) => (
                        <figure key={s.engine} className="bench__side">
                          <figcaption>تصویر {SIDE[i]}</figcaption>
                          <button type="button" className="bench__shot" onClick={() => setZoom(i === 0 ? "a" : "b")} aria-label={`تصویر ${SIDE[i]}، بزرگ‌نمایی`}>
                            <img src={s.url} alt={`«${title}»، تصویر ${SIDE[i]}`} />
                          </button>
                        </figure>
                      ))}
                    </div>
                    <p className="bench__tip">روی هر تصویر بزنید تا بزرگ شود. آنجا با دکمه‌های بالا بین مرجع، بدون میکاپ، الف و ب جابه‌جا شوید تا فرقشان را ببینید.</p>
                    <ol className="bench__lines">
                      {BENCH_LINES.map((l, n) => (
                        <li key={l.id}>
                          <fieldset className="bench__line">
                            <legend><span>{persian(n + 1)}.</span> {l.name}</legend>
                            <p className="bench__ask">{l.ask}</p>
                            <p className="bench__against">{l.against}</p>
                            {sides.map((s, i) => (
                              <div key={s.engine} className="bench__row">
                                <span>{SIDE[i]}</span>
                                {[1, 2, 3, 4, 5].map((v) => (
                                  <button key={v} type="button" className="bench__score" aria-pressed={s.scores[l.id] === v}
                                    aria-label={`${l.name}، تصویر ${SIDE[i]}: ${v}`}
                                    onClick={() => setSide(i, { scores: { ...s.scores, [l.id]: v } })}>
                                    {persian(v)}
                                  </button>
                                ))}
                              </div>
                            ))}
                            <p className="bench__anchors"><span><b>۱</b> {l.low}</span><span><b>۵</b> {l.high}</span></p>
                          </fieldset>
                        </li>
                      ))}
                    </ol>
                    <div className="bench__notes">
                      {sides.map((s, i) => (
                        <label key={s.engine} className="bench__note"><span>یادداشت برای {SIDE[i]} (اختیاری): چه چیزی درست نبود؟</span>
                          <input value={s.note} maxLength={300} onChange={(e) => setSide(i, { note: e.target.value })} />
                        </label>
                      ))}
                    </div>
                  </>
                )}
                <Button variant="gold" block disabled={!complete || saving} onClick={() => void save()}>
                  {saving ? "در حال ذخیره…" : complete ? "ذخیره و میکاپ بعدی" : `به هر خط هر دو تصویر امتیاز دهید (${persian(missing)} نمره مانده)`}
                </Button>
              </>
            ) : <p className="salon__empty">اول یک عکس اضافه کنید.</p>}
          </>
        ) : (
          <section className="bench__result" aria-label="نتیجه">
            <p className="bench__verdict" data-pass={gate.pass.all ? "" : undefined}>{gate.pass.all ? "آماده است: نسخه‌ی جدید میکاپ می‌تواند جای نسخه‌ی قبلی بیاید." : "هنوز نه: نسخه‌ی قبلی می‌ماند."}</p>
            <p className="bench__explain">نسخه‌ی جدید وقتی جای قبلی را می‌گیرد که هر سه شرط زیر برقرار باشد. اگر یکی‌اش ✗ است، آن را بالا ببرید.</p>
            <ul className="bench__checks">
              <li data-pass={gate.pass.lines ? "" : undefined}>در هر خط، نمره‌ی نسخه‌ی جدید دست‌کم برابر نسخه‌ی قبلی باشد. (روی {persian(gate.pairs)} تصویر که هر دو نسخه نمره گرفته‌اند)</li>
              <li data-pass={gate.pass.eyes ? "" : undefined}>در خط چشم‌ها، نسخه‌ی جدید دست‌کم {persian(GATE.eyes)} نمره از قبلی بهتر باشد. (اکنون: {gate.eyesGain == null ? "هنوز امتیازی نیست" : `${gate.eyesGain >= 0 ? "+" : ""}${fixed(gate.eyesGain)}`})</li>
              <li data-pass={gate.pass.looks ? "" : undefined}>هر میکاپ در نسخه‌ی جدید میانگین {persian(GATE.look)} یا بیشتر بگیرد. (اکنون {persian(gate.looks.filter((l) => (l.v2 ?? 0) >= GATE.look).length)} از {persian(CATALOG.length)} میکاپ)</li>
            </ul>
            <h2 className="bench__subhead">نمره‌ی هر خط</h2>
            <table className="bench__table">
              <thead><tr><th>خط</th><th>نسخه‌ی قبلی</th><th>نسخه‌ی جدید</th></tr></thead>
              <tbody>{gate.lines.map((l) => (
                <tr key={l.id} data-low={l.v1 != null && l.v2 != null && l.v2 < l.v1 ? "" : undefined}><td>{l.name}</td><td>{fixed(l.v1)}</td><td>{fixed(l.v2)}</td></tr>
              ))}</tbody>
            </table>
            <h2 className="bench__subhead">میکاپ‌ها، از ضعیف‌ترین به قوی‌ترین (نسخه‌ی جدید)</h2>
            <ol className="bench__looklist">
              {[...gate.looks].sort((a, b) => (a.v2 ?? -1) - (b.v2 ?? -1)).map((l) => (
                <li key={l.look} data-low={l.v2 == null || l.v2 < GATE.look ? "" : undefined}>
                  <span>{styleById.get(l.look)?.title ?? l.look}</span><b>{l.v2 == null ? "هنوز امتیاز نگرفته" : fixed(l.v2)}</b>
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
      {zoom ? <Viewer views={views} start={zoom} onClose={() => setZoom(null)} /> : null}
    </>
  );
}
