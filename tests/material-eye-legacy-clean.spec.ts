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
    const old=draw(ghost,0);
    const cleaned=draw(ghost,1);
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
    textures.forEach(v=>gl.deleteTexture(v));
    return {inkSamples,legacyDifference,cleanedDifference,protectedDifference};
  });
  test.skip(!!r.unavailable,"WebGL2 not available");
  expect(r.invalid).not.toBe(true);
  expect(r.inkSamples).toBeGreaterThan(5);
  expect(r.legacyDifference).toBeGreaterThan(100);
  expect(r.cleanedDifference).toBeLessThan(r.legacyDifference*0.75);
  expect(r.protectedDifference).toBe(0);
});
