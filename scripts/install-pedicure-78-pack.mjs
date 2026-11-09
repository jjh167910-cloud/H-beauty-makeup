/** Verified all-or-nothing installation of the 78 ChatGPT pedicure images.
 * Uploaded archives: assets/pedicure-parts/HB78_P1.zip ... HB78_P6.zip
 */
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {resolve,dirname} from 'node:path';
const hash = b=>createHash('sha256').update(b).digest('hex');
const partNames=Array.from({length:6},(_,i)=>'assets/pedicure-parts/HB78_P'+(i+1)+'.zip');
const targetName=name=>'public/nails/photos/'+name;
function lock(root) {
  const rows=readFileSync(resolve(root,'assets/hbeauty-pedicure-78.sha256'),'utf8').trim().split(/\r?\n/);
  const m=new Map();
  for(const row of rows) {
    const entry=row.match(/^([a-f0-9]{64})\s+public\/nails\/photos\/(pedi-[a-z0-9-]+\.webp)$/);
    if(!entry||m.has(entry[2]))throw Error('Invalid pedicure SHA256 release lock');
    m.set(entry[2],entry[1]);
  }
  if(m.size!==78||new Set(m.values()).size!==78)throw Error('Expected 78 distinct pedicure image hashes');
  return m;
}
function unzip(bytes) {
  if(bytes.length<1000||bytes.length>12*1048576)throw Error('Pedicure ZIP part size invalid');
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)
    if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0||bytes.readUInt16LE(end+8)!==bytes.readUInt16LE(end+10))
    throw Error('Invalid ZIP central directory');
  const n=bytes.readUInt16LE(end+10);
  if(n<1||n>78)throw Error('Unexpected ZIP entry count');
  let at=bytes.readUInt32LE(end+16);
  const out=new Map();
  for(let i=0;i<n;i++) {
    if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)
      throw Error('Malformed ZIP record');
    const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10);
    const packed=bytes.readUInt32LE(at+20),size=bytes.readUInt32LE(at+24);
    const nl=bytes.readUInt16LE(at+28),el=bytes.readUInt16LE(at+30),cl=bytes.readUInt16LE(at+32);
    const local=bytes.readUInt32LE(at+42);
    if(at+46+nl+el+cl>end)throw Error('Malformed ZIP filename');
    const name=bytes.subarray(at+46,at+46+nl).toString('utf8');
    at+=46+nl+el+cl;
    if(!/^pedi-[a-z0-9-]+\.webp$/.test(name)||out.has(name)||(flags&1)||![0,8].includes(method)
      ||size<25000||size>2200000||local+30>bytes.length
      ||bytes.readUInt32LE(local)!==0x04034b50)
      throw Error('Disallowed ZIP entry: '+name);
    const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
    if(start+packed>bytes.length)throw Error('Truncated ZIP image '+name);
    const data=method===8?inflateRawSync(bytes.subarray(start,start+packed)):bytes.subarray(start,start+packed);
    if(data.length!==size)throw Error('Wrong decompressed image size '+name);
    out.set(name,data);
  }
  return out;
}
export function installPedicure78({root='.'}={}) {
  root=resolve(root);
  const expected=lock(root);
  const parts=partNames.map(n=>resolve(root,n));
  const count=parts.filter(existsSync).length;
  const direct=[...expected.keys()].filter(n=>existsSync(resolve(root,targetName(n))));
  if(count===0&&direct.length===0)return {installed:false,count:0};
  if(count!==0&&count!==6)throw Error('Partial pedicure ZIP upload: '+count+'/6');
  const files=new Map();
  if(count===6){
    for(const p of parts)for(const [name,data] of unzip(readFileSync(p))){
      if(!expected.has(name)||files.has(name))throw Error('Duplicate or unknown pedicure image: '+name);
      files.set(name,data);
    }
  } else {
    if(direct.length!==78)throw Error('Partial pedicure image upload: '+direct.length+'/78');
    for(const name of expected.keys())files.set(name,readFileSync(resolve(root,targetName(name))));
  }
  if(files.size!==78)throw Error('Incomplete pedicure ZIP content: '+files.size+'/78');
  for(const [name,data] of files) {
    if(data.length<25000||data.length>2200000||data.toString('ascii',0,4)!=='RIFF'
      ||data.toString('ascii',8,12)!=='WEBP'||hash(data)!==expected.get(name))
      throw Error('Pedicure image checksum/content mismatch: '+name);
  }
  for(const [name,data] of files){
    const p=resolve(root,targetName(name));mkdirSync(dirname(p),{recursive:true});writeFileSync(p,data);
  }
  return {installed:true,count:files.size};
}
