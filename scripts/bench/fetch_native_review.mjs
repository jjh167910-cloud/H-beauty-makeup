/** Restore the exact validated public review build, never a fresh untested build. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdtemp,readFile,rm,rename,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {verifyNativeContext,checkNativeReview,REVIEW_REPO} from './check_native_review.mjs';

const sha=process.env.WORKERS_CI_COMMIT_SHA;
const branch=process.env.WORKERS_CI_BRANCH;
const checkout=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const config=JSON.parse(await readFile('wrangler.preview.jsonc','utf8'));
verifyNativeContext({branch,sha,checkout,config});
await checkNativeReview(sha);
const tag='hbeauty-review-'+sha;
const headers={accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'};
const releaseResponse=await fetch('https://api.github.com/repos/'+REVIEW_REPO+'/releases/tags/'+tag,{headers,signal:AbortSignal.timeout(30000)});
if(!releaseResponse.ok)throw Error('Verified review package unavailable: HTTP '+releaseResponse.status);
const release=await releaseResponse.json();
if(release.tag_name!==tag||release.target_commitish!==sha||release.draft!==false||release.prerelease!==true)throw Error('Review release identity mismatch');
const assetName='hbeauty-review-dist.tar.gz';
const asset=release.assets?.find(x=>x.name===assetName);
const checksum=release.assets?.find(x=>x.name==='hbeauty-review-dist.sha256');
const prefix='https://github.com/'+REVIEW_REPO+'/releases/download/'+tag+'/';
if(!asset||!checksum||asset.browser_download_url!==prefix+assetName||checksum.browser_download_url!==prefix+checksum.name||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>1024**3||checksum.size>1024)throw Error('Invalid review release assets');
const tmp=await mkdtemp(join(tmpdir(),'hb-native-review-'));
try{
  const response=await fetch(checksum.browser_download_url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Checksum unavailable');
  const expected=(await response.text()).trim().match(/^([a-f0-9]{64})\s+\*?hbeauty-review-dist\.tar\.gz$/)?.[1];
  if(!expected||asset.digest!=='sha256:'+expected)throw Error('Published asset digest does not match checksum');
  const download=await fetch(asset.browser_download_url,{signal:AbortSignal.timeout(300000)});
  if(!download.ok||!download.body)throw Error('Review package download failed: '+download.status);
  const hash=createHash('sha256');let bytes=0;
  const archive=join(tmp,assetName);
  await pipeline(Readable.fromWeb(download.body),new Transform({transform(chunk,_encoding,cb){
    bytes+=chunk.length;
    if(bytes>asset.size){cb(Error('Package exceeded expected size'));return;}
    hash.update(chunk);cb(null,chunk);
  }}),createWriteStream(archive));
  if(bytes!==asset.size||hash.digest('hex')!==expected)throw Error('Review package integrity failure');
  const listing=execFileSync('tar',['-tzf',archive],{encoding:'utf8',maxBuffer:16*1024**2});
  const paths=listing.trim().split('\n');
  if(paths.some(p=>!p.startsWith('./')||p.split('/').includes('..')||p.includes('\\')))throw Error('Unsafe archive path');
  const verbose=execFileSync('tar',['-tvzf',archive],{encoding:'utf8',maxBuffer:16*1024**2});
  if(verbose.trim().split('\n').some(l=>!/^[-d]/.test(l)))throw Error('Archive contains nonregular entries');
  const staged=join(process.cwd(),'.hbeauty-review-dist-'+sha);
  await rm(staged,{recursive:true,force:true});
  await mkdir(staged);
  try{
    execFileSync('tar',['-xzf',archive,'--no-same-owner','--no-same-permissions','-C',staged]);
    for(const file of ['index.html','sw.js','research-preview/index.html','research-preview/metrics.json','research-preview/blind-review-standalone.html']){
      if(!(await readFile(join(staged,file))).length)throw Error('Missing review asset: '+file);
    }
    if((await readFile(join(staged,'research-preview/REVIEW_SHA.txt'),'utf8')).trim()!==sha)throw Error('Embedded commit mismatch');
    await rm('dist',{recursive:true,force:true});
    await rename(staged,'dist');
  }finally{await rm(staged,{recursive:true,force:true});}
  console.log('Verified exact review package '+sha+' SHA256 '+expected+' ('+bytes+' bytes)');
}finally{await rm(tmp,{recursive:true,force:true});}
