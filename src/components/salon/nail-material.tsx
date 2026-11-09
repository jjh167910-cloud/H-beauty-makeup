import type { NailStyle } from "@/data/nail-styles";

/**
 * Finish-specific SVG shader. Uses the selected palette while preserving
 * the actual nail geometry and drawing entirely offline.
 *
 * An illustrated reference is not a photo of completed salon work. Chrome,
 * jelly and velvet must have visibly different reflectance even when their
 * base swatches happen to match.
 */
export function NailMaterialGradient({id,style}: {id:string;style:NailStyle}) {
  const {base,accent,finish} = style;
  const stop=(offset:string,color:string,opacity=1)=>
    <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity}/>;
  const low="#56404A";
  const white="#FFFDF9";
  const render=()=>{
    switch(finish){
      case "matte":
        // Flat, opaque pigment with broad tonal shading and no bright stripe.
        return [stop("0%",accent,.5),stop("22%",base),stop("76%",base),stop("100%",low,.22)];
      case "chrome":
        // Alternating mirror bands suggest a reflective metallic film.
        return [stop("0%",low,.75),stop("13%",accent),stop("24%",white),stop("30%",base),
          stop("44%",low,.75),stop("57%",white),stop("65%",accent),
          stop("83%",base),stop("100%",low,.85)];
      case "jelly":
        // The underlying finger shows through a translucent colored film.
        return [stop("0%",accent,.3),stop("30%",base,.73),stop("72%",base,.65),
          stop("100%",accent,.35)];
      case "cat-eye":
        return [stop("0%",low,.68),stop("25%",base),stop("46%",accent),
          stop("57%",base),stop("100%",low,.64)];
      case "ombre":
        // Nail tip is at the upper edge; base color ends at the cuticle.
        return [stop("0%",accent),stop("20%",accent,.92),stop("45%",base),
          stop("80%",base),stop("100%",base)];
      case "aura":
        return [stop("0%",base),stop("32%",accent,.54),stop("65%",base),stop("100%",base)];
      case "glitter":
        return [stop("0%",base),stop("48%",accent,.7),stop("100%",base)];
      case "foil":
        return [stop("0%",base),stop("52%",base),stop("100%",accent,.48)];
      case "3d":
        return [stop("0%",base),stop("44%",accent,.65),stop("70%",base),stop("100%",base)];
      case "french":
      case "gloss":
      case "art":
      default:
        return [stop("0%",accent,.7),stop("13%",base),stop("65%",base),
          stop("91%",accent,.38),stop("100%",base)];
    }
  };
  return (
    <linearGradient id={id} data-nail-material={finish}
      x1="0" y1="0" x2={finish==="chrome" ? "1" : ".28"} y2="1">
      {render()}
    </linearGradient>
  );
}
