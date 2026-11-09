let manifestPromise;
async function getManifest(env){
 if(!manifestPromise)manifestPromise=(async()=>{
   const response=await env.ASSETS.fetch("https://assets.local/_hbeauty_chunks/manifest.json");
   if(!response.ok)throw Error("Large-asset manifest unavailable");
   const data=await response.json();
   if(data.schema!==1 || !data.files)throw Error("Invalid large-asset manifest");
   return data.files;
 })();
 return manifestPromise;
}
function mimeFor(path){
 if(path.endsWith(".wasm"))return "application/wasm";
 if(path.endsWith(".js")||path.endsWith(".mjs"))return "text/javascript; charset=utf-8";
 return "application/octet-stream";
}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(!["GET","HEAD"].includes(request.method))return env.ASSETS.fetch(request);
  const manifest=await getManifest(env);
  const entry=manifest[path];
  if(!entry)return env.ASSETS.fetch(request);
  const headers=new Headers({
    "Content-Type":mimeFor(path),
    "Content-Length":String(entry.bytes),
    "Cache-Control":"public, max-age=3600",
    "X-Content-Type-Options":"nosniff"
  });
  if(request.method==="HEAD")return new Response(null,{status:200,headers});
  const stream=new ReadableStream({
    start(controller){
      (async()=>{
        let count=0;
        for(const part of entry.parts){
          const url=new URL(part.path,request.url);
          const response=await env.ASSETS.fetch(url.toString());
          if(!response.ok || !response.body)throw Error("Missing model chunk: "+part.path);
          const reader=response.body.getReader();
          let seen=0;
          while(true){
            const {done,value}=await reader.read();
            if(done)break;
            seen+=value.byteLength;
            controller.enqueue(value);
          }
          if(seen!==part.bytes)throw Error("Truncated model chunk: "+part.path);
          count+=seen;
        }
        if(count!==entry.bytes)throw Error("Reconstructed model size mismatch: "+path);
        controller.close();
      })().catch(err=>controller.error(err));
    }
  });
  return new Response(stream,{status:200,headers});
 }
};
