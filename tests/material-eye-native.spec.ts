import { test, expect } from "playwright/test";

test("shader-native face-space eyes render in existing WebGL2 pixel coordinates with exact protected pixels", async ({ page }) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const { NATIVE_EYE_FS, nativeEyeMaterial } = await import("/src/lib/material-eye-native.ts");
    const W=640, H=320;
    const pts=Array.from({length:478},()=>[320,180,0]);
    const put=(ids:number[],xs:number[],ys:number[])=>ids.forEach((id,i)=>pts[id]=[xs[i],ys[i],0]);
    put([33,246,161,160,159,158,157,173,133],
      [130,146,160,177,195,215,232,245,260],[180,171,167,164,163,165,170,175,180]);
    put([70,63,105,66,107],[137,168,195,225,253],[118,112,106,110,121]);
    pts[145]=[195,194,0];
    put([263,466,388,387,386,385,384,398,362],
      [470,453,437,420,405,387,370,356,340],[180,171,167,164,163,165,170,175,180]);
    put([300,293,334,296,336],[466,436,405,375,346],[121,110,106,112,118]);
    pts[374]=[405,194,0];
    const material=nativeEyeMaterial(pts,"electric-blue","natural");
    if (!material) return {missing:true};
    const rgba=(depth:"light"|"deep")=>{
      const original=new Uint8Array(W*H*4), prior=new Uint8Array(W*H*4);
      const shade=depth==="light"?[187,149,131]:[72,47,39];
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=(y*W+x)*4;
        const grain=(x*11+y*13)%13-6;
        for(let c=0;c<3;c++){
          original[i+c]=shade[c]+grain; prior[i+c]=original[i+c];
        }
        original[i+3]=255;prior[i+3]=255;
      }
      return {original,prior};
    };
    const gl=document.createElement("canvas").getContext("webgl2",{preserveDrawingBuffer:true,premultipliedAlpha:false,antialias:false});
    if(!gl) return {skip:true};
    const vsrc="#version 300 es\nin vec2 aPos; void main(){gl_Position=vec4(aPos,0,1);}";
    const compile=(kind:number,src:string)=>{
      const sh=gl.createShader(kind)!;gl.shaderSource(sh,src);gl.compileShader(sh);
      if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh)||"compile");
      return sh;
    };
    const p=gl.createProgram()!;
    gl.attachShader(p,compile(gl.VERTEX_SHADER,vsrc));
    gl.attachShader(p,compile(gl.FRAGMENT_SHADER,NATIVE_EYE_FS));
    gl.bindAttribLocation(p,0,"aPos");gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||"link");
    const quad=gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER,quad);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const flip=(pixels:Uint8Array)=>{
      const out=new Uint8Array(pixels.length);
      for(let y=0;y<H;y++)
        out.set(pixels.subarray(y*W*4,(y+1)*W*4),(H-y-1)*W*4);
      return out;
    };
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    const texture=(data:Uint8Array,w:number,h:number,rg=false)=>{
      const t=gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,rg?gl.RG8:gl.RGBA8,w,h,0,rg?gl.RG:gl.RGBA,gl.UNSIGNED_BYTE,data);
      return t;
    };
    const vis=new Uint8Array(256*256*2);
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      // A small missing region of real face visibility in the first eyelid.
      const px=(x+0.5)*W/256, py=(y+0.5)*W/256;
      vis[(y*256+x)*2]=(px>=190&&px<=215&&py>=130&&py<=165)?0:255;
    }
    const observations=[];
    for(const depth of ["light","deep"] as const){
      const {original,prior}=rgba(depth);
      (gl.canvas as HTMLCanvasElement).width=W;
      (gl.canvas as HTMLCanvasElement).height=H;
      gl.viewport(0,0,W,H);
      gl.disable(gl.DITHER);gl.disable(gl.BLEND);
      gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,quad);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
      const textures=[texture(flip(prior),W,H),texture(original,W,H),texture(vis,256,256,true)];
      ["uPrevious","uOriginal","uVis"].forEach((name,i)=>{
        gl.activeTexture(gl.TEXTURE0+i);
        gl.bindTexture(gl.TEXTURE_2D,textures[i]);
        gl.uniform1i(gl.getUniformLocation(p,name),i);
      });
      gl.uniform2f(gl.getUniformLocation(p,"uSize"),W,H);
      gl.uniform3f(gl.getUniformLocation(p,"uVisBox"),0,0,W);
      gl.uniform1i(gl.getUniformLocation(p,"uVisOn"),1);
      gl.uniform2fv(gl.getUniformLocation(p,"uUpper"),material.upper);
      gl.uniform2fv(gl.getUniformLocation(p,"uBrows"),material.brows);
      gl.uniform4fv(gl.getUniformLocation(p,"uFrame"),material.frame);
      gl.uniform1fv(gl.getUniformLocation(p,"uSpan"),material.span);
      gl.uniform1iv(gl.getUniformLocation(p,"uEnabled"),material.enabled);
      gl.uniform3fv(gl.getUniformLocation(p,"uPigmentA"),material.pigmentA);
      gl.uniform3fv(gl.getUniformLocation(p,"uPigmentB"),material.pigmentB);
      gl.uniform1f(gl.getUniformLocation(p,"uAmount"),material.amount);
      gl.uniform1i(gl.getUniformLocation(p,"uMode"),material.mode);
      gl.uniform2fv(gl.getUniformLocation(p,"uLift"),material.lift);
      gl.uniform1fv(gl.getUniformLocation(p,"uOpening"),material.opening);
      gl.uniform3fv(gl.getUniformLocation(p,"uLinerColor"),material.linerColor);
      gl.uniform1f(gl.getUniformLocation(p,"uLinerWidth"),material.linerWidth);
      gl.uniform1f(gl.getUniformLocation(p,"uWingLength"),material.wingLength);
      gl.uniform1f(gl.getUniformLocation(p,"uLashLength"),material.lashLength);
      gl.uniform1i(gl.getUniformLocation(p,"uLashCount"),material.lashCount);
      gl.uniform1f(gl.getUniformLocation(p,"uInkSoft"),material.inkSoft);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const read=new Uint8Array(prior.length);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,read);
      const display=flip(read);
      // The production renderer's guided visibility map is RGBA
      // coefficients (a.rgb * (source.rgb - .5) + a.a), NOT a red
      // probability channel. Verify occluded LEFT eye preserves previous
      // pixels exactly while visible RIGHT eye retains actual native ink.
      const guided=new Uint8Array(256*256*4);
      for(let y=0;y<256;y++)for(let x=0;x<256;x++)
        guided[(y*256+x)*4+3]=x<128?0:255;
      const guidedTex=texture(guided,256,256);
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,guidedTex);
      const visibilityMode=gl.getUniformLocation(p,"uVisMode");
      gl.uniform1i(visibilityMode,2);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const guidedPixels=new Uint8Array(prior.length);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,guidedPixels);
      const guidedOutput=flip(guidedPixels);
      let guidedOccludedChanges=0,guidedVisibleChanges=0;
      for(let y=65;y<240;y++)for(let x=85;x<550;x++){
        const i=(y*W+x)*4;
        let diff=false;
        for(let ch=0;ch<4;ch++)if(guidedOutput[i+ch]!==prior[i+ch])diff=true;
        if(!diff)continue;
        if(x<300)guidedOccludedChanges++;
        if(x>335)guidedVisibleChanges++;
      }
      // The same RGBA data in coarse mode has an all-zero red channel.
      // If the shader incorrectly ignores uVisMode it will hide BOTH eyes.
      gl.uniform1i(visibilityMode,1);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const coarsePixels=new Uint8Array(prior.length);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,coarsePixels);
      let guidedCoarseChanges=0;
      const coarseOutput=flip(coarsePixels);
      for(let i=0;i<coarseOutput.length;i++)
        if(coarseOutput[i]!==prior[i])guidedCoarseChanges++;
      // A guided fit must respond to ORIGINAL camera RGB, not only A.a.
      // The same signed affine visibility fit yields exposed skin on the
      // light image, but correctly rejects the deep source in this
      // deliberate synthetic photometric edge case.
      const guidedCoefficients=new Uint8Array(256*256*4);
      for(let i=0;i<256*256;i++){
        guidedCoefficients[i*4]=255; // A.r = 1
        guidedCoefficients[i*4+3]=87; // b = 0.341
      }
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,guidedTex);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,256,gl.RGBA,
        gl.UNSIGNED_BYTE,guidedCoefficients);
      gl.uniform1i(visibilityMode,2);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const fittedPixels=new Uint8Array(prior.length);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,fittedPixels);
      const fittedOutput=flip(fittedPixels);
      let guidedSourceSensitiveChanges=0;
      for(let i=0;i<fittedOutput.length;i++)
        if(fittedOutput[i]!==prior[i])guidedSourceSensitiveChanges++;
      // Restore native RG8 visibility for all existing strict pixel tests.
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,textures[2]);
      gl.uniform1i(visibilityMode,1);
      gl.deleteTexture(guidedTex);
      // Real GPU raster: a barely-open eye must NOT suddenly receive full
      // long lashes at the near-closed aperture threshold. Isolate fiber
      // ink from shadow, eyeliner and wing, then vary only LEFT opening.
      gl.uniform1f(gl.getUniformLocation(p,"uAmount"),0);
      gl.uniform1f(gl.getUniformLocation(p,"uLinerWidth"),0);
      gl.uniform1f(gl.getUniformLocation(p,"uWingLength"),0);
      const openingLoc=gl.getUniformLocation(p,"uOpening");
      const lashRaster=(opening:number)=>{
        gl.uniform1fv(openingLoc,new Float32Array([opening,material.opening[1]]));
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        const raw=new Uint8Array(prior.length);
        gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,raw);
        return flip(raw);
      };
      const closedLashes=lashRaster(0.045);
      const almostClosedLashes=lashRaster(0.046);
      const openLashes=lashRaster(0.18);
      const leftInk=(data:Uint8Array)=>{
        let n=0;
        for(let y=70;y<220;y++)for(let x=85;x<300;x++){
          const i=(y*W+x)*4;
          if(Math.abs(data[i]-prior[i])>2 ||
             Math.abs(data[i+1]-prior[i+1])>2 ||
             Math.abs(data[i+2]-prior[i+2])>2)n++;
        }
        return n;
      };
      let otherEyeLashDrift=0;
      for(let y=65;y<230;y++)for(let x=335;x<530;x++){
        const i=(y*W+x)*4;
        for(let k=0;k<4;k++){
          if(closedLashes[i+k]!==openLashes[i+k] ||
             almostClosedLashes[i+k]!==openLashes[i+k])
            otherEyeLashDrift++;
        }
      }
      const closeEyeLashCount=leftInk(closedLashes);
      const nearlyClosedLashCount=leftInk(almostClosedLashes);
      const openEyeLashCount=leftInk(openLashes);
      // Hair/glasses can cover the root while leaving the drawn tip visible.
      // In that case an unattached black fiber/wing must not be invented.
      // Occlude the LEFT upper-lid curve in the existing RG visibility map,
      // leaving its upper eyelid/long lash tips and the RIGHT eye visible.
      const rootMask=vis.slice();
      let blockedRootTexels=0, unblockedTipTexels=0;
      for(let gy=0;gy<256;gy++)for(let gx=0;gx<256;gx++){
        const px=(gx+0.5)*W/256, py=(gy+0.5)*W/256;
        if(px<118||px>275||py<145||py>200)continue;
        let minDistance=1e9;
        for(let j=0;j<8;j++){
          const ax=material.upper[j*2], ay=material.upper[j*2+1];
          const bx=material.upper[(j+1)*2], by=material.upper[(j+1)*2+1];
          const dx=bx-ax,dy=by-ay;
          const t=Math.max(0,Math.min(1,
            ((px-ax)*dx+(py-ay)*dy)/Math.max(dx*dx+dy*dy,1e-6)));
          minDistance=Math.min(minDistance,
            Math.hypot(px-(ax+t*dx),py-(ay+t*dy)));
        }
        if(minDistance<7){
          rootMask[(gy*256+gx)*2]=0;
          blockedRootTexels++;
        }else if(minDistance>13 && py<165){
          unblockedTipTexels++;
        }
      }
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D,textures[2]);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,256,
        gl.RG,gl.UNSIGNED_BYTE,rootMask);
      const concealedRootLashes=lashRaster(0.18);
      const detachedFiberPixels=leftInk(concealedRootLashes);
      // Prove that the visibility ribbon leaves actual previously painted
      // lash TIPS exposed: otherwise even a broken no-root-gate shader
      // could satisfy the zero-detached-pixel assertion accidentally.
      let exposedLashTips=0;
      for(let y=70;y<220;y++)for(let x=85;x<300;x++){
        const gx=Math.min(255,Math.floor(x*256/W));
        const gy=Math.min(255,Math.floor(y*256/W));
        if(rootMask[(gy*256+gx)*2]===0)continue;
        const at=(y*W+x)*4;
        if(Math.abs(openLashes[at]-prior[at])>2 ||
           Math.abs(openLashes[at+1]-prior[at+1])>2 ||
           Math.abs(openLashes[at+2]-prior[at+2])>2)exposedLashTips++;
      }
      // Repeat in the production guided RGBA coefficient representation
      // (alpha-only constant fit). The root check must work in both modes.
      const guidedRootData=new Uint8Array(256*256*4);
      for(let i=0;i<256*256;i++)
        guidedRootData[i*4+3]=rootMask[i*2];
      const guidedRootTex=texture(guidedRootData,256,256);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D,guidedRootTex);
      gl.uniform1i(visibilityMode,2);
      const guidedConcealedLashes=lashRaster(0.18);
      const guidedDetachedFiberPixels=leftInk(guidedConcealedLashes);
      gl.uniform1i(visibilityMode,1);
      gl.bindTexture(gl.TEXTURE_2D,textures[2]);
      gl.deleteTexture(guidedRootTex);
      // Partly visible roots must yield partly visible native lashes,
      // not pop abruptly to full opacity. Keep originally hidden areas
      // hidden and only attenuate the newly covered left-lid roots.
      const partialRootMask=vis.slice();
      for(let i=0;i<partialRootMask.length;i+=2)
        if(vis[i]>0 && rootMask[i]===0) partialRootMask[i]=148;
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,256,
        gl.RG,gl.UNSIGNED_BYTE,partialRootMask);
      const partialRootLashes=lashRaster(0.18);
      const leftFiberEnergy=(data:Uint8Array)=>{
        let energy=0;
        for(let y=70;y<220;y++)for(let x=85;x<300;x++){
          const at=(y*W+x)*4;
          for(let ch=0;ch<3;ch++)
            energy+=Math.abs(data[at+ch]-prior[at+ch]);
        }
        return energy;
      };
      const openRootEnergy=leftFiberEnergy(openLashes);
      const partialRootEnergy=leftFiberEnergy(partialRootLashes);
      // Wing test still uses a fully hidden root, not partial visibility.
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,256,
        gl.RG,gl.UNSIGNED_BYTE,rootMask);
      let otherEyeRootMaskDrift=0;
      for(let y=65;y<230;y++)for(let x=335;x<530;x++){
        const i=(y*W+x)*4;
        for(let ch=0;ch<4;ch++)
          if(concealedRootLashes[i+ch]!==openLashes[i+ch])
            otherEyeRootMaskDrift++;
      }
      // Isolate the wing from a fully active ordinary liner. With its
      // anatomical root covered, toggling wing must change no pixels.
      const linerLoc=gl.getUniformLocation(p,"uLinerWidth");
      const wingLoc=gl.getUniformLocation(p,"uWingLength");
      const lashLoc=gl.getUniformLocation(p,"uLashLength");
      const raster=()=>{
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        const raw=new Uint8Array(prior.length);
        gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,raw);
        return flip(raw);
      };
      gl.uniform1f(lashLoc,0);
      gl.uniform1f(linerLoc,material.linerWidth);
      gl.uniform1f(wingLoc,0);
      const maskedWingless=raster();
      gl.uniform1f(wingLoc,material.wingLength);
      const maskedWing=raster();
      let detachedWingDifferences=0, otherEyeWingDifferences=0;
      // Only LEFT wing's root is hidden. The visible RIGHT wing must
      // continue drawing, and must not be counted as a regression.
      for(let y=65;y<230;y++)for(let x=85;x<550;x++){
        const i=(y*W+x)*4;
        let changed=false;
        for(let ch=0;ch<4;ch++)
          if(maskedWing[i+ch]!==maskedWingless[i+ch])changed=true;
        if(!changed)continue;
        if(x<300)detachedWingDifferences++;
        if(x>335)otherEyeWingDifferences++;
      }
      // Restore the original segmentation and full native material.
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,256,
        gl.RG,gl.UNSIGNED_BYTE,vis);
      gl.uniform1f(lashLoc,material.lashLength);
      // Restore the complete material before all existing raster checks.
      gl.uniform1fv(openingLoc,material.opening);
      gl.uniform1f(gl.getUniformLocation(p,"uAmount"),material.amount);
      gl.uniform1f(gl.getUniformLocation(p,"uLinerWidth"),material.linerWidth);
      gl.uniform1f(gl.getUniformLocation(p,"uWingLength"),material.wingLength);
      // Entirely occluded faces must emit the previous framebuffer exactly.
      // This now exercises the preflight visibility fast-path before native
      // lash loops and five-point photometry (RGB and alpha byte equality).
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D,textures[2]);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,256,
        gl.RG,gl.UNSIGNED_BYTE,new Uint8Array(vis.length));
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const hiddenRead=new Uint8Array(prior.length);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,hiddenRead);
      const hiddenPixels=flip(hiddenRead);
      let fullyHiddenDifferences=0;
      for(let k=0;k<prior.length;k++)
        if(hiddenPixels[k]!==prior[k])fullyHiddenDifferences++;
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,256,
        gl.RG,gl.UNSIGNED_BYTE,vis);
      // Independently vary the RIGHT eye's source-light reference texel.
      // Under asymmetric studio lighting, the LEFT eye must not change:
      // cosmetic pigment should reference its OWN eye, not whichever
      // enabled eye happens to execute last in the shader loop.
      const rightUpperIdx=(1*9+4)*2, rightBrowIdx=(1*5+2)*2;
      const refX=Math.floor(material.upper[rightUpperIdx]*0.76+
        material.brows[rightBrowIdx]*0.24);
      const refY=Math.floor(material.upper[rightUpperIdx+1]*0.76+
        material.brows[rightBrowIdx+1]*0.24);
      const refOff=(refY*W+refX)*4;
      const referenceOriginal=new Uint8Array(original.subarray(refOff,refOff+4));
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D,textures[1]);
      gl.texSubImage2D(gl.TEXTURE_2D,0,refX,refY,1,1,gl.RGBA,
        gl.UNSIGNED_BYTE,new Uint8Array([242,238,233,255]));
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const otherEyeRead=new Uint8Array(prior.length);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,otherEyeRead);
      const otherEyeBrightened=flip(otherEyeRead);
      // Restore exact original source before other raster regressions.
      gl.texSubImage2D(gl.TEXTURE_2D,0,refX,refY,1,1,gl.RGBA,
        gl.UNSIGNED_BYTE,referenceOriginal);
      let leftEyeCrossTalk=0, leftEyePainted=0;
      for(let y=125;y<=163;y++)for(let x=155;x<=247;x++){
        const offset=(y*W+x)*4;
        for(let c=0;c<3;c++){
          if(display[offset+c]!==prior[offset+c])leftEyePainted++;
          if(display[offset+c]!==otherEyeBrightened[offset+c])leftEyeCrossTalk++;
        }
      }
      // Corrupt exactly one skin-light reference in THIS eye with an
      // extreme highlight and a dark occluder. Only the immediately local
      // 3x3 source microtexture footprint may change. A single original
      // lighting texel must no longer recolor the entire painted eyelid.
      const leftUpperIdx=4*2, leftBrowIdx=2*2;
      const leftRefX=Math.floor(material.upper[leftUpperIdx]*0.76+
        material.brows[leftBrowIdx]*0.24);
      const leftRefY=Math.floor(material.upper[leftUpperIdx+1]*0.76+
        material.brows[leftBrowIdx+1]*0.24);
      const leftRefOff=(leftRefY*W+leftRefX)*4;
      const savedLeftRef=new Uint8Array(original.subarray(leftRefOff,leftRefOff+4));
      let lightProbeMax=0, lightProbeMean=0;
      for(const shade of [3,250]){
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D,textures[1]);
        gl.texSubImage2D(gl.TEXTURE_2D,0,leftRefX,leftRefY,1,1,
          gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([shade,shade,shade,255]));
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        const probeRead=new Uint8Array(prior.length);
        gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,probeRead);
        const probed=flip(probeRead);
        let totalDelta=0, compared=0;
        for(let y=128;y<=160;y++)for(let x=151;x<=250;x++){
          if(Math.abs(x-leftRefX)<=2 && Math.abs(y-leftRefY)<=2) continue;
          const i=(y*W+x)*4;
          for(let c=0;c<3;c++){
            const delta=Math.abs(display[i+c]-probed[i+c]);
            totalDelta+=delta; compared++;
            lightProbeMax=Math.max(lightProbeMax,delta);
          }
        }
        lightProbeMean=Math.max(lightProbeMean,totalDelta/compared);
      }
      gl.texSubImage2D(gl.TEXTURE_2D,0,leftRefX,leftRefY,1,1,
        gl.RGBA,gl.UNSIGNED_BYTE,savedLeftRef);
      // A true broad left-side lighting change across ALL independent
      // references should still modify the left pigment meaningfully.
      // This blocks an incorrect "fix" that simply ignores photo lighting.
      // The RIGHT eye must still be bitwise independent of left shading.
      const leftSites:[[number,number],[number,number],[number,number],[number,number],[number,number]]=[
        [0.33,0.24],[0.50,0.16],[0.50,0.24],[0.50,0.32],[0.67,0.24]
      ];
      const savedSites=leftSites.map(([t,v])=>{
        const upperT=t*8, ui=Math.min(7,Math.floor(upperT));
        const upX=material.upper[ui*2]*(1-(upperT-ui))+
          material.upper[(ui+1)*2]*(upperT-ui);
        const upY=material.upper[ui*2+1]*(1-(upperT-ui))+
          material.upper[(ui+1)*2+1]*(upperT-ui);
        const browT=t*4, bi=Math.min(3,Math.floor(browT));
        const browX=material.brows[bi*2]*(1-(browT-bi))+
          material.brows[(bi+1)*2]*(browT-bi);
        const browY=material.brows[bi*2+1]*(1-(browT-bi))+
          material.brows[(bi+1)*2+1]*(browT-bi);
        const x=Math.floor(upX*(1-v)+browX*v);
        const y=Math.floor(upY*(1-v)+browY*v);
        return {x,y,px:new Uint8Array(original.subarray((y*W+x)*4,(y*W+x)*4+4))};
      });
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D,textures[1]);
      for(const site of savedSites)
        gl.texSubImage2D(gl.TEXTURE_2D,0,site.x,site.y,1,1,
          gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([244,242,240,255]));
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const coherentPixels=new Uint8Array(prior.length);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,coherentPixels);
      const coherent=flip(coherentPixels);
      let trueLightResponse=0, otherEyeCoherentChange=0;
      for(let y=128;y<=160;y++)for(let x=155;x<=247;x++){
        const i=(y*W+x)*4;
        for(let c=0;c<3;c++)
          if(Math.abs(display[i+c]-coherent[i+c])>2)trueLightResponse++;
      }
      for(let y=128;y<=160;y++)for(let x=370;x<=450;x++){
        const i=(y*W+x)*4;
        for(let c=0;c<3;c++)
          if(display[i+c]!==coherent[i+c])otherEyeCoherentChange++;
      }
      for(const site of savedSites)
        gl.texSubImage2D(gl.TEXTURE_2D,0,site.x,site.y,1,1,
          gl.RGBA,gl.UNSIGNED_BYTE,site.px);
      // Occluded lighting references: hair/glasses cannot contaminate
      // source-colour adaptation, and no new pigment is allowed when all
      // of one eye's five reference sites are hidden.
      const fullVisible=new Uint8Array(vis.length);
      for(let k=0;k<fullVisible.length;k+=2)fullVisible[k]=255;
      const occludeSites=(sites:typeof savedSites)=>{
        const hidden=fullVisible.slice();
        for(const site of sites){
          const cx=Math.floor(site.x*256/W),cy=Math.floor(site.y*256/W);
          for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
            const x=cx+dx,y=cy+dy;
            if(x>=0&&y>=0&&x<256&&y<256)hidden[(y*256+x)*2]=0;
          }
        }
        return hidden;
      };
      const visTexture=textures[2];
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D,visTexture);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,256,gl.RG,
        gl.UNSIGNED_BYTE,occludeSites([savedSites[0]]));
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const excludedRead=new Uint8Array(prior.length);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,excludedRead);
      const excluded=flip(excludedRead);
      const discarded=savedSites[0];
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D,textures[1]);
      gl.texSubImage2D(gl.TEXTURE_2D,0,discarded.x,discarded.y,1,1,
        gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,252,250,255]));
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const excludedCorruptRead=new Uint8Array(prior.length);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,excludedCorruptRead);
      const excludedCorrupt=flip(excludedCorruptRead);
      let hiddenSampleInfluence=0, visiblePigmentSamples=0;
      for(let y=136;y<=156;y++)for(let x=216;x<=247;x++){
        const at=(y*W+x)*4;
        for(let c=0;c<3;c++){
          if(excluded[at+c]!==excludedCorrupt[at+c])hiddenSampleInfluence++;
          if(excluded[at+c]!==prior[at+c])visiblePigmentSamples++;
        }
      }
      gl.texSubImage2D(gl.TEXTURE_2D,0,discarded.x,discarded.y,1,1,
        gl.RGBA,gl.UNSIGNED_BYTE,discarded.px);
      // Only the left eye is enabled. All five sampled skin sites are
      // hidden, while the eyelid itself remains visible: no reliable
      // pigment illumination exists, so this must be an exact no-op.
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D,visTexture);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,256,gl.RG,
        gl.UNSIGNED_BYTE,occludeSites(savedSites));
      gl.uniform1iv(gl.getUniformLocation(p,"uEnabled"),new Int32Array([1,0]));
      for(const uniform of ["uLinerWidth","uWingLength","uLashLength",
        "uShimmer","uRhinestones"])
        gl.uniform1f(gl.getUniformLocation(p,uniform),0);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const noReferenceRead=new Uint8Array(prior.length);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,noReferenceRead);
      const noReference=flip(noReferenceRead);
      let missingReferenceDifferences=0;
      for(let k=0;k<prior.length;k++)
        if(noReference[k]!==prior[k])missingReferenceDifferences++;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D,visTexture);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,256,gl.RG,
        gl.UNSIGNED_BYTE,vis);
      gl.uniform1iv(gl.getUniformLocation(p,"uEnabled"),material.enabled);
      gl.uniform1f(gl.getUniformLocation(p,"uLinerWidth"),material.linerWidth);
      gl.uniform1f(gl.getUniformLocation(p,"uWingLength"),material.wingLength);
      gl.uniform1f(gl.getUniformLocation(p,"uLashLength"),material.lashLength);
      // Shader's original shimmer/gem values were zero in this raster test.
      gl.uniform1f(gl.getUniformLocation(p,"uShimmer"),0);
      gl.uniform1f(gl.getUniformLocation(p,"uRhinestones"),0);
      // A camera photo can contain a dark hair or bright glasses glint
      // immediately next to visible skin. Four immediate source neighbours
      // are altered, but the CENTER still belongs to the customer.
      // Eye shading at that center must not acquire an artificial halo.
      // Baseline photo details elsewhere and all other passes stay intact.
      const edgeCenter:[number,number]=[230,146];
      const edgeNeighbours:Array<[number,number]>=[
        [229,146],[231,146],[230,145],[230,147]
      ];
      let edgeHaloMax=0,edgeCenterPainted=0;
      const edgeAt=(edgeCenter[1]*W+edgeCenter[0])*4;
      for(let c=0;c<3;c++)
        if(Math.abs(display[edgeAt+c]-prior[edgeAt+c])>2)
          edgeCenterPainted++;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D,textures[1]);
      for(const shade of [2,253]){
        for(const [x,y] of edgeNeighbours)
          gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,1,1,gl.RGBA,
            gl.UNSIGNED_BYTE,new Uint8Array([shade,shade,shade,255]));
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        const edgeRead=new Uint8Array(prior.length);
        gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,edgeRead);
        const edgeOut=flip(edgeRead);
        for(let c=0;c<4;c++)
          edgeHaloMax=Math.max(edgeHaloMax,
            Math.abs(edgeOut[edgeAt+c]-display[edgeAt+c]));
      }
      for(const [x,y] of edgeNeighbours) {
        const i=(y*W+x)*4;
        gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,1,1,gl.RGBA,
          gl.UNSIGNED_BYTE,original.subarray(i,i+4));
      }
      // Isolate the native eyeliner and lashes from eyeshadow: the raster must
      // change when fibers are enabled, even on deep skin, without source-face pixels.
      gl.uniform1f(gl.getUniformLocation(p,"uLinerWidth"),0);
      gl.uniform1f(gl.getUniformLocation(p,"uWingLength"),0);
      gl.uniform1f(gl.getUniformLocation(p,"uLashLength"),0);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const noInkRead=new Uint8Array(prior.length);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,noInkRead);
      const noInk=flip(noInkRead);
      let inkChanged=0, inkOutside=0, scleraChanged=0;
      const outsideCoordinates:Array<[number,number]> = [];
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        // Electric Blue's "graphic" wing extends 0.30 eye spans beyond the
        // left outer corner: 130-(0.30*130)=91 px, plus its 2-3px
        // anti-aliased width. Pixels x=89..90 are intentional ink.
        // The separate protectedChanged assertion guards x<85 / x>550.
        const i=(y*W+x)*4, eyeX=(x>=85&&x<290)||(x>310&&x<520);
        let different=false;
        for(let c=0;c<3;c++) if(Math.abs(display[i+c]-noInk[i+c])>2)different=true;
        if(!different)continue;
        inkChanged++;
        if(!eyeX||y<55||y>235){
          inkOutside++;
          if(outsideCoordinates.length<32)outsideCoordinates.push([x,y]);
        }
        if((x>=190&&x<=200&&y>=189&&y<=201)||
           (x>=400&&x<=410&&y>=189&&y<=201)) scleraChanged++;
      }
      let changed=0, protectedChanged=0, occludedChanged=0, clipped=0, topChanges=0, bottomChanges=0;
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=(y*W+x)*4;
        const outside=(x<85||x>550||y<60||y>240);
        const hidden=(x>=194&&x<=209&&y>=135&&y<=155);
        let altered=false;
        for(let c=0;c<4;c++){
          if(display[i+c]!==prior[i+c])altered=true;
          if(display[i+c]!==prior[i+c]&&outside)protectedChanged++;
          if(display[i+c]!==prior[i+c]&&hidden)occludedChanged++;
          if(c<3&&display[i+c]!==prior[i+c]&&(display[i+c]===0||display[i+c]===255))clipped++;
        }
        if(altered){changed++;if(y<160)topChanges++;else bottomChanges++;}
      }
      // The native pigment cannot obliterate the original high-frequency
      // skin pattern. Probe a clear section of the lid away from wing, iris
      // and the intentionally occluded visibility fixture.
      let originalDetail = 0, paintedDetail = 0, detailSamples = 0;
      for (let y = 141; y <= 151; y++) for (let x = 225; x <= 240; x++) {
        const i = (y * W + x) * 4;
        const j = (y * W + x - 1) * 4;
        originalDetail += Math.abs(original[i] - original[j]);
        paintedDetail += Math.abs(display[i] - display[j]);
        detailSamples++;
      }
      observations.push({depth,fullyHiddenDifferences,changed,protectedChanged,occludedChanged,clipped,
        topChanges,bottomChanges,inkChanged,inkOutside,scleraChanged,outsideCoordinates,
        detailSamples, textureRetention: paintedDetail / Math.max(1, originalDetail),
        leftEyeCrossTalk, leftEyePainted, lightProbeMax, lightProbeMean,
        trueLightResponse, otherEyeCoherentChange,
        hiddenSampleInfluence,visiblePigmentSamples,missingReferenceDifferences,
        edgeHaloMax,edgeCenterPainted,
        guidedOccludedChanges,guidedVisibleChanges,guidedCoarseChanges,
        guidedSourceSensitiveChanges,closeEyeLashCount,
        nearlyClosedLashCount,openEyeLashCount,otherEyeLashDrift,
        blockedRootTexels,unblockedTipTexels,detachedFiberPixels,
        detachedWingDifferences,otherEyeWingDifferences,
        otherEyeRootMaskDrift,openRootEnergy,partialRootEnergy,exposedLashTips,
        guidedDetachedFiberPixels});
      textures.forEach(t=>gl.deleteTexture(t));
    }
    return {observations,enabled:[...material.enabled]};
  });
  test.skip(!!results.skip,"WebGL2 not available");
  expect(results.missing).not.toBe(true);
  expect(results.enabled).toEqual([1,1]);
  expect(results.observations).toHaveLength(2);
  for (const result of results.observations) {
    expect(result.changed).toBeGreaterThan(100);
    expect(result.protectedChanged).toBe(0);
    expect(result.fullyHiddenDifferences).toBe(0);
    expect(result.occludedChanged).toBe(0);
    expect(result.clipped).toBe(0);
    expect(result.topChanges).toBeGreaterThan(10);
    expect(result.topChanges).toBeGreaterThan(result.bottomChanges);
    expect(result.inkChanged).toBeGreaterThan(50);
    expect(result.inkOutside, JSON.stringify(result.outsideCoordinates)).toBe(0);
    expect(result.scleraChanged).toBe(0);
    expect(result.detailSamples).toBeGreaterThan(150);
    // All detail must derive from the original image. Retain natural pores
    // after pigmentation rather than returning a synthetic flat wash.
    expect(result.textureRetention).toBeGreaterThan(0.35);
    expect(result.textureRetention).toBeLessThan(1.8);
    expect(result.leftEyePainted).toBeGreaterThan(100);
    expect(result.leftEyeCrossTalk).toBe(0);
    expect(result.lightProbeMax).toBeLessThanOrEqual(12);
    expect(result.lightProbeMean).toBeLessThan(2.5);
    expect(result.trueLightResponse).toBeGreaterThan(100);
    expect(result.otherEyeCoherentChange).toBe(0);
    expect(result.visiblePigmentSamples).toBeGreaterThan(40);
    expect(result.hiddenSampleInfluence).toBe(0);
    expect(result.missingReferenceDifferences).toBe(0);
    expect(result.edgeCenterPainted).toBeGreaterThan(0);
    expect(result.edgeHaloMax).toBeLessThanOrEqual(2);
    expect(result.guidedOccludedChanges).toBe(0);
    expect(result.guidedVisibleChanges).toBeGreaterThan(100);
    expect(result.guidedCoarseChanges).toBe(0);
    expect(result.closeEyeLashCount).toBe(0);
    expect(result.openEyeLashCount).toBeGreaterThan(20);
    expect(result.nearlyClosedLashCount).toBeLessThan(result.openEyeLashCount * 0.20);
    expect(result.otherEyeLashDrift).toBe(0);
    expect(result.blockedRootTexels).toBeGreaterThan(30);
    expect(result.unblockedTipTexels).toBeGreaterThan(20);
    expect(result.exposedLashTips).toBeGreaterThan(10);
    expect(result.detachedFiberPixels).toBe(0);
    expect(result.guidedDetachedFiberPixels).toBe(0);
    expect(result.detachedWingDifferences).toBe(0);
    expect(result.otherEyeWingDifferences).toBeGreaterThan(5);
    expect(result.openRootEnergy).toBeGreaterThan(100);
    expect(result.partialRootEnergy).toBeGreaterThan(0);
    expect(result.partialRootEnergy).toBeLessThan(result.openRootEnergy);
    expect(result.otherEyeRootMaskDrift).toBe(0);
    if(result.depth==="light")
      expect(result.guidedSourceSensitiveChanges).toBeGreaterThan(100);
    else
      expect(result.guidedSourceSensitiveChanges).toBe(0);
  }
});

test("native face-space pilot fails closed for degenerate geometry and no-makeup control", async ({ page }) => {
  await page.goto("/");
  const result=await page.evaluate(async()=>{
    const { nativeEyeMaterial }=await import("/src/lib/material-eye-native.ts");
    const malformed=Array.from({length:478},()=>[160,140,0]);
    return {
      noMakeup:nativeEyeMaterial(malformed,"no-makeup","natural"),
      malformed:nativeEyeMaterial(malformed,"electric-blue","natural"),
      empty:nativeEyeMaterial([],"hollywood","bold"),
    };
  });
  expect(result.noMakeup).toBeNull();
  expect(result.malformed).toBeNull();
  expect(result.empty).toBeNull();
});


test("native lash geometry disables a collapsed far eye and closed-eye strands", async ({ page }) => {
  await page.goto("/");
  const checks = await page.evaluate(async () => {
    const { nativeEyeMaterial } = await import("/src/lib/material-eye-native.ts");
    const P = Array.from({ length: 478 }, () => [300, 155, 0]);
    const left = [33, 246, 161, 160, 159, 158, 157, 173, 133];
    left.forEach((id,i) => P[id] = [130 + 17*i, 165 - 13*Math.sin(i*Math.PI/8), 0]);
    [70, 63, 105, 66, 107].forEach((id,i) => P[id] = [135 + 34*i, 99, 0]);
    P[145] = [198, 183, 0];
    const right = [263, 466, 388, 387, 386, 385, 384, 398, 362];
    right.forEach((id,i) => P[id] = [402 - 4*i, 165 - 3*Math.sin(i*Math.PI/8), 0]);
    [300, 293, 334, 296, 336].forEach((id,i) => P[id] = [401 - 8*i, 143, 0]);
    P[374] = [386, 172, 0];
    const opened = nativeEyeMaterial(P, "hollywood", "natural");
    P[145] = P[159].slice();
    const closed = nativeEyeMaterial(P, "hollywood", "natural");
    return {
      enabled: opened ? [...opened.enabled] : null,
      opening: opened ? [...opened.opening] : null,
      closedOpening: closed?.opening[0] ?? -1,
      closedEnabled: closed?.enabled[0] ?? 0,
      linerWidth: opened?.linerWidth ?? 0,
      wingLength: opened?.wingLength ?? 0,
      lashLength: opened?.lashLength ?? 0,
      lashCount: opened?.lashCount ?? 0,
    };
  });
  expect(checks.enabled).toEqual([1,0]);
  expect(checks.opening![0]).toBeGreaterThan(0.045);
  expect(checks.closedOpening).toBe(0);
  expect(checks.closedEnabled).toBe(1);
  expect(checks.linerWidth).toBeGreaterThan(0);
  expect(checks.wingLength).toBeGreaterThan(0);
  expect(checks.lashLength).toBeGreaterThan(0.1);
  expect(checks.lashCount).toBeGreaterThanOrEqual(20);
});


test("vertical native-eye culling has byte-identical shader output for all three material looks", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { NATIVE_EYE_FS, nativeEyeMaterial } =
      await import("/src/lib/material-eye-native.ts");
    const guard = "if(v<=-0.035 || v>=0.74) continue;";
    if (NATIVE_EYE_FS.split(guard).length !== 2)
      throw Error("Expected exactly one conservative v-axis cull guard");
    const referenceShader=NATIVE_EYE_FS.replace(guard,"if(false) continue;");
    const W=320,H=240;
    const P=Array.from({length:478},()=>[0,0,0]);
    const upper=[33,246,161,160,159,158,157,173,133];
    const brow=[70,63,105,66,107];
    upper.forEach((id,i)=>P[id]=[105+10*i,145-10*Math.sin(i*Math.PI/8),0]);
    brow.forEach((id,i)=>P[id]=[107+19*i,95+3*Math.abs(i-2),0]);
    P[145]=[145,163,0];
    const gl=document.createElement("canvas").getContext("webgl2",
      {preserveDrawingBuffer:true,antialias:false,premultipliedAlpha:false});
    if(!gl) return {unavailable:true};
    gl.canvas.width=W;gl.canvas.height=H;gl.viewport(0,0,W,H);
    gl.disable(gl.DITHER);gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    const vertex="#version 300 es\nin vec2 aPos;void main(){gl_Position=vec4(aPos,0,1);}";
    const shader=(type:number,source:string)=>{
      const sh=gl.createShader(type)!;
      gl.shaderSource(sh,source);gl.compileShader(sh);
      if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(sh)||"shader compilation");
      return sh;
    };
    const program=(frag:string)=>{
      const pr=gl.createProgram()!;
      gl.attachShader(pr,shader(gl.VERTEX_SHADER,vertex));
      gl.attachShader(pr,shader(gl.FRAGMENT_SHADER,frag));
      gl.bindAttribLocation(pr,0,"aPos");gl.linkProgram(pr);
      if(!gl.getProgramParameter(pr,gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(pr)||"shader link");
      return pr;
    };
    const legacy=program(referenceShader),optimized=program(NATIVE_EYE_FS);
    const quad=gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER,quad);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    const flip=(pixels:Uint8Array)=>{
      const out=new Uint8Array(pixels.length);
      for(let y=0;y<H;y++)
        out.set(pixels.subarray(y*W*4,(y+1)*W*4),(H-1-y)*W*4);
      return out;
    };
    const original=new Uint8Array(W*H*4),previous=new Uint8Array(W*H*4);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const off=(y*W+x)*4,grain=(x*11+y*7)%9-4;
      original.set([158+grain,117+grain,103+grain,255],off);
      previous.set(x>73&&x<145&&y>108&&y<146
        ? [229,31,169,255] : [158+grain,117+grain,103+grain,255],off);
    }
    const mask=new Uint8Array(256*256*2);
    for(let i=0;i<mask.length;i+=2)mask[i]=255;
    const upload=(data:Uint8Array,w:number,h:number,rg=false)=>{
      const t=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,rg?gl.RG8:gl.RGBA8,w,h,0,
        rg?gl.RG:gl.RGBA,gl.UNSIGNED_BYTE,data);
      return t;
    };
    const textures=[
      upload(flip(previous),W,H),
      upload(original,W,H),
      upload(mask,256,256,true),
    ];
    for(let i=0;i<textures.length;i++){
      gl.activeTexture(gl.TEXTURE0+i);
      gl.bindTexture(gl.TEXTURE_2D,textures[i]);
    }
    const render=(pr:WebGLProgram,mat:NonNullable<ReturnType<typeof nativeEyeMaterial>>)=>{
      gl.useProgram(pr);
      const u=(s:string)=>gl.getUniformLocation(pr,s);
      for(const [i,name] of ["uPrevious","uOriginal","uVis"].entries())
        gl.uniform1i(u(name),i);
      gl.uniform2f(u("uSize"),W,H);
      gl.uniform3f(u("uVisBox"),0,0,W);
      gl.uniform1i(u("uVisOn"),1);
      gl.uniform2fv(u("uUpper"),mat.upper);
      gl.uniform2fv(u("uBrows"),mat.brows);
      gl.uniform4fv(u("uFrame"),mat.frame);
      gl.uniform1fv(u("uSpan"),mat.span);
      gl.uniform1iv(u("uEnabled"),mat.enabled);
      gl.uniform3fv(u("uPigmentA"),mat.pigmentA);
      gl.uniform3fv(u("uPigmentB"),mat.pigmentB);
      gl.uniform1f(u("uAmount"),mat.amount);
      gl.uniform1i(u("uMode"),mat.mode);
      gl.uniform2fv(u("uLift"),mat.lift);
      gl.uniform1fv(u("uOpening"),mat.opening);
      gl.uniform3fv(u("uLinerColor"),mat.linerColor);
      gl.uniform1f(u("uLinerWidth"),mat.linerWidth);
      gl.uniform1f(u("uWingLength"),mat.wingLength);
      gl.uniform1f(u("uLashLength"),mat.lashLength);
      gl.uniform1i(u("uLashCount"),mat.lashCount);
      gl.uniform1f(u("uInkSoft"),mat.inkSoft);
      gl.uniform1f(u("uHighlightRecovery"),mat.highlightRecovery);
      gl.uniform1i(u("uCleanLegacy"),1);
      gl.uniform1f(u("uShimmer"),mat.shimmer);
      gl.uniform1f(u("uRhinestones"),mat.rhinestones);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const read=new Uint8Array(previous.length);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,read);
      return flip(read);
    };
    const checks=[];
    for(const look of ["hollywood","electric-blue","rhinestone"] as const){
      const mat=nativeEyeMaterial(P,look,"natural");
      if(!mat||mat.enabled[0]!==1)throw Error("Invalid pilot geometry: "+look);
      const before=render(legacy,mat),after=render(optimized,mat);
      let changed=0,diff=0,maxDelta=0;
      for(let i=0;i<before.length;i++){
        if(before[i]!==previous[i])changed++;
        const delta=Math.abs(before[i]-after[i]);
        if(delta){diff++;maxDelta=Math.max(maxDelta,delta);}
      }
      checks.push({look,changed,diff,maxDelta});
    }
    textures.forEach(t=>gl.deleteTexture(t));
    gl.deleteProgram(legacy);gl.deleteProgram(optimized);
    return {checks};
  });
  test.skip(!!result.unavailable,"WebGL2 unavailable");
  expect(result.checks).toHaveLength(3);
  for(const item of result.checks){
    expect(item.changed,item.look).toBeGreaterThan(30);
    expect(item.diff,item.look).toBe(0);
    expect(item.maxDelta,item.look).toBe(0);
  }
});
