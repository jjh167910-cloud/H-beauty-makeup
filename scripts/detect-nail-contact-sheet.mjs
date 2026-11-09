/**
 * High-confidence, conservative grid/contact-sheet screening.
 *
 * A bright full-height separator repeated at regular intervals together with
 * repeated full-width separators is a strong multi-panel signal. This is a
 * rejection-only QA gate, not proof that undetected photos are single frames:
 * low-contrast grids, overlapping montages and sharpened crops require human
 * inspection.
 *
 * Input is the set of bright/neutral stripe pixel coordinates returned by
 * the browser decoder, NOT filenames or image dimensions alone.
 */

function seamCenters(positions,dimension) {
  if(!Array.isArray(positions)||!Number.isInteger(dimension)||dimension<1)
    throw Error("Invalid separator scan");
  const interior=positions.filter(x=>Number.isInteger(x)&&x>=dimension*.05&&x<=dimension*.95)
    .sort((a,b)=>a-b);
  const groups=[];
  for(const x of interior){
    const last=groups.at(-1);
    if(last&&x-last.at(-1)<=3)last.push(x);
    else groups.push([x]);
  }
  // Broad light backgrounds can cover many columns, but are not panel
  // borders. Reject them rather than counting each bright pixel as a seam.
  return groups.filter(g=>g.length<=Math.max(6,Math.ceil(dimension*.022)))
    .map(g=>g[Math.floor(g.length/2)]);
}

function repeatedRun(values,dimension,minLength) {
  // Hundreds of unrelated thin highlights should not trigger cubic search.
  // A true salon contact sheet cannot have 40+ meaningful column gutters.
  if(values.length<minLength||values.length>40)return [];
  for(let start=0;start<=values.length-minLength;start++){
    for(let end=start+minLength;end<=values.length;end++){
      const part=values.slice(start,end);
      const gaps=part.slice(1).map((p,i)=>p-part[i]);
      const min=Math.min(...gaps),max=Math.max(...gaps);
      if(min>dimension*.07&&max<dimension*.40&&max/min<=1.35)
        return part;
    }
  }
  return [];
}

export function inspectPanelGrid({vertical, horizontal, width, height}) {
  const cols=seamCenters(vertical,width);
  const rows=seamCenters(horizontal,height);
  const regularVertical=repeatedRun(cols,width,4);
  const regularHorizontal=repeatedRun(rows,height,2);
  // Require strong two-axis evidence, with a fallback for very wide grids
  // having one unmistakable horizontal divider.
  const detected=(regularVertical.length>=4 && regularHorizontal.length>=2)
    || (repeatedRun(cols,width,5).length>=5 && rows.length>=1
      && rows.some(y=>y>=height*.2&&y<=height*.8));
  return {likelyContactSheet:detected,
    verticalSeams:cols.length,horizontalSeams:rows.length,
    regularVerticalCount:regularVertical.length,
    regularHorizontalCount:regularHorizontal.length};
}
