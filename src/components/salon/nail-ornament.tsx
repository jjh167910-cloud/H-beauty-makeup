import type { NailMotif } from "@/data/nail-styles";

/**
 * Deterministic, scalable editorial nail-pattern layer. Coordinates are in
 * one 36x80 nail-local rectangle, clipped by the parent nail silhouette.
 * These are artistic references, not photographs or validated salon outcomes.
 */
export function NailOrnament({motif,accent,base,index=0}:{
  motif:NailMotif;accent:string;base:string;index?:number;
}) {
  const fine={stroke:accent,strokeWidth:1.6,fill:"none",strokeLinecap:"round" as const};
  const bright="#FFF9EF";
  switch(motif){
    case "plain":
      return null;
    case "velvet":
      return <g opacity=".28">{Array.from({length:22},(_,i)=><circle key={i}
        cx={-14+(i*13+index*3)%29} cy={-31+(i*17+index*7)%63}
        r={0.4+(i%3)*.21} fill={i%2?bright:accent}/>)}</g>;
    case "beam":
      return <g>
        <path d="M-18 19 Q0 -11 17 -38" stroke={bright} strokeWidth="12" opacity=".10" fill="none"/>
        <path d="M-18 15 Q0 -14 17 -39" stroke={accent} strokeWidth="8" opacity=".40" fill="none"/>
        <path d="M-17 11 Q2 -17 16 -39" stroke={bright} strokeWidth="2.6" opacity=".72" fill="none"/>
      </g>;
    case "jelly":
      return <g>
        <path d="M-16 -34 Q-2 -19 15 -30" stroke={bright} opacity=".52" strokeWidth="3" fill="none"/>
        <path d="M-11 21 Q0 28 13 18" stroke={accent} opacity=".34" strokeWidth="5" fill="none"/>
      </g>;
    case "aura":
      return <g>
        <ellipse cy="-5" rx="17" ry="25" fill={accent} opacity=".26"/>
        <ellipse cy="-4" rx="10" ry="18" fill={bright} opacity=".34"/>
        <ellipse cy="-4" rx="5" ry="12" fill={accent} opacity=".54"/>
      </g>;
    case "foil":
      return <g opacity=".93">
        <path d="M-14 -27 L-4 -36 L2 -20 L-10 -13 Z" fill="#D9B972"/>
        <path d="M-1 5 L15 -2 L8 17 L-8 19 Z" fill="#F8E2A5"/>
        <path d="M-11 21 L-1 17 L-6 34 L-16 29 Z" fill="#A17A3C"/>
        <path d="M-14 -27 L-4 -36 L2 -20" stroke={bright} opacity=".72" strokeWidth="1" fill="none"/>
      </g>;
    case "botanical":
      return <g fill="none" strokeLinecap="round">
        <path d="M-8 30 Q7 6 -1 -29" {...fine}/>
        <path d="M-2 12 Q-18 8 -14 -1 Q-6 -4 -2 12Z M2 -5 Q16 -13 14 -21 Q4 -20 2 -5Z"
          stroke={accent} strokeWidth="1.1" fill={accent} fillOpacity=".32"/>
        <circle cx="-1" cy="-28" r="2" fill={bright}/>
      </g>;
    case "geometry":
      return <g fill="none">
        <path d="M-18 -23 L6 -2 L-13 28" stroke={accent} strokeWidth="3"/>
        <path d="M-2 -37 L18 -13 L-3 31" stroke={bright} strokeWidth="1.5" opacity=".85"/>
        <path d="M-17 2 H17" stroke={accent} strokeWidth="1.2" opacity=".75"/>
      </g>;
    case "stars":
      return <g fill={bright}>
        {Array.from({length:8},(_,i)=>{
          const x=-13+(i*11+index*5)%27,y=-32+(i*17+index*3)%64;
          return i%3===0?<path key={i} d={`M${x} ${y-5} l1.7 3.3 3.3 1.7 -3.3 1.7 -1.7 3.3 -1.7 -3.3 -3.3 -1.7 3.3 -1.7Z`} opacity=".8"/>:
           <circle key={i} cx={x} cy={y} r={i%2?.9:1.5} opacity=".85"/>;
        })}
      </g>;
    case "waves":
      return <g fill="none" strokeLinecap="round">
        <path d="M-13 37 C17 18 -19 -6 12 -36" stroke={bright} strokeWidth="5" opacity=".58"/>
        <path d="M-10 37 C20 18 -16 -6 15 -36" stroke={accent} strokeWidth="2.7" opacity=".85"/>
        <path d="M-18 -8 C-1 -11 2 -23 17 -20" stroke={bright} strokeWidth="2" opacity=".58"/>
      </g>;
    case "minimal":
      return <g><circle cx="0" cy="-8" r="3" fill={accent}/>
        <circle cx=".7" cy="-9" r=".9" fill={bright}/></g>;
    case "pearls":
      return <g>
        <path d="M-17 -23 Q0 -31 17 -23" stroke={bright} strokeWidth="6" fill="none"/>
        {[-9,0,9].map((x,i)=><g key={x}><circle cx={x} cy={i%2?2:8} r="3.4" fill={bright} stroke="#AB9A94" strokeWidth=".5"/>
          <circle cx={x-1} cy={(i%2?2:8)-1} r="1" fill="#FFF" /></g>)}
      </g>;
    case "leaves":
      return <g fill={accent} fillOpacity=".57" stroke={accent} strokeWidth=".7">
        <path d="M-9 -23 Q-13 -38 -2 -34 Q5 -25 -9 -23 Z"/>
        <path d="M5 12 Q-1 -1 14 -5 Q20 9 5 12 Z"/>
        <path d="M-12 30 Q-19 15 -4 13 Q4 26 -12 30 Z"/>
        <path d="M-14 37 Q3 9 12 -35" fill="none" strokeWidth="1.3"/>
      </g>;
    case "gradient":
      return <g>
        <path d="M-18 -37 Q18 -37 18 -3 Q0 -14 -18 -3Z" fill={accent} opacity=".48"/>
        <path d="M-18 -25 Q15 -28 18 -1" stroke={bright} strokeWidth="5" opacity=".11" fill="none"/>
      </g>;
    case "prism":
      return <g opacity=".83">
        <path d="M-18 -33 L-1 -40 L8 40 L-6 40Z" fill={bright} opacity=".38"/>
        <path d="M4 -40 L13 -36 L18 40 L11 40Z" fill={accent} opacity=".82"/>
        <path d="M-5 -40 L3 -40 L11 40 L4 40Z" fill="#BBD6FC" opacity=".42"/>
        <path d="M-13 -35 L-1 -40 L8 40" stroke={bright} strokeWidth="1.3" fill="none" opacity=".85"/>
      </g>;
    case "double-french":
      return <g>
        <path d="M-18 -18 Q0 -28 18 -18" stroke={accent} strokeWidth="2.6" fill="none"/>
        <path d="M-18 -25 Q0 -35 18 -25" stroke={bright} strokeWidth="2.2" fill="none"/>
      </g>;
    case "watercolor":
      return <g>
        <ellipse cx="-7" cy="-22" rx="11" ry="17" fill={accent} opacity=".36"/>
        <ellipse cx="8" cy="0" rx="14" ry="21" fill={bright} opacity=".32"/>
        <ellipse cx="-3" cy="25" rx="12" ry="14" fill={accent} opacity=".31"/>
        <path d="M-15 -12 Q1 -18 11 -8 M-13 22 Q0 10 14 21" stroke={bright} opacity=".43" strokeWidth="1.1" fill="none"/>
      </g>;
    case "marble":
      return <g fill="none" strokeLinecap="round">
        <path d="M-14 -38 C12 -20 -7 -2 15 10 C-8 22 -1 28 13 38" stroke={accent} strokeWidth="2.1"/>
        <path d="M-8 -38 C-20 -18 15 -13 5 9 C-8 29 12 34 6 40" stroke={bright} strokeWidth="2.9" opacity=".64"/>
        <path d="M-12 -36 C14 -17 -1 0 16 13" stroke="#C29A52" strokeWidth=".8"/>
      </g>;
    default:
      return <circle cx="0" cy="0" r="2" fill={base}/>;
  }
}
