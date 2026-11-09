/** Byte-accurate live acceptance for two Batch50D manicure photos. */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const base=(process.env.HBEAUTY_PUBLIC_URL||"https://h-beauty.mostifa2273.workers.dev").replace(/\/$/,"");
const lines=readFileSync("assets/hbeauty-manicure-batch50d.sha256","utf8").trim().split(/\r?\n/);
if(lines.length!==2)throw Error("Batch50D live acceptance requires two originals");
for(const line of lines){
  const m=line.match(/^([0-9a-f]{64})  (public\/nails\/photos\/nail-[a-z0-9-]+\.webp)$/);
  if(!m)throw Error("Invalid Batch50D live lock");
  const digest=m[1],path=m[2];
  if(createHash("sha256").update(readFileSync(path)).digest("hex")!==digest)throw Error("Local Batch50D bytes changed");
  const url=base+"/"+path.slice("public/".length);
  let ok=false,lastError="";
  for(let attempt=1;attempt<=5;attempt++){
    try{
      const response=await fetch(url+"?verify="+encodeURIComponent((process.env.GITHUB_SHA||"release")+"-"+attempt),{
        headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(30000)
      });
      if(!response.ok)throw Error("HTTP "+response.status);
      const b=Buffer.from(await response.arrayBuffer());
      const got=createHash("sha256").update(b).digest("hex");
      if(got!==digest)throw Error("SHA256 mismatch "+got);
      console.log("PASS",path,b.length,"bytes");ok=true;break;
    }catch(err){
      lastError=String(err);console.error("Attempt",attempt,path,lastError);
      if(attempt<5)await new Promise(resolve=>setTimeout(resolve,5000));
    }
  }
  if(!ok)throw Error("Public Batch50D image verification failed: "+path+"; "+lastError);
}
console.log("Verified both Batch50D public WebP URLs byte-for-byte");
