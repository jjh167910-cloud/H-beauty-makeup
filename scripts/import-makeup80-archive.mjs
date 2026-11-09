#!/usr/bin/env node
/** Import the one-file, SHA256-pinned 80-makeup-image archive. Node.js 22+ only.
 * No network/deployment side effects. Accepts precisely 160 WebPs + 2 manifests.
 */
import {readFileSync,existsSync,mkdirSync,writeFileSync,renameSync} from "node:fs";
import {join,dirname,resolve} from "node:path";
import {createHash} from "node:crypto";
import {inflateRawSync} from "node:zlib";
const root=resolve("."),pkg=join(root,"assets/hbeauty-makeup-80.zip");
const lock=join(root,"assets/hbeauty-makeup-80.sha256");
const hash=b=>createHash("sha256").update(b).digest("hex");
function fail(message){throw Error("H-Beauty 80-image archive: "+message)}
// A published source ZIP is fetched only in the explicitly enabled 80-look build.
// The expected SHA256 is pinned in Git, so a changed CDN object fails closed.
const VERIFIED_ASSET_URL = "https://d2ol7oe51mr4n9.cloudfront.net/user_3JeOUdb9NaNBnQHWcT0xYSQ6MdR/8af92322-5f13-4d6e-8d1f-b04a0e747281.zip";
if(!existsSync(pkg) && (process.env.VITE_MAKEUP_CURATED_80 === "true" || process.argv.includes("--download"))){
 if(!existsSync(lock))fail("required SHA256 lock missing");
 const expectedDownload=readFileSync(lock,"utf8").trim().split(/\s+/)[0];
 console.log("Downloading original 80-look portrait bundle for the opted-in build...");
 const response=await fetch(process.env.HBEAUTY_MAKEUP80_ASSET_URL||VERIFIED_ASSET_URL,
   {signal:AbortSignal.timeout(150000),headers:{"Accept":"application/zip"}});
 if(!response.ok)fail("portrait archive download failed: HTTP "+response.status);
 const contentLength=Number(response.headers.get("content-length")||0);
 if(contentLength>35*1048576)fail("download exceeds 35 MiB limit");
 const archiveBytes=Buffer.from(await response.arrayBuffer());
 if(archiveBytes.length>35*1048576||hash(archiveBytes)!==expectedDownload)
   fail("downloaded archive SHA256 mismatch; no images imported");
 mkdirSync(dirname(pkg),{recursive:true});
 writeFileSync(pkg+".tmp-makeup80",archiveBytes,{flag:"wx"});
 renameSync(pkg+".tmp-makeup80",pkg);
 console.log("Verified archive download:",archiveBytes.length,"bytes");
}
if(!existsSync(pkg)){
 if(process.argv.includes("--if-present")){console.log("No image archive; expecting 160 existing files");process.exit(0)}
 fail("Upload hbeauty-makeup-80.zip into assets/ before activating 80-look mode");
}
if(!existsSync(lock))fail("SHA256 lock file is missing");
const bytes=readFileSync(pkg),expected=readFileSync(lock,"utf8").trim().split(/\s+/)[0];
if(hash(bytes)!==expected)fail("archive hash mismatch; do not deploy modified files");
let eocd=-1;
for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
 if(bytes.readUInt32LE(i)===0x06054b50){eocd=i;break}
}
if(eocd<0)fail("invalid ZIP directory");
const n=bytes.readUInt16LE(eocd+10),dirOffset=bytes.readUInt32LE(eocd+16);
if(n!==162||bytes.readUInt16LE(eocd+8)!==n||dirOffset>=eocd)fail("expected exactly 162 ZIP entries");
const allow=/^public\/makeup\/(?:curated-40\/(?:sm\/mk40-\d{2}\.webp|mk40-\d{2}\.webp|manifest\.json)|curated-80\/(?:sm\/mk80-(?:4[3-9]|[5-7]\d|8[0-2])\.webp|mk80-(?:4[3-9]|[5-7]\d|8[0-2])\.webp|manifest\.json))$/;
const files=new Map();let at=dirOffset,total=0;
for(let i=0;i<n;i++){
 if(at+46>bytes.length||bytes.readUInt32LE(at)!==0x02014b50)fail("bad central directory record");
 const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10);
 const packed=bytes.readUInt32LE(at+20),size=bytes.readUInt32LE(at+24);
 const len=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32);
 const start=bytes.readUInt32LE(at+42),name=bytes.subarray(at+46,at+46+len).toString("utf8");
 at+=46+len+extra+comment;
 if(!allow.test(name)||files.has(name))fail("unknown or duplicated image path "+name);
 if(flags&1||![0,8].includes(method)||packed>2000000||size>2000000)fail("unsafe ZIP entry "+name);
 if(start+30>bytes.length||bytes.readUInt32LE(start)!==0x04034b50)fail("invalid local ZIP header "+name);
 const localName=bytes.subarray(start+30,start+30+bytes.readUInt16LE(start+26)).toString("utf8");
 if(localName!==name)fail("ZIP path mismatch "+name);
 const offset=start+30+bytes.readUInt16LE(start+26)+bytes.readUInt16LE(start+28);
 if(offset+packed>bytes.length)fail("truncated entry "+name);
 const raw=bytes.subarray(offset,offset+packed);
 const data=method===0?Buffer.from(raw):inflateRawSync(raw,{maxOutputLength:2000001});
 if(data.length!==size)fail("size mismatch "+name);
 total+=size;if(total>35*1048576)fail("asset unpack size exceeded");
 files.set(name,data);
}
for(const [folder,first,prefix] of [["curated-40",1,"mk40-"],["curated-80",43,"mk80-"]]){
 const manifest=JSON.parse(files.get("public/makeup/"+folder+"/manifest.json")?.toString("utf8")??"null");
 if(manifest?.lookCount!==40||manifest.looks?.length!==40)fail("missing 40-entry manifest "+folder);
 for(let i=0;i<40;i++){
  const id=prefix+(folder==="curated-40"?String(i+1).padStart(2,"0"):i+43);
  const info=manifest.looks[i];
  if(info.id!==id)fail("out-of-order manifest "+id);
  for(const sm of [false,true]){
   const path="public/makeup/"+folder+"/"+(sm?"sm/":"")+id+".webp";
   const image=files.get(path);
   if(!image||image.toString("ascii",0,4)!=="RIFF"||image.toString("ascii",8,12)!=="WEBP")fail("missing/invalid WebP "+path);
   const expectedHash=sm?info.thumbSha256:info.sha256;
   if(expectedHash&&hash(image)!==expectedHash)fail("portrait SHA256 mismatch "+path);
  }
 }
}
console.log("Verified "+files.size+" portrait files; archive digest "+expected);
if(process.argv.includes("--verify-only"))process.exit(0);
let imported=0;
for(const [name,data] of files){
 const target=join(root,...name.split("/"));
 if(existsSync(target)){
  if(hash(readFileSync(target))!==hash(data))fail("existing file differs: "+target);
  continue;
 }
 mkdirSync(dirname(target),{recursive:true});
 writeFileSync(target+".tmp-makeup",data,{flag:"wx"});
 renameSync(target+".tmp-makeup",target);
 imported++;
}
console.log("Imported "+imported+" missing files; existing images preserved");
