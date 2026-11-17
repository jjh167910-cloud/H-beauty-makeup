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
        // The liner wing extends up to 0.22 eye widths beyond the outer corner.
        // Both bounding ranges include that expected geometry but never the
        // unrelated portrait background.
        const i=(y*W+x)*4, eyeX=(x>90&&x<290)||(x>310&&x<520);
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
      observations.push({depth,changed,protectedChanged,occludedChanged,clipped,
        topChanges,bottomChanges,inkChanged,inkOutside,scleraChanged,outsideCoordinates});
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
    expect(result.occludedChanged).toBe(0);
    expect(result.clipped).toBe(0);
    expect(result.topChanges).toBeGreaterThan(10);
    expect(result.topChanges).toBeGreaterThan(result.bottomChanges);
    expect(result.inkChanged).toBeGreaterThan(50);
    expect(result.inkOutside, JSON.stringify(result.outsideCoordinates)).toBe(0);
    expect(result.scleraChanged).toBe(0);
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
