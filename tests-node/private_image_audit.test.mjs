import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPrivateImageContainer } from "../scripts/quality/private_image_audit.mjs";
import { packStudy } from "../scripts/quality/blind_photo_study.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lJ8AAAAASUVORK5CYII=", "base64");
const jpeg = Buffer.from([
  0xff,0xd8, 0xff,0xc0,0,11,8,0,1,0,1,1,1,0x11,0,
  0xff,0xda,0,8,1,1,0,0,63,0, 0x11, 0xff,0xd9
]);
function chunk(name, bytes) {
  const head=Buffer.alloc(8), payload=Buffer.from(bytes);
  head.write(name,0,"ascii"); head.writeUInt32LE(payload.length,4);
  return Buffer.concat([head,payload, ...(payload.length%2?[Buffer.from([0])]:[])]);
}
function riff(...chunks) {
  const body=Buffer.concat([Buffer.from("WEBP"),...chunks]);
  const header=Buffer.alloc(8); header.write("RIFF"); header.writeUInt32LE(body.length,4);
  return Buffer.concat([header,body]);
}
const webp=riff(chunk("VP8 ",[0,0,0,0]));
function injectPngText() {
  const payload=Buffer.from("Author\u0000sensitive-location-here");
  const head=Buffer.alloc(8),crc=Buffer.alloc(4);
  head.writeUInt32BE(payload.length,0); head.write("tEXt",4);
  // Rejected because text is disallowed, before any chunk CRC is consulted.
  return Buffer.concat([png.subarray(0,33),head,payload,crc,png.subarray(33)]);
}
const jpegWith = (marker,payload) =>
  Buffer.concat([jpeg.subarray(0,2),Buffer.from([0xff,marker,0,(payload.length+2)]),payload,jpeg.subarray(2)]);

test("byte audit accepts compact metadata-free encoded PNG, JPEG and WebP",()=>{
  assert.equal(assertPrivateImageContainer(png,".png"),true);
  assert.equal(assertPrivateImageContainer(jpeg,".jpg"),true);
  assert.equal(assertPrivateImageContainer(webp,".webp"),true);
});

test("fail closed on PNG personal text, unknown ancillary chunks and trailing bytes",()=>{
  assert.throws(()=>assertPrivateImageContainer(injectPngText(),".png"),/metadata\/format gate/);
  assert.throws(()=>assertPrivateImageContainer(Buffer.concat([png,Buffer.from("hidden")]),".png"),/trailing bytes/);
  assert.throws(()=>assertPrivateImageContainer(png,".jpeg"),/invalid JPEG/);
});

test("fail closed on EXIF and comments in JPEG, but allow known compact JFIF",()=>{
  assert.throws(()=>assertPrivateImageContainer(jpegWith(0xe1,Buffer.from("Exif\u0000\u0000GPS")),".jpeg"),/APP metadata/);
  assert.throws(()=>assertPrivateImageContainer(jpegWith(0xfe,Buffer.from("GPS")),".jpg"),/comment metadata/);
  const jfif=Buffer.from([74,70,73,70,0,1,1,0,0,1,0,1,0,0]);
  assert.equal(assertPrivateImageContainer(jpegWith(0xe0,jfif),".jpg"),true);
  assert.throws(()=>assertPrivateImageContainer(Buffer.concat([jpeg,Buffer.from("tracking")]),".jpg"),/trailing data/);
});

test("fail closed on WebP EXIF/XMP, ICC, animation and invalid RIFF length",()=>{
  for(const name of ["EXIF","XMP ","ICCP","ANIM","ANMF"]){
    assert.throws(()=>assertPrivateImageContainer(riff(chunk("VP8 ",[0]),chunk(name,[1,2,3])),".webp"),/metadata\/format gate/);
  }
  const corrupted=Buffer.from(webp); corrupted.writeUInt32LE(0,4);
  assert.throws(()=>assertPrivateImageContainer(corrupted,".webp"),/RIFF/);
});

test("pack refuses source photo containing EXIF without leaving partial reviewer output", async()=>{
  const dir=await fs.mkdtemp(join(tmpdir(),"hbeauty-sensitive-pack-"));
  const output=join(tmpdir(),"hbeauty-denied-"+Date.now()+"-"+Math.random().toString(16).slice(2));
  try{
    const bad=jpegWith(0xe1,Buffer.from("Exif\u0000\u0000GPS-secret"));
    await fs.writeFile(join(dir,"bad.jpg"),bad);
    await fs.writeFile(join(dir,"clean.png"),png);
    const looks=["hollywood","electric-blue","rhinestone"];
    const trials=looks.map(look_id=>({
      sample_id:"S001",skin_group:"deep",look_id,candidate_file:"bad.jpg",
      comparator_file:"clean.png",consent_confirmed:true
    }));
    const manifest=join(dir,"manifest.json");
    await fs.writeFile(manifest,JSON.stringify({schema_version:1,trials}));
    await assert.rejects(()=>packStudy(manifest,output,"private-test-seed-not-for-production"),/APP metadata/);
    await assert.rejects(()=>fs.stat(output),{code:"ENOENT"});
    const siblings=await fs.readdir(tmpdir());
    assert.equal(siblings.some(x=>x.startsWith(output.split("/").at(-1)+".partial-")),false);
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
    await fs.rm(output,{recursive:true,force:true});
  }
});
