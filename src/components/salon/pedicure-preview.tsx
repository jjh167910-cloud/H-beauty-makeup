import { useId } from "react";
import type { NailStyle } from "@/data/nail-styles";
import { NailOrnament } from "./nail-ornament";
import { NailMaterialGradient } from "./nail-material";

/** Offline pedicure color-and-shape illustration: never mistaken for a customer photo. */
export function PedicurePreview({ style }: { style: NailStyle }) {
  const id=useId().replace(/:/g,"");
  const toes=[
    {x:62,y:72,rx:34,ry:53,w:31,h:31},
    {x:121,y:100,rx:28,ry:43,w:25,h:25},
    {x:173,y:116,rx:24,ry:37,w:22,h:22},
    {x:217,y:137,rx:21,ry:34,w:19,h:19},
    {x:253,y:154,rx:17,ry:29,w:16,h:16},
  ];
  return (
    <svg viewBox="0 0 312 262" role="img" data-nail-finish={style.finish} data-nail-motif={style.motif ?? "legacy"} aria-label={`شبیه‌سازی رنگ پدیکور ${style.title}`} width="100%" height="100%">
      <defs>
        <linearGradient id={`pedi-skin-${id}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#F2CEBB"/><stop offset=".5" stopColor="#DCA990"/><stop offset="1" stopColor="#B77967"/>
        </linearGradient>
        <NailMaterialGradient id={`pedi-nail-${id}`} style={style}/>
      </defs>
      <ellipse cx="156" cy="236" rx="125" ry="18" fill="#3E2830" opacity=".09"/>
      <path d="M 22 260 C 17 220 31 153 42 111 C 48 90 72 70 89 95 C 103 117 129 132 149 145 C 179 164 249 186 277 218 L 296 260 Z"
        fill={`url(#pedi-skin-${id})`} stroke="#A97F72" strokeWidth="1"/>
      {toes.map((t,i)=>(
        <g key={i}>
          <ellipse cx={t.x} cy={t.y} rx={t.rx} ry={t.ry}
            fill={`url(#pedi-skin-${id})`} stroke="#B78975" strokeWidth=".85"/>
          <rect x={t.x-t.w/2} y={t.y-t.ry+10} width={t.w} height={t.h}
            rx={Math.min(t.w/3,8)} fill={`url(#pedi-nail-${id})`} stroke="#B17B71" strokeOpacity=".3"/>

          {style.motif ? (
            <>
              <clipPath id={`pedi-${id}-clip-${i}`}>
                <rect x={t.x-t.w/2} y={t.y-t.ry+10} width={t.w} height={t.h} rx={Math.min(t.w/3,8)}/>
              </clipPath>
              <g clipPath={`url(#pedi-${id}-clip-${i})`}>
                {style.motif==="minimal" ? (
                  // A single salon-scale accent dot: 80-unit manicure patterns
                  // shrink too far on the 16–31px-wide pedicure nail beds.
                  <g>
                    <circle cx={t.x} cy={t.y-t.ry+10+t.h*.47}
                      r={Math.max(2.1,t.w*.125)}
                      fill={style.color==="dark"?"#FFF5EA":"#57413C"}/>
                    <circle cx={t.x-.5} cy={t.y-t.ry+10+t.h*.47-1}
                      r={Math.max(.55,t.w*.025)} fill="#FFF9F0" opacity=".66"/>
                  </g>
                ) : (
                  <g transform={`translate(${t.x} ${t.y-t.ry+10+t.h/2}) scale(${t.w/36} ${t.h/80})`}>
                    <NailOrnament motif={style.motif} accent={style.accent} base={style.base} index={i}/>
                  </g>
                )}
              </g>
            </>
          ) : null}
          {style.finish==="french" && style.motif!=="double-french"?<path d={`M ${t.x-t.w*.37} ${t.y-t.ry+18} Q ${t.x} ${t.y-t.ry+10} ${t.x+t.w*.37} ${t.y-t.ry+18}`} stroke="#FFFDF8" strokeWidth={i?3:4} fill="none" strokeLinecap="round"/>:null}
          {style.finish==="glitter"?<circle cx={t.x-3} cy={t.y-t.ry+18} r={i===0?3:1.8} fill="white" opacity=".85"/>:null}
          {style.finish!=="matte" ? <path d={`M ${t.x-t.w*.23} ${t.y-t.ry+16} L ${t.x-t.w*.23} ${t.y-t.ry+t.h*.72}`} stroke="#FFFFFF" strokeWidth="2" opacity={style.finish==="jelly"?".16":style.finish==="chrome"?".7":".43"} strokeLinecap="round"/> : null}
        </g>
      ))}
    </svg>
  );
}
