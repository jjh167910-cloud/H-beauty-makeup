import './styles.css';

type RegionKey = 'lips' | 'eyes' | 'cheeks';
type Region = {
  name: string;
  color: string;
  strength: number;
  mask: HTMLCanvasElement;
};
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const after = el<HTMLCanvasElement>('after'),
  before = el<HTMLCanvasElement>('before'),
  brushCanvas = el<HTMLCanvasElement>('brushCanvas');
const stage = el<HTMLDivElement>('stage'),
  empty = el<HTMLDivElement>('empty');
const afterCtx = after.getContext('2d', { willReadFrequently: true })!;
const beforeCtx = before.getContext('2d', { willReadFrequently: true })!;
const brushCtx = brushCanvas.getContext('2d')!;
const keys: RegionKey[] = ['lips', 'eyes', 'cheeks'];
const regions: Record<RegionKey, Region> = {
  lips: {
    name: 'لب‌ها',
    color: '#B34E62',
    strength: 0.55,
    mask: document.createElement('canvas'),
  },
  eyes: {
    name: 'چشم‌ها',
    color: '#735363',
    strength: 0.45,
    mask: document.createElement('canvas'),
  },
  cheeks: {
    name: 'گونه‌ها',
    color: '#D08D7F',
    strength: 0.35,
    mask: document.createElement('canvas'),
  },
};
let selected: RegionKey = 'lips',
  eraser = false,
  dragging = false;
let source: HTMLImageElement | HTMLCanvasElement | null = null;
let sourceW = 0,
  sourceH = 0,
  sourceData: ImageData | null = null,
  revision = 0,
  validated = -1;
let last: [number, number] | null = null,
  renderTimeout = 0;
const fa = (n: number) => n.toLocaleString('fa-IR');
function notice(s: string, c: '' | 'good' | 'bad' = '') {
  const n = el('notice');
  n.textContent = s;
  n.className = c;
}
function loadImage(img: HTMLImageElement | HTMLCanvasElement): void {
  const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  if (!w || !h) throw Error('ابعاد فایل نامعتبر است');
  source = img;
  sourceW = w;
  sourceH = h;
  const scale = Math.min(1, 1024 / Math.max(w, h));
  const W = Math.max(1, Math.round(w * scale)),
    H = Math.max(1, Math.round(h * scale));
  for (const canvas of [
    before,
    after,
    brushCanvas,
    ...keys.map(k => regions[k].mask),
  ]) {
    canvas.width = W;
    canvas.height = H;
  }
  beforeCtx.drawImage(img, 0, 0, W, H);
  sourceData = beforeCtx.getImageData(0, 0, W, H);
  stage.style.aspectRatio = W + '/' + H;
  stage.hidden = false;
  empty.hidden = true;
  el('dimensions').textContent = fa(w) + ' × ' + fa(h) + ' پیکسل';
  for (const id of ['compare', 'reset', 'validate', 'export'])
    el<HTMLButtonElement>(id).disabled = false;
  el<HTMLInputElement>('split').disabled = false;
  el<HTMLInputElement>('split').value = '0';
  revision++;
  validated = -1;
  updateSplit();
  drawOverlay();
  render();
  notice('تصویر آماده است. با قلم روی ناحیه آرایشی دلخواه بکشید.');
}
function sample(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 900;
  const q = c.getContext('2d')!;
  q.fillStyle = '#F5F3EF';
  q.fillRect(0, 0, 720, 900);
  const hair = q.createRadialGradient(360, 390, 20, 360, 390, 375);
  hair.addColorStop(0, '#725141');
  hair.addColorStop(1, '#211b1a');
  q.fillStyle = hair;
  q.beginPath();
  q.ellipse(360, 430, 280, 390, 0, 0, 7);
  q.fill();
  const skin = q.createLinearGradient(205, 260, 525, 650);
  skin.addColorStop(0, '#e9c7b1');
  skin.addColorStop(0.6, '#ba8671');
  skin.addColorStop(1, '#946956');
  q.fillStyle = skin;
  q.beginPath();
  q.ellipse(360, 398, 202, 285, 0, 0, 7);
  q.fill();
  q.strokeStyle = '#3e2d29';
  q.lineWidth = 10;
  q.lineCap = 'round';
  q.beginPath();
  q.moveTo(260, 332);
  q.quadraticCurveTo(296, 310, 326, 333);
  q.moveTo(402, 333);
  q.quadraticCurveTo(431, 310, 465, 332);
  q.stroke();
  q.fillStyle = '#31221d';
  q.beginPath();
  q.ellipse(292, 368, 31, 12, 0, 0, 7);
  q.ellipse(430, 368, 31, 12, 0, 0, 7);
  q.fill();
  q.strokeStyle = '#926452';
  q.lineWidth = 7;
  q.beginPath();
  q.moveTo(361, 378);
  q.lineTo(350, 458);
  q.lineTo(374, 465);
  q.stroke();
  q.fillStyle = '#925954';
  q.beginPath();
  q.ellipse(362, 544, 55, 18, 0, 0, 7);
  q.fill();
  q.fillStyle = '#f5f2ea';
  q.beginPath();
  q.moveTo(208, 746);
  q.lineTo(506, 746);
  q.lineTo(665, 900);
  q.lineTo(55, 900);
  q.fill();
  return c;
}
el<HTMLButtonElement>('demo').onclick = () => {
  loadImage(sample());
  notice(
    'این نمونه شماتیک است و برای آزمایش رابط ساخته شده؛ برای ارزیابی واقعی، عکس خود را بارگذاری کنید.'
  );
};
el<HTMLInputElement>('upload').onchange = e => {
  const file = (e.currentTarget as HTMLInputElement).files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    notice('فرمت مجاز PNG، JPG یا WebP است.', 'bad');
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    try {
      loadImage(img);
    } catch (err) {
      notice(String(err), 'bad');
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    notice('فایل تصویر باز نشد.', 'bad');
  };
  img.src = url;
};
function updateSplit() {
  const split = el<HTMLInputElement>('split');
  before.style.clipPath = 'inset(0 ' + (100 - Number(split.value)) + '% 0 0)';
}
el<HTMLInputElement>('split').oninput = updateSplit;
el<HTMLButtonElement>('compare').onclick = () => {
  const slider = el<HTMLInputElement>('split');
  slider.value = Number(slider.value) > 0 ? '0' : '50';
  updateSplit();
};
function invalidate() {
  revision++;
  validated = -1;
  if (source) {
    clearTimeout(renderTimeout);
    renderTimeout = window.setTimeout(render, 70);
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-select]').forEach(btn => {
  btn.onclick = () => {
    selected = btn.dataset.select as RegionKey;
    document
      .querySelectorAll<HTMLElement>('.region')
      .forEach(x =>
        x.classList.toggle('selected', x.dataset.region === selected)
      );
    drawOverlay();
  };
});
document.querySelectorAll<HTMLInputElement>('[data-color]').forEach(input => {
  input.oninput = () => {
    regions[input.dataset.color as RegionKey].color = input.value;
    invalidate();
  };
});
document
  .querySelectorAll<HTMLInputElement>('[data-strength]')
  .forEach(input => {
    input.oninput = () => {
      const k = input.dataset.strength as RegionKey;
      regions[k].strength = Number(input.value) / 100;
      el(k + 'Text').textContent = fa(Number(input.value)) + '٪';
      invalidate();
    };
  });
el<HTMLInputElement>('size').oninput = e => {
  el('sizeText').textContent = fa(
    Number((e.currentTarget as HTMLInputElement).value)
  );
};
el<HTMLInputElement>('soft').oninput = e => {
  el('softText').textContent = fa(
    Number((e.currentTarget as HTMLInputElement).value)
  );
  invalidate();
};
function tool(erase: boolean) {
  eraser = erase;
  el('draw').classList.toggle('selected', !erase);
  el('erase').classList.toggle('selected', erase);
}
el<HTMLButtonElement>('draw').onclick = () => tool(false);
el<HTMLButtonElement>('erase').onclick = () => tool(true);
function point(e: PointerEvent): [number, number] {
  const rect = brushCanvas.getBoundingClientRect();
  return [
    ((e.clientX - rect.left) / rect.width) * brushCanvas.width,
    ((e.clientY - rect.top) / rect.height) * brushCanvas.height,
  ];
}
function stroke(a: [number, number], b: [number, number]) {
  const q = regions[selected].mask.getContext('2d')!;
  q.save();
  q.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
  q.lineCap = 'round';
  q.lineJoin = 'round';
  q.strokeStyle = '#fff';
  q.lineWidth =
    (Number(el<HTMLInputElement>('size').value) * brushCanvas.width) / 500;
  q.beginPath();
  q.moveTo(...a);
  q.lineTo(...b);
  q.stroke();
  q.restore();
}
function drawOverlay() {
  brushCtx.clearRect(0, 0, brushCanvas.width, brushCanvas.height);
  if (!source) return;
  const temp = document.createElement('canvas');
  temp.width = brushCanvas.width;
  temp.height = brushCanvas.height;
  const t = temp.getContext('2d')!;
  t.drawImage(regions[selected].mask, 0, 0);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = '#d5a094';
  t.fillRect(0, 0, temp.width, temp.height);
  brushCtx.globalAlpha = 0.38;
  brushCtx.drawImage(temp, 0, 0);
  brushCtx.globalAlpha = 1;
}
brushCanvas.onpointerdown = e => {
  if (!source) return;
  e.preventDefault();
  dragging = true;
  brushCanvas.setPointerCapture(e.pointerId);
  const p = point(e);
  stroke(p, p);
  last = p;
  invalidate();
  drawOverlay();
};
brushCanvas.onpointermove = e => {
  if (!dragging || !last) return;
  const p = point(e);
  stroke(last, p);
  last = p;
  drawOverlay();
};
function finish() {
  if (!dragging) return;
  dragging = false;
  last = null;
  invalidate();
  drawOverlay();
}
brushCanvas.onpointerup = finish;
brushCanvas.onpointercancel = finish;
function lin(v: number) {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function srgb(v: number) {
  const x = Math.max(0, Math.min(1, v));
  return Math.round(
    (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255
  );
}
function color(hex: string): number[] {
  return [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16)));
}
function masks(w: number, h: number) {
  const f =
    (Number(el<HTMLInputElement>('soft').value) * w) / brushCanvas.width;
  return keys.map(k => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const q = cv.getContext('2d', { willReadFrequently: true })!;
    q.filter = f ? 'blur(' + f + 'px)' : 'none';
    q.drawImage(regions[k].mask, 0, 0, w, h);
    return {
      alpha: q.getImageData(0, 0, w, h).data,
      tone: color(regions[k].color),
      strength: regions[k].strength,
    };
  });
}
function composite(src: ImageData, w: number, h: number) {
  const m = masks(w, h),
    out = new Uint8ClampedArray(src.data);
  let changed = 0;
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    if (m.every(x => x.alpha[j + 3] === 0)) continue;
    const pixel = [
      lin(src.data[j]),
      lin(src.data[j + 1]),
      lin(src.data[j + 2]),
    ];
    for (const layer of m) {
      const opacity =
        1 - Math.exp(-1.55 * layer.strength * (layer.alpha[j + 3] / 255));
      for (let c = 0; c < 3; c++)
        pixel[c] = pixel[c] * (1 - opacity) + layer.tone[c] * opacity;
    }
    let modified = false;
    for (let c = 0; c < 3; c++) {
      const v = srgb(pixel[c]);
      modified ||= v !== src.data[j + c];
      out[j + c] = v;
    }
    if (modified) changed++;
  }
  return { data: new ImageData(out, w, h), changed };
}
function render() {
  if (!sourceData) return;
  afterCtx.putImageData(
    composite(sourceData, after.width, after.height).data,
    0,
    0
  );
}
el<HTMLButtonElement>('reset').onclick = () => {
  if (!source) return;
  for (const k of keys)
    regions[k].mask
      .getContext('2d')!
      .clearRect(0, 0, brushCanvas.width, brushCanvas.height);
  el<HTMLInputElement>('split').value = '0';
  updateSplit();
  invalidate();
  drawOverlay();
  notice('همه ماسک‌ها پاک شدند. تصویر اصلی حفظ شد.');
};
el<HTMLButtonElement>('validate').onclick = () => {
  if (!sourceData) return;
  const x = composite(sourceData, after.width, after.height);
  if (x.changed === 0) {
    notice('برای بررسی ایمنی باید یک ماسک آرایشی رنگ‌آمیزی شود.', 'bad');
    return;
  }
  validated = revision;
  notice(
    'بررسی موفق: ' +
      fa(x.changed) +
      ' پیکسل آرایشی تغییر کردند؛ پیکسل‌های بیرون ماسک دست‌نخورده‌اند.',
    'good'
  );
};
el<HTMLButtonElement>('export').onclick = async () => {
  if (!source) return;
  if (validated !== revision) {
    notice('برای خروجی ابتدا بررسی ایمنی را اجرا کنید.', 'bad');
    return;
  }
  const cv = document.createElement('canvas');
  cv.width = sourceW;
  cv.height = sourceH;
  const q = cv.getContext('2d', { willReadFrequently: true })!;
  q.drawImage(source, 0, 0, sourceW, sourceH);
  const src = q.getImageData(0, 0, sourceW, sourceH);
  const out = composite(src, sourceW, sourceH);
  q.putImageData(out.data, 0, 0);
  const blob = await new Promise<Blob | null>(resolve =>
    cv.toBlob(resolve, 'image/png')
  );
  if (!blob) {
    notice('ساخت PNG ناموفق بود.', 'bad');
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'H-Beauty-Makeup-Preview.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  notice(
    'PNG اصلی با ابعاد ' + fa(sourceW) + ' × ' + fa(sourceH) + ' آماده شد.',
    'good'
  );
};
