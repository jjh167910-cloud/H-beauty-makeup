import {readdirSync,statSync,openSync,readSync,closeSync,writeFileSync,mkdirSync,unlinkSync,existsSync} from "node:fs";
import {join,relative,resolve,dirname,sep} from "node:path";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
export const LIMIT=25*1024*1024;
export const PART=20*1024*1024;
const sha = value=>createHash("sha256").update(value).digest("hex");
function walk(root){
 const found=[];
 for(const e of readdirSync(root,{withFileTypes:true})){
  const p=join(root,e.name);
  if(e.isSymbolicLink())throw Error("Refusing symlink asset: "+p);
  if(e.isDirectory())found.push(...walk(p));else if(e.isFile())found.push(p);
 }
 return found;
}
export function splitLargeAssets(root){
 root=resolve(root);
 if(!existsSync(root))throw Error("Asset directory missing: "+root);
 const chunksRoot=join(root,"_hbeauty_chunks");
 if(existsSync(chunksRoot))throw Error("Chunks directory already exists; refusing stale manifest");
 const files={};
 for(const full of walk(root).sort()){
  const original=statSync(full);
  if(original.size<=LIMIT)continue;
  const url="/"+relative(root,full).split(sep).join("/");
  if(!url.startsWith("/tryon/"))throw Error("Unapproved oversized asset: "+url);
  const id=sha(url).slice(0,24);
  const parts=[];
  let readTotal=0;
  const digest=createHash("sha256");
  const fd=openSync(full,"r");
  try{
    while(readTotal<original.size){
      const size=Math.min(PART,original.size-readTotal);
      const buf=Buffer.allocUnsafe(size);
      let done=0;
      while(done<size){
        const n=readSync(fd,buf,done,size-done,readTotal+done);
        if(n===0)throw Error("Unexpected EOF: "+url);
        done+=n;
      }
      digest.update(buf);
      const part="/_hbeauty_chunks/"+id+"-"+String(parts.length).padStart(3,"0")+".part";
      const onDisk=join(root,part.slice(1));
      mkdirSync(dirname(onDisk),{recursive:true});
      writeFileSync(onDisk,buf);
      parts.push({path:part,bytes:size});
      readTotal+=size;
    }
  }finally{closeSync(fd);}
  if(readTotal!==original.size || !parts.length)throw Error("Invalid chunk reconstruction: "+url);
  files[url]={bytes:original.size,sha256:digest.digest("hex"),parts};
  unlinkSync(full);
 }
 mkdirSync(chunksRoot,{recursive:true});
 const manifest={schema:1,files};
 writeFileSync(join(chunksRoot,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
 return manifest;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const out=splitLargeAssets(process.argv[2]||"dist");
 console.log(JSON.stringify({oversizeFiles:Object.keys(out.files).length,chunkFiles:Object.values(out.files).reduce((sum,f)=>sum+f.parts.length,0)}));
}
