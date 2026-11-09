/** Restore six original owner-uploaded ZIPs from GitHub-safe binary segments.
 * No resizing, recompression or modification of the 78 WebP originals.
 * Fail closed if any chunk or ZIP is missing or altered.
 */
import {existsSync,readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createHash} from "node:crypto";
const hash=b=>createHash("sha256").update(b).digest("hex");
const EXPECTED=[
  "43abf08f37f49deaa2e63c6bf0d30e4e58ff46fd2e5cd36e5a1e81dd47b6ca64",
  "0b6cd419f0b6a165669421527d8f562d8ca6cac1f6e20289c83ca6435f4c67fe",
  "f42b1c5ecb96cea46a7317a7e0f3e50c10e06d0c521172a18913312d471afc0e",
  "a94520400f8fa8a08b881122773d0478b1ae604ea7fd2c232e954c249d55d5f8",
  "b8bdefaa21132474317efdb461ea2ba651a613499e03de72d0d8365159eaa82b",
  "3a7530b11d38095b1d9cea33bf11193063f2331b3c7a6f2e313d73ede3402ac2"
];
export function restorePedicureParts({root="."}={}){
  root=resolve(root);
  const paths=EXPECTED.map((_,i)=>Array.from({length:4},(_,j)=>
    resolve(root,"assets/pedicure-chunks/HB78_P"+(i+1)+".part"+(j+1))));
  const found=paths.flat().filter(existsSync).length;
  if(found===0)return {restored:false};
  if(found!==24)throw Error("Incomplete pedicure binary assets: "+found+"/24");
  const staged=new Map();
  for(let i=0;i<6;i++){
    const bytes=Buffer.concat(paths[i].map(p=>readFileSync(p)));
    if(hash(bytes)!==EXPECTED[i])throw Error("Pedicure source ZIP checksum mismatch: part "+(i+1));
    staged.set(resolve(root,"assets/pedicure-parts/HB78_P"+(i+1)+".zip"),bytes);
  }
  // No write until all six archive signatures have passed.
  for(const [path,bytes] of staged){
    mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);
  }
  console.log("Restored and verified six untouched pedicure ZIPs from GitHub binary segments");
  return {restored:true,parts:6};
}
