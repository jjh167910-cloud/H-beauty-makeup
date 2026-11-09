import { useEffect, useState } from 'react';
import { api, image } from '@appdeploy/client';

type Style = 'reference' | 'natural' | 'bridal' | 'glam' | 'editorial';
type Photo = { file: File; url: string; width: number; height: number };
type Output = {
  image: { data: string; mimeType: string; bytes: number };
  model: string;
  photorealismCertified: boolean;
};
const choices: Array<{ value: Style; title: string; en: string }> = [
  { value: 'reference', title: 'از عکس مرجع', en: 'REFERENCE MAKEUP' },
  { value: 'natural', title: 'میکاپ نچرال', en: 'NATURAL' },
  { value: 'bridal', title: 'عروس کلاسیک', en: 'CLASSIC BRIDE' },
  { value: 'glam', title: 'سافت گلم', en: 'SOFT GLAM' },
  { value: 'editorial', title: 'ادیتوریال', en: 'EDITORIAL' },
];
function makePhoto(file: File): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () =>
      resolve({ file, url, width: im.naturalWidth, height: im.naturalHeight });
    im.onerror = () => {
      URL.revokeObjectURL(url);
      reject(Error('تصویر خوانده نشد.'));
    };
    im.src = url;
  });
}
function Upload({
  label,
  hint,
  value,
  onChange,
  id,
}: {
  label: string;
  hint: string;
  value: Photo | null;
  onChange: (photo: Photo | null) => void;
  id: string;
}) {
  const [fault, setFault] = useState('');
  async function selected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFault('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFault('فرمت مجاز JPEG، PNG و WebP است.');
      return;
    }
    if (file.size > 20_000_000) {
      setFault('تصویر ورودی بزرگ‌تر از ۲۰ مگابایت است.');
      return;
    }
    try {
      onChange(await makePhoto(file));
    } catch (e) {
      setFault((e as Error).message);
    }
  }
  return (
    <section
      className={'uploader ' + (value ? 'isLoaded' : '')}
      data-testid={id}
    >
      {value ? (
        <img className="uploaderPhoto" src={value.url} alt={label} />
      ) : (
        <div className="uploadBlank">
          <span>✧</span>
          <strong>{label}</strong>
          <small>{hint}</small>
        </div>
      )}
      <div className="uploadFooter">
        <span>
          {value
            ? value.width + ' × ' + value.height + ' px'
            : id === 'face'
              ? 'SOURCE PORTRAIT'
              : 'MAKEUP REFERENCE'}
        </span>
        <label className="fileLabel">
          انتخاب عکس <span>↗</span>
          <input
            aria-label={'بارگذاری ' + label}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={selected}
          />
        </label>
      </div>
      {fault && <p className="inputError">{fault}</p>}
    </section>
  );
}
function decodePhoto(data: string, mime: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}
function App() {
  const [face, setFace] = useState<Photo | null>(null);
  const [reference, setReference] = useState<Photo | null>(null);
  const [style, setStyle] = useState<Style>('reference');
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [imageBytes, setImageBytes] = useState(0);
  const [split, setSplit] = useState(50);
  useEffect(
    () => () => {
      if (face) URL.revokeObjectURL(face.url);
    },
    [face]
  );
  useEffect(
    () => () => {
      if (reference) URL.revokeObjectURL(reference.url);
    },
    [reference]
  );
  useEffect(() => {
    if (result) URL.revokeObjectURL(result);
    setResult(null);
    setMsg('');
  }, [face, reference, style]);
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result);
    },
    [result]
  );
  const ready =
    !!face && (style !== 'reference' || !!reference) && allowed && !busy;
  async function generate() {
    if (!ready || !face) return;
    setBusy(true);
    setMsg('');
    try {
      const source = await image.resizeIfNeeded(face.file, {
        maxDimension: 1600,
        maxPixels: 2_000_000,
        quality: 0.92,
        mimeType: 'image/jpeg',
      });
      const ref =
        style === 'reference' && reference
          ? await image.resizeIfNeeded(reference.file, {
              maxDimension: 1600,
              maxPixels: 2_000_000,
              quality: 0.92,
              mimeType: 'image/jpeg',
            })
          : null;
      if (source.bytes + (ref?.bytes || 0) > 6_000_000)
        throw Error('تصاویر از حد مجاز سرویس بزرگ‌ترند.');
      const r = (await api.post('/api/transfer', {
        source: { data: source.data, mimeType: source.mimeType },
        reference: ref ? { data: ref.data, mimeType: ref.mimeType } : undefined,
        preset: style,
        consent: allowed,
      })) as { data: Output };
      if (!r.data?.image?.data || !r.data.image.mimeType?.startsWith('image/'))
        throw Error('پاسخ مدل فاقد خروجی تصویری است.');
      const url = decodePhoto(r.data.image.data, r.data.image.mimeType);
      setResult(url);
      setSplit(50);
      setImageBytes(r.data.image.bytes);
      setMsg(
        'ویرایش عصبی انجام شد. نتیجه را با عکس اصلی از نظر حفظ هویت و بافت پوست بررسی کنید.'
      );
    } catch (e) {
      const err = e as {
        message?: string;
        response?: { data?: { error?: string } };
      };
      setMsg(
        err.response?.data?.error ||
          err.message ||
          'مدل نتوانست تصویر را تولید کند. دوباره امتحان کنید.'
      );
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result;
    a.download = 'H-Beauty-Neural-Makeup.png';
    a.click();
  }
  return (
    <div dir="rtl" className="site">
      <header className="header">
        <div className="headerInner">
          <a href="#" className="logo">
            <span className="logoMark">
              H<span>·</span>B
            </span>
            <span className="wordmark">
              H-BEAUTY<small>NEURAL MAKEUP STUDIO</small>
            </span>
          </a>
          <span className="headerBadge">
            <i /> پردازش عصبی ابری <em>RESEARCH PREVIEW</em>
          </span>
        </div>
      </header>
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">AUTOMATIC PHOTO MAKEUP / 2026</p>
            <h1>
              تجربه میکاپ، <em>بدون نقاشی دستی.</em>
            </h1>
            <p>
              تصویر چهره خود را انتخاب کنید؛ عکس مرجع آرایش یا یک سبک آماده را
              تعیین کنید. مدل عصبی به‌طور خودکار نتیجه را می‌سازد. این نسخه
              آزمایشی است و دقت حفظ هویت و کیفیت واقعی هنوز نیازمند ارزیابی
              مستقل است.
            </p>
          </div>
          <div className="heroEmblem">
            <span>✳</span>
            <strong>
              NEURAL EDITING<small>Gemini image model</small>
            </strong>
          </div>
        </section>
        <div className="workspace">
          <section className="controls">
            <div className="sectionHead">
              <strong>
                <span>01</span> تصاویر ورودی
              </strong>
              <small>FACE / REFERENCE</small>
            </div>
            <div className="uploadGrid">
              <Upload
                label="چهره اصلی"
                hint="عکس با نور مناسب و بدون فیلتر"
                value={face}
                onChange={setFace}
                id="face"
              />
              <Upload
                label="مرجع میکاپ"
                hint="عکس آرایش دلخواه، نه چهره دلخواه"
                value={reference}
                onChange={setReference}
                id="reference"
              />
            </div>
            <p className="explain">
              <span>ⓘ</span> در حالت مرجع، آرایش عکس دوم باید به چهره عکس اول
              منتقل شود؛ نه هویت یا ویژگی‌های فرد دوم.
            </p>
            <div className="sectionHead choicesHead">
              <strong>
                <span>02</span> انتخاب نوع آرایش
              </strong>
              <small>AUTOMATIC TRANSFER</small>
            </div>
            <div className="choices">
              {choices.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setStyle(c.value)}
                  className={'choice ' + (style === c.value ? 'active' : '')}
                >
                  <span className="radio">{style === c.value ? '●' : '○'}</span>
                  <span>
                    <strong>{c.title}</strong>
                    <small>{c.en}</small>
                  </span>
                </button>
              ))}
            </div>
            <label className="consent">
              <input
                type="checkbox"
                checked={allowed}
                onChange={e => setAllowed(e.target.checked)}
              />
              <span>
                رضایت می‌دهم عکس‌های انتخابی برای پردازش به مدل ابری Gemini
                ارسال شوند. این سرویس آفلاین نیست و ممکن است محدودیت حجم و نرخ
                درخواست داشته باشد.
              </span>
            </label>
            <button
              type="button"
              className="generate"
              disabled={!ready}
              onClick={generate}
            >
              <span>✧</span>
              {busy
                ? 'مدل در حال تولید عکس است…'
                : 'تولید خودکار میکاپ با مدل عصبی'}
              <span>↗</span>
            </button>
            {busy && (
              <p className="busy">
                <span className="spin" /> در حال بازسازی میکاپ توسط مدل عصبی…
              </p>
            )}
            {msg && (
              <p
                role="status"
                className={'feedback ' + (result ? 'success' : '')}
              >
                {msg}
              </p>
            )}
          </section>
          <section className="preview">
            <div className="sectionHead">
              <strong>
                <span>03</span> نتیجه و مقایسه
              </strong>
              <small>NEURAL RESULT</small>
            </div>
            <div className="viewer">
              {result ? (
                <div className="photos">
                  <img
                    className="after"
                    src={result}
                    alt="تصویر تولیدشده با آرایش عصبی"
                  />
                  {face && (
                    <img
                      className="before"
                      src={face.url}
                      alt="چهره اصلی"
                      style={{
                        clipPath: 'inset(0 ' + (100 - split) + '% 0 0)',
                      }}
                    />
                  )}
                  <span className="separator" style={{ right: split + '%' }}>
                    <b>↔</b>
                  </span>
                  <span className="resultLabel">NEURAL IMAGE EDIT</span>
                </div>
              ) : (
                <div className="placeholder">
                  <span>✧</span>
                  <strong>تصویر نهایی در اینجا نمایش داده می‌شود.</strong>
                  <p>
                    هیچ قلم یا ماسک دستی لازم نیست. آرایش توسط مدل تولید می‌شود.
                  </p>
                  <small>IDENTITY PRESERVATION / UNDER EVALUATION</small>
                </div>
              )}
            </div>
            <div className="compare">
              <span>بعد</span>
              <input
                type="range"
                min="0"
                max="100"
                value={split}
                disabled={!result}
                onChange={e => setSplit(Number(e.target.value))}
                aria-label="مقایسه قبل و بعد"
              />
              <span>قبل</span>
            </div>
            <button
              type="button"
              className="download"
              disabled={!result}
              onClick={download}
            >
              دانلود تصویر خروجی <span>↗</span>
            </button>
            {result && (
              <p className="resultCaution">
                حجم خروجی: {(imageBytes / 1024).toFixed(0)} کیلوبایت. خروجی مدل
                را از نظر چشم‌ها، بافت پوست، فرم چهره و آرایش بررسی کنید.
              </p>
            )}
          </section>
        </div>
        <div className="research">
          <span>⚑</span>
          <p>
            <strong>شفافیت پژوهشی:</strong> این نسخه از مدل واقعی تولید تصویر
            استفاده می‌کند، اما برتری آن نسبت به محصولات بازار با آزمون‌های
            انسانی و عکس‌های واقعی تأیید نشده است. برای مشتریان سالن و استفاده
            تجاری نهایی هنوز نیاز به بررسی کیفیت دارد.
          </p>
        </div>
        <footer>
          <strong>H-BEAUTY / NEURAL STUDIO</strong>
          <span>
            Independent automatic makeup preview · Production salon unchanged
          </span>
        </footer>
      </main>
    </div>
  );
}
export default App;
