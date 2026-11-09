/** Byte-exact public HTTP acceptance for a Cloudflare-deployed Batch50C.
 * Must run AFTER verifying the live service worker equals the current build.
 */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

const base=(process.env.HBEAUTY_PUBLIC_URL || "https://h-beauty.mostifa2273.workers.dev").replace(/\/$/,"");
const lock=readFileSync("assets/hbeauty-manicure-batch50c.sha256","utf8").trim().split(/\r?\n/);
if(lock.length!==8)throw Error("Live test requires exact eight-image manifest");
for(const line of lock){
  const m=line.match(/^([0-9a-f]{64})  (public\/nails\/photos\/nail-[a-z0-9-]+\.webp)$/);
  if(!m)throw Error("Invalid public-image acceptance lock");
  const [digest,path]=[m[1],m[2]];
  const local=readFileSync(path);
  if(createHash("sha256").update(local).digest("hex")!==digest)throw Error("Local reference does not match locked bytes: "+path);
  const url=base+"/"+path.slice("public/".length);
  let lastError="unknown";
  let passed=false;
  for(let attempt=1;attempt<=5;attempt++){
    try {
      const response=await fetch(url+"?verify="+encodeURIComponent((process.env.GITHUB_SHA||"production")+"-"+attempt),{
        headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(30000)
      });
      if(!response.ok)throw Error("HTTP "+response.status);
      const actual=Buffer.from(await response.arrayBuffer());
      const hash=createHash("sha256").update(actual).digest("hex");
      if(hash!==digest)throw Error("sha256 mismatch "+hash);
      console.log("PASS",path,actual.length,"bytes");
      passed=true;break;
    }catch(error){
      lastError=String(error);
      console.error("Attempt",attempt,path,lastError);
      if(attempt<5)await new Promise(resolve=>setTimeout(resolve,5000));
    }
  }
  if(!passed)throw Error("Public image unavailable or differs from release: "+path+"; "+lastError);
}
console.log("Verified all 8 public manicure Batch50C images byte-for-byte");
