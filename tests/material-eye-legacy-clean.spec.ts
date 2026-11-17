import { test, expect } from "playwright/test";

/** Opt-in GPU regression: strip a synthetic source-model ghost only from
 * face-fitted wing ink; original photograph and out-of-ROI pixels survive.
 * All source arrays are generated in memory, not customer photographs.
 */
test("native eye wing does not transmit legacy catalog-color ghost under new ink", async ({ page }) => {
  await page.goto("/");
  const r = await page.evaluate(async () => {
    const { NATIVE_EYE_FS, nativeEyeMaterial } =
      await import("/src/lib/material-eye-native.ts");
    const W=320, H=240;
    const P=Array.from({length:478},()=>[0,0,0]);
    const upper=[33,246,161,160,159,158,157,173,133];
    const brows=[70,63,105,66,107];
    upper.forEach((id,i)=>P[id]=[105+10*i,145-10*Math.sin(i*Math.PI/8),0]);
    brows.forEach((id,i)=>P[id]=[107+19*i,95+3*Math.abs(i-2),0]);
    P[145]=[145,163,0];
    const mat=nativeEyeMaterial(P,"electric-blue","natural");
    if (!mat || !mat.enabled[0]) return {invalid:true};
    const gl=document.createElement("canvas").getContext("webgl2",
      {preserveDrawingBuffer:true,premultipliedAlpha:false,antialias:false});
    if (!gl) return {unavailable:true};
    gl.canvas.width=W;gl.canvas.height=H;gl.viewport(0,0,W,H);
    gl.disable(gl.DITHER);gl.disable(gl.BLEND);
    const compile=(kind:number,source:string)=>{
      const sh=gl.createShader(kind)!;gl.shaderSource(sh,source);
      gl.compileShader(sh);
      if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(sh)||"shader compilation");
      return sh;
    };
    const pr=gl.createProgram()!;
    gl.attachShader(pr,compile(gl.VERTEX_SHADER,
      "#version 300 es\nin vec2 aPos;void main(){gl_Position=vec4(aPos,0,1);}"));
    gl.attachShader(pr,compile(gl.FRAGMENT_SHADER,NATIVE_EYE_FS));
    gl.bindAttribLocation(pr,0,"aPos");gl.linkProgram(pr);
    if(!gl.getProgramParameter(pr,gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(pr)||"shader program");
    gl.useProgram(pr);
    const quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,quad);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    const uniform=(name:string)=>gl.getUniformLocation(pr,name);
    const flip=(v:Uint8Array)=>{
      const result=new Uint8Array(v.length);
      for(let y=0;y<H;y++)
        result.set(v.subarray(y*W*4,(y+1)*W*4),(H-y-1)*W*4);
      return result;
    };
    const image=new Uint8Array(W*H*4);
    for(let i=0;i<W*H;i++)image.set([112,88,78,255],i*4);
    const ghost=new Uint8Array(image);
    // Old catalog-magenta residue at the outer wing; no photo pixels changed.
    for(let y=110;y<=155;y++)for(let x=72;x<=110;x++){
      const i=(y*W+x)*4;ghost[i]=239;ghost[i+1]=26;ghost[i+2]=178;
    }
    const tex=(pixels:Uint8Array, w:number,h:number,rg=false)=>{
      const out=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,out);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,rg?gl.RG8:gl.RGBA8,w,h,0,
        rg?gl.RG:gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return out;
    };
    const vis=new Uint8Array(256*256*2);
    for(let k=0;k<vis.length;k+=2)vis[k]=255;
    const textures=[tex(flip(image),W,H),tex(image,W,H),tex(vis,256,256,true)];
    for(let i=0;i<textures.length;i++){
      gl.activeTexture(gl.TEXTURE0+i);
      gl.bindTexture(gl.TEXTURE_2D,textures[i]);
      gl.uniform1i(uniform(["uPrevious","uOriginal","uVis"][i]),i);
    }
    gl.uniform2f(uniform("uSize"),W,H);
    gl.uniform3f(uniform("uVisBox"),0,0,W);
    gl.uniform1i(uniform("uVisOn"),1);
    gl.uniform2fv(uniform("uUpper"),mat.upper);
    gl.uniform2fv(uniform("uBrows"),mat.brows);
    gl.uniform4fv(uniform("uFrame"),mat.frame);
    gl.uniform1fv(uniform("uSpan"),mat.span);
    gl.uniform1iv(uniform("uEnabled"),mat.enabled);
    gl.uniform3fv(uniform("uPigmentA"),mat.pigmentA);
    gl.uniform3fv(uniform("uPigmentB"),mat.pigmentB);
    gl.uniform1f(uniform("uAmount"),mat.amount);
    gl.uniform1i(uniform("uMode"),mat.mode);
    gl.uniform2fv(uniform("uLift"),mat.lift);
    gl.uniform1fv(uniform("uOpening"),mat.opening);
    gl.uniform3fv(uniform("uLinerColor"),mat.linerColor);
    gl.uniform1f(uniform("uLinerWidth"),mat.linerWidth);
    gl.uniform1f(uniform("uWingLength"),mat.wingLength);
    gl.uniform1f(uniform("uLashLength"),0);
    gl.uniform1i(uniform("uLashCount"),mat.lashCount);
    gl.uniform1f(uniform("uInkSoft"),mat.inkSoft);
    gl.uniform1f(uniform("uShimmer"),0);
    gl.uniform1f(uniform("uRhinestones"),0);
    const priorTexture=textures[0];
    const draw=(pixels:Uint8Array,cleanup:number)=>{
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,priorTexture);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,W,H,gl.RGBA,
        gl.UNSIGNED_BYTE,flip(pixels));
      gl.uniform1i(uniform("uCleanLegacy"),cleanup);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const read=new Uint8Array(W*H*4);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,read);
      return flip(read);
    };
    const reference=draw(image,1);
    gl.uniform1f(uniform("uWingLength"),0);
    const wingless=draw(image,1);
    gl.uniform1f(uniform("uWingLength"),mat.wingLength);
    const old=draw(ghost,0);
    const cleaned=draw(ghost,1);
    // Test catalog mascara leaking BETWEEN new strokes, using the
    // underlying source to restore just the customer's upper-lid seam.
    // All new makeup is disabled to ensure the seam cleanup itself is
    // genuinely effective, not merely hidden under newly painted ink.
    const seamGhost=new Uint8Array(image);
    for(let y=124;y<=145;y++)for(let x=125;x<=175;x++){
      const off=(y*W+x)*4;
      seamGhost[off]=239;seamGhost[off+1]=26;seamGhost[off+2]=178;
    }
    gl.uniform1f(uniform("uAmount"),0);
    gl.uniform1f(uniform("uLinerWidth"),0);
    gl.uniform1f(uniform("uWingLength"),0);
    gl.uniform1f(uniform("uLashLength"),0);
    gl.uniform1f(uniform("uShimmer"),0);
    gl.uniform1f(uniform("uRhinestones"),0);
    const seamUnclean=draw(seamGhost,0);
    const seamRestored=draw(seamGhost,1);
    // With pigment at zero, disabling the native cleanup must preserve
    // EVERY prior RGBA channel. The old replacement mask incorrectly
    // cleared a broad eyelid wash, even with no active cosmetic material.
    let noCosmeticsDelta=0;
    for(let k=0;k<seamGhost.length;k++)
      if(seamUnclean[k]!==seamGhost[k]) noCosmeticsDelta++;
    const probe=(arr:Uint8Array,x:number,y:number)=>{
      const offset=(y*W+x)*4;
      return [...arr.subarray(offset,offset+4)];
    };
    const near=[145,134],far=[145,131];
    const rgbDistance=(a:number[],b:number[])=>
      Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]);
    const nearBefore=rgbDistance(probe(seamUnclean,...near),probe(image,...near));
    const nearAfter=rgbDistance(probe(seamRestored,...near),probe(image,...near));
    const farDelta=rgbDistance(probe(seamRestored,...far),probe(seamUnclean,...far));
    gl.uniform1f(uniform("uAmount"),mat.amount);
    gl.uniform1f(uniform("uLinerWidth"),mat.linerWidth);
    gl.uniform1f(uniform("uWingLength"),mat.wingLength);
    let seamImproved=0,seamProtected=0,seamSclera=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const off=(y*W+x)*4;
      let priorDistance=0,afterDistance=0;
      for(let c=0;c<3;c++){
        priorDistance+=Math.abs(seamUnclean[off+c]-image[off+c]);
        afterDistance+=Math.abs(seamRestored[off+c]-image[off+c]);
      }
      if(x>=125&&x<=175&&y>=124&&y<=145 &&
         afterDistance<priorDistance-8) seamImproved++;
      if((x<112||x>188||y<105||y>169) &&
         seamUnclean.slice(off,off+4).some((v,i)=>v!==seamRestored[off+i]))
        seamProtected++;
      if(y>=149&&y<=170&&x>=125&&x<=175 &&
         seamUnclean.slice(off,off+4).some((v,i)=>v!==seamRestored[off+i]))
        seamSclera++;
    }
    // Anatomic lash fan is evaluated in the actual GPU shader, with
    // eyeshadow held constant and eyeliner/wing disabled for isolation.
    gl.uniform1f(uniform("uLinerWidth"),0);
    gl.uniform1f(uniform("uWingLength"),0);
    const lashless=draw(image,1);
    gl.uniform1f(uniform("uLashLength"),mat.lashLength);
    const lashed=draw(image,1);
    gl.uniform1f(uniform("uLashLength"),0);
    gl.uniform1f(uniform("uLinerWidth"),mat.linerWidth);
    gl.uniform1f(uniform("uWingLength"),mat.wingLength);
    let lashChanged=0, lashOutside=0, outerLashes=0, innerLashes=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const at=(y*W+x)*4;
      let different=false;
      for(let c=0;c<4;c++) if(lashed[at+c]!==lashless[at+c]) different=true;
      if(!different)continue;
      lashChanged++;
      if(x<65||x>230||y<62||y>185)lashOutside++;
      if(x>=110&&x<=135&&y>=115&&y<=149)outerLashes++;
      if(x>=158&&x<=185&&y>=115&&y<=149)innerLashes++;
    }
    let inkSamples=0, legacyDifference=0, cleanedDifference=0, protectedDifference=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=(y*W+x)*4;
      let ink=false;
      for(let c=0;c<3;c++)
        if(Math.abs(reference[i+c]-image[i+c])>6)ink=true;
      if(ink && x>=72 && x<=110 && y>=110 && y<=155){
        inkSamples++;
        for(let c=0;c<3;c++){
          legacyDifference+=Math.abs(old[i+c]-reference[i+c]);
          cleanedDifference+=Math.abs(cleaned[i+c]-reference[i+c]);
        }
      }
      if((x<65||x>230||y<62||y>185) &&
         (cleaned[i]!==ghost[i]||cleaned[i+1]!==ghost[i+1]||
          cleaned[i+2]!==ghost[i+2]||cleaned[i+3]!==ghost[i+3]))
        protectedDifference++;
    }
    // The root of a real wing carries more ink than its pointed tip.
    // Probe equal cross-sections of the *native shader's* rendered wing
    // relative to the same makeup with the wing switched off.
    const root = [116.2, 140.8], tip = [
      P[33][0] - mat.span[0]*mat.wingLength,
      P[33][1] + mat.lift[1]*mat.span[0]*0.11
    ];
    const crossSection=(fraction:number)=>{
      const dx=tip[0]-root[0],dy=tip[1]-root[1];
      const len=Math.hypot(dx,dy);
      const cx=root[0]+fraction*dx,cy=root[1]+fraction*dy;
      let score=0,distinct=new Set<number>();
      for(let j=-5;j<=5;j++){
        const x=Math.round(cx-j*dy/len),y=Math.round(cy+j*dx/len);
        if(x<0||y<0||x>=W||y>=H)continue;
        const i=(y*W+x)*4;
        if(distinct.has(i))continue; distinct.add(i);
        score+=Math.abs(reference[i]-wingless[i])+
          Math.abs(reference[i+1]-wingless[i+1])+
          Math.abs(reference[i+2]-wingless[i+2]);
      }
      return score;
    };
    const wingRootScore=crossSection(0.36);
    const wingTipScore=crossSection(0.86);
    // No output outside the source photograph's protected face frame.
    let wingOutside=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++) {
      if(x>=65&&x<=230&&y>=62&&y<=185)continue;
      const i=(y*W+x)*4;
      if(reference[i]!==wingless[i] ||
        reference[i+1]!==wingless[i+1] ||
        reference[i+2]!==wingless[i+2]) wingOutside++;
    }
    // Compare actual rendered glints with recovery disabled and enabled.
    // The only difference comes from the customer's synthetic source pixel:
    // the shader is forbidden from generating made-up texture/highlights.
    const glintCases=[];
    for(const skin of [
      {name:"light",base:[184,151,139],glint:[233,217,206]},
      {name:"deep",base:[66,43,36],glint:[158,131,118]}
    ]) {
      const input=new Uint8Array(W*H*4);
      for(let i=0;i<W*H;i++) input.set([...skin.base,255],i*4);
      const gx=145,gy=125, off=(gy*W+gx)*4;
      input.set([...skin.glint,255],off);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D,textures[1]);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,W,H,0,
        gl.RGBA,gl.UNSIGNED_BYTE,input);
      gl.uniform1f(uniform("uHighlightRecovery"),0);
      const flat=draw(input,1);
      gl.uniform1f(uniform("uHighlightRecovery"),mat.highlightRecovery);
      const preserved=draw(input,1);
      let baselineDistance=0,recoveredDistance=0,changedOutside=0,clipped=0;
      for(let c=0;c<3;c++){
        baselineDistance+=Math.abs(flat[off+c]-input[off+c]);
        recoveredDistance+=Math.abs(preserved[off+c]-input[off+c]);
      }
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=(y*W+x)*4;
        if(x<65||x>230||y<62||y>185) {
          for(let c=0;c<4;c++)if(preserved[i+c]!==input[i+c])
            changedOutside++;
        }
        if(preserved[i]===0||preserved[i]===255||
           preserved[i+1]===0||preserved[i+1]===255||
           preserved[i+2]===0||preserved[i+2]===255)clipped++;
      }
      glintCases.push({name:skin.name,baselineDistance,
        recoveredDistance,changedOutside,clipped});
    }
    textures.forEach(v=>gl.deleteTexture(v));
    return {inkSamples,legacyDifference,cleanedDifference,protectedDifference,
      wingRootScore,wingTipScore,wingOutside,glintCases,highlightRecovery:mat.highlightRecovery,
      lashChanged,lashOutside,outerLashes,innerLashes,
      seamImproved,seamProtected,seamSclera,
      noCosmeticsDelta,nearBefore,nearAfter,farDelta};
  });
  test.skip(!!r.unavailable,"WebGL2 not available");
  expect(r.invalid).not.toBe(true);
  expect(r.inkSamples).toBeGreaterThan(5);
  expect(r.legacyDifference).toBeGreaterThan(100);
  expect(r.cleanedDifference).toBeLessThan(r.legacyDifference*0.75);
  expect(r.protectedDifference).toBe(0);
  expect(r.wingRootScore).toBeGreaterThan(30);
  expect(r.wingTipScore).toBeLessThan(r.wingRootScore * 0.8);
  expect(r.wingOutside).toBe(0);
  expect(r.lashChanged).toBeGreaterThan(10);
  expect(r.outerLashes).toBeGreaterThan(0);
  expect(r.innerLashes).toBeGreaterThan(0);
  expect(r.lashOutside).toBe(0);
  expect(r.seamImproved).toBeGreaterThan(15);
  expect(r.noCosmeticsDelta).toBe(0);
  expect(r.nearBefore).toBeGreaterThan(100);
  expect(r.nearAfter).toBeLessThan(r.nearBefore * 0.5);
  expect(r.farDelta).toBe(0);
  expect(r.seamProtected).toBe(0);
  expect(r.seamSclera).toBe(0);
  expect(r.highlightRecovery).toBeGreaterThan(0);
  expect(r.highlightRecovery).toBeLessThanOrEqual(0.45);
  expect(r.glintCases).toHaveLength(2);
  for(const sample of r.glintCases){
    expect(sample.baselineDistance, sample.name).toBeGreaterThan(5);
    expect(sample.recoveredDistance, sample.name)
      .toBeLessThan(sample.baselineDistance);
    expect(sample.changedOutside, sample.name).toBe(0);
    expect(sample.clipped, sample.name).toBe(0);
  }
});
