/**
 * Offline human-review gallery of actual WebGL2 public-catalog before/after frames.
 * This produces static HTML only; it never requests photos, metrics or remote
 * resources, and only uses images explicitly saved from browser verification.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPRESENTATIVE = ["icy", "mod-60s", "cut-crease"];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

export function makeVisualReport(dir) {
  const data = JSON.parse(readFileSync(join(dir, "metrics.json"), "utf8"));
  if (data.source !== "public catalog only" || !Array.isArray(data.summary) || !data.summary.length)
    throw new Error("Only the public catalog GPU evaluation may be published as a gallery");
  const safe = data.summary.filter(x =>
    REPRESENTATIVE.includes(x.look) &&
    existsSync(join(dir, x.look + "-before.png")) &&
    existsSync(join(dir, x.look + "-after.png")));
  if (safe.length !== 3) throw new Error("Missing one of three actual-GPU public before/after pairs");
  const worsened = data.summary.filter(x => x.candidateLstar < x.baselineLstar - 0.2);
  const changed = data.summary.filter(x => x.candidateLstar - x.baselineLstar > 0.1);
  const cards = safe.map(x => {
    const id = escapeHtml(x.look);
    const gain = +(x.candidateLstar - x.baselineLstar).toFixed(3);
    return [
      '<article class="look">',
      '<div class="lookhead"><h2>' + escapeHtml(x.look.replaceAll("-", " ").toUpperCase()) + '</h2>',
      '<span class="metric">' + (gain >= 0 ? "+" : "") + gain.toFixed(3) + ' L*</span></div>',
      '<div class="comparison" style="--reveal:50%">',
      '<img src="' + id + '-before.png" alt="Original public reference with default GPU engine">',
      '<div class="candidate"><img src="' + id + '-after.png" alt="Experimental candidate rendered with same public reference"></div>',
      '<div class="handle" aria-hidden="true"></div>',
      '<input type="range" min="0" max="100" value="50" aria-label="Reveal candidate comparison for ' + id + '">',
      '<span class="stamp left">BEFORE</span><span class="stamp right">CANDIDATE</span>',
      '</div><p class="description">Same public catalog face and GPU renderer, with candidate eye-layer pixels only.</p>',
      '</article>'
    ].join("");
  }).join("\n");
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="dark">',
    '<title>H-Beauty · Actual GPU Before / After</title>',
    '<style>',
    ':root{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f3f3f5;background:#121216}',
    '*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top,#27232b,#121216 54%)}',
    'header,main,footer{width:min(1100px,calc(100% - 32px));margin:auto}header{padding:54px 0 28px}h1{font-size:clamp(28px,5vw,50px);letter-spacing:-.04em;margin:10px 0}h2{font-size:16px;letter-spacing:.09em;margin:0}',
    '.eyebrow{font-size:12px;color:#c2a7f5;letter-spacing:.16em;font-weight:800}.sub{color:#bab9c2;line-height:1.65;max-width:750px}',
    '.summary{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}.stat{background:#25252c;border:1px solid #34343f;padding:14px 20px;border-radius:16px}.stat strong{display:block;font-size:24px}.stat span{font-size:12px;color:#b4b1be}',
    'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:20px;padding-bottom:28px}',
    '.look{background:#202026;border:1px solid #393741;border-radius:24px;overflow:hidden;padding:15px}.lookhead{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:5px 0 13px}',
    '.metric{color:#c9f0db;font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap}.comparison{position:relative;overflow:hidden;border-radius:15px;aspect-ratio:3/4;touch-action:pan-y;background:#38343c}',
    '.comparison>img,.candidate img{width:100%;height:100%;object-fit:cover;display:block}.candidate{position:absolute;inset:0;clip-path:inset(0 calc(100% - var(--reveal)) 0 0);pointer-events:none}',
    '.candidate img{position:absolute;inset:0}.handle{position:absolute;z-index:2;top:0;bottom:0;left:var(--reveal);width:2px;background:white;pointer-events:none;box-shadow:0 0 0 1px #0008}',
    '.handle:after{content:"↔";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:37px;height:37px;border-radius:50%;background:#fff;color:#16141c;font-weight:bold;box-shadow:0 2px 12px #0008}',
    'input[type=range]{position:absolute;inset:0;z-index:3;width:100%;height:100%;opacity:0;cursor:ew-resize;margin:0;touch-action:pan-y}',
    '.stamp{position:absolute;bottom:12px;font-size:10px;font-weight:800;letter-spacing:.12em;border-radius:8px;background:#13121bba;padding:8px;pointer-events:none}.stamp.left{left:10px}.stamp.right{right:10px}',
    '.description{font-size:12px;color:#b7b4c1;line-height:1.55;margin:13px 3px 4px}',
    '.blind-link{display:inline-flex;align-items:center;margin-top:17px;padding:12px 17px;border-radius:12px;background:#b79efa;color:#1b1424;font-size:13px;font-weight:800;text-decoration:none}.blind-link:focus-visible{outline:3px solid white;outline-offset:3px}',
    'footer{border-top:1px solid #34343f;color:#a7a4b0;padding:22px 0 45px;font-size:12px;line-height:1.75}',
    '</style></head><body>',
    '<header><div class="eyebrow">H-BEAUTY · PUBLIC RESEARCH PREVIEW</div>',
    '<h1>Makeup, under the microscope.</h1>',
    '<p class="sub">Drag on each portrait to compare actual WebGL2 renders from the same unretouched public catalog reference. The candidate modifies eyelid-layer extraction only. This offline report contains no private portraits or remote trackers.</p>',
    '<div class="summary"><div class="stat"><strong>' + data.summary.length + '</strong><span>Looks tested</span></div>',
    '<div class="stat"><strong>' + changed.length + '</strong><span>Brighter lids (ΔL* &gt; 0.1)</span></div>',
    '<div class="stat"><strong>' + worsened.length + '</strong><span>Darkness regressions (ΔL* &lt; −0.2)</span></div></div>',
    '<a class="blind-link" href="blind-review.html">Review A vs B blindly · 3 looks</a></header>',
    '<main>' + cards + '</main>',
    '<footer>Research preview only · Not a production release · Metrics and screenshots are from GitHub Actions browser tests on one public catalog face. Real-face generalization, artist review and Android hardware acceptance are not established.</footer>',
    '<script>document.querySelectorAll(".comparison").forEach(function(el){var slider=el.querySelector("input");slider.addEventListener("input",function(){el.style.setProperty("--reveal",slider.value+"%")})});</script>',
    '</body></html>'
  ].join("");
  writeFileSync(join(dir, "index.html"), html);
  return { looks: data.summary.length, samples: safe.length, brighter: changed.length, worsened: worsened.length };
}
