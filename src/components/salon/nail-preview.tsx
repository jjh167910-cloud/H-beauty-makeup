import { useId } from "react";
import type { NailStyle, NailShape } from "@/data/nail-styles";
import { NailOrnament } from "./nail-ornament";
import { NailMaterialGradient } from "./nail-material";

/**
 * Offline vector reference swatches: intentionally NOT photoreal salon results.
 * The uncluttered art is a color/shape guide; the real finish may differ.
 */
const SHAPES: Record<NailShape, string> = {
  almond: "M -18 37 C -19 13 -16 -11 -10 -25 C -7 -34 -4 -38 0 -39 C 4 -38 7 -34 10 -25 C 16 -11 19 13 18 37 Q 0 45 -18 37 Z",
  oval: "M -18 37 L -18 -20 Q -18 -39 0 -39 Q 18 -39 18 -20 L 18 37 Q 0 46 -18 37 Z",
  square: "M -18 37 L -18 -35 Q 0 -39 18 -35 L 18 37 Q 0 44 -18 37 Z",
  coffin: "M -18 37 L -13 -34 L 13 -34 L 18 37 Q 0 46 -18 37 Z",
};

const NAILS = [
  { x: 47, y: 130, r: -17, scale: 0.80 },
  { x: 91, y: 105, r: -8, scale: 1.02 },
  { x: 142, y: 94, r: 0, scale: 1.14 },
  { x: 194, y: 106, r: 9, scale: 1.00 },
  { x: 238, y: 137, r: 19, scale: 0.79 },
];

export function NailPreview({ style, className = "" }: { style: NailStyle; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const grad = `nail-${style.id}-${uid}`;
  const chrome = style.finish === "chrome";
  const french = style.finish === "french";
  const sparkle = style.finish === "glitter";
  const matte = style.finish === "matte";
  const art = style.finish === "art";

  return (
    <svg viewBox="0 0 290 255" className={className} role="img" data-nail-finish={style.finish} data-nail-motif={style.motif ?? "legacy"}
      aria-label={`پیش‌نمایش تصویری طرح ${style.title}، نمونهٔ شماتیک رنگ و فرم ناخن`}>
      <defs>
        <NailMaterialGradient id={grad} style={style}/>
        <radialGradient id={`${grad}-glow`}>
          <stop offset="0%" stopColor={style.accent} stopOpacity="0.32" />
          <stop offset="100%" stopColor={style.accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${grad}-skin`} x1="0" x2="1" y1="0" y2=".18">
          <stop offset="0%" stopColor="#B77E71" />
          <stop offset="19%" stopColor="#DBA38F" />
          <stop offset="47%" stopColor="#F3C6AF" />
          <stop offset="76%" stopColor="#E6B09D" />
          <stop offset="100%" stopColor="#B98177" />
        </linearGradient>
      </defs>
      <ellipse cx="145" cy="132" rx="137" ry="106" fill={`url(#${grad}-glow)`} />
      <ellipse cx="145" cy="215" rx="113" ry="17" fill="#372124" opacity=".07" />
      {NAILS.map((nail,i) => (
        <g key={i} transform={`translate(${nail.x} ${nail.y}) rotate(${nail.r}) scale(${nail.scale * (style.length === "long" ? 1.16 : style.length === "short" ? 0.92 : 1)})`}>
          <path data-nail-finger="true"
            d="M -19 -24 C -24 -13 -22 17 -24 42 C -25 66 -27 98 -26 128 L -27 220 L 27 220 L 26 128 C 27 95 25 65 24 39 C 22 11 23 -11 19 -24 C 12 -38 -11 -39 -19 -24 Z"
            fill={`url(#${grad}-skin)`} stroke="#AB7C73" strokeWidth=".7" strokeOpacity=".6" />
          <path d="M -18 -13 C -20 13 -17 55 -20 93" stroke="#FFF0DD"
            strokeWidth="2.7" strokeOpacity=".26" strokeLinecap="round" fill="none" />
          <path d="M 17 -11 C 19 19 19 48 19 70" stroke="#A96968"
            strokeWidth="1.2" strokeOpacity=".18" strokeLinecap="round" fill="none" />
          <path d={SHAPES[style.shape]} transform="translate(1 5)" fill="#352224" opacity=".10" />
          <path d={SHAPES[style.shape]} fill={`url(#${grad})`} stroke={style.accent} strokeOpacity=".40" strokeWidth="0.8" />
          {style.motif ? (
            <>
              <clipPath id={`${grad}-clip-${i}`}><path d={SHAPES[style.shape]}/></clipPath>
              <g clipPath={`url(#${grad}-clip-${i})`}>
                <NailOrnament motif={style.motif} accent={style.accent} base={style.base} index={i}/>
              </g>
            </>
          ) : null}
          {french && style.motif !== "double-french" ? (
            <path d="M -13 -22 Q 0 -33 13 -22 L 12 -29 Q 0 -41 -12 -29 Z" fill={style.accent} opacity=".97" />
          ) : null}
          {!style.motif && sparkle ? Array.from({ length: 8 }, (_,dot) => (
            <circle key={dot} cx={((dot*11+i*7)%26)-13} cy={((dot*19+i*11)%55)-24}
              r={dot%3===0?1.8:0.85} fill={style.accent} opacity=".75" />
          )) : null}
          {!style.motif && art ? (
            <>
              <path d="M -8 21 Q 4 10 -6 -2 T 8 -29" stroke={style.accent} strokeWidth="2.1" fill="none" strokeLinecap="round" opacity=".9" />
              {i%2===0 ? <circle cx="8" cy="-18" r="3.8" fill={style.accent} opacity=".7" /> : null}
              {i%3===0 ? <circle cx="-7" cy="10" r="2.3" fill={style.accent} opacity=".6" /> : null}
            </>
          ) : null}
          {chrome ? <path d="M -9 26 C -15 6 -13 -18 -6 -31" stroke="#FFFFFF" strokeOpacity=".67" strokeWidth="3" fill="none" strokeLinecap="round" /> : null}
          {!matte ? <path d="M -11 25 C -13 8 -12 -12 -7 -22" stroke="#FFFFFF" strokeOpacity={chrome?".36":".42"} strokeWidth="2.3" fill="none" strokeLinecap="round" /> : null}
          <path d="M -14 35 Q 0 46 14 35" stroke="#A36B66" strokeOpacity=".38" strokeWidth="1.35" fill="none" />
          <path d="M -9 38 Q 0 40 9 38" stroke="#FFF5E8" strokeOpacity=".28" strokeWidth=".7" fill="none" />
        </g>
      ))}
      <path d="M 54 239 H 236" stroke={style.accent} opacity=".28" strokeWidth=".75"/>
    </svg>
  );
}
