/**
 * Fail-closed local photo container audit for reviewer exports.
 * We cannot safely re-encode JPEG/WebP with Node built-ins, so preserve exact
 * compressed image bytes ONLY for known metadata-free container structures.
 * Reject EXIF, XMP, comments, PNG text/unknown ancillary chunks, custom ICC
 * profiles, animation, unexpected trailers or unsupported structure.
 * This is a privacy guard, not a full image decoder or face anonymizer.
 */
const PNG_SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);
const PNG_ALLOWED = new Set([
  "IHDR", "PLTE", "IDAT", "IEND", "tRNS", "cHRM", "gAMA",
  "sRGB", "sBIT", "bKGD"
]);
const fail = reason => { throw new Error("Private image metadata/format gate: " + reason); };

function png(data) {
  if (data.length < 45 || !data.subarray(0,8).equals(PNG_SIGNATURE))
    fail("invalid PNG signature or structure");
  let offset = 8, header = false, image = false, ended = false;
  while (offset < data.length) {
    if (offset + 12 > data.length) fail("truncated PNG chunk");
    const size = data.readUInt32BE(offset);
    if (size > data.length - offset - 12) fail("invalid PNG chunk length");
    const type = data.toString("ascii", offset+4, offset+8);
    if (!/^[A-Za-z]{4}$/.test(type) || !PNG_ALLOWED.has(type))
      fail("PNG contains metadata or unsupported chunk: " + type);
    if (!header && (type !== "IHDR" || size !== 13))
      fail("invalid PNG header");
    if (type === "IHDR") {
      if (header || size !== 13 ||
          data.readUInt32BE(offset+8) === 0 || data.readUInt32BE(offset+12) === 0)
        fail("invalid or repeated PNG image header");
      header = true;
    }
    if (type === "IDAT") image = true;
    offset += size + 12;
    if (type === "IEND") {
      if (size !== 0 || !image || offset !== data.length)
        fail("PNG image missing data or contains trailing bytes");
      ended = true;
      break;
    }
  }
  if (!ended) fail("PNG missing IEND");
}

function jpeg(data) {
  if (data.length < 12 || data[0] !== 0xff || data[1] !== 0xd8)
    fail("invalid JPEG signature");
  let offset = 2, inScan = false, sawFrame = false, sawScan = false;
  while (offset < data.length) {
    if (inScan) {
      while (offset < data.length) {
        if (data[offset] !== 0xff) { offset++; continue; }
        let markerAt = offset+1;
        while (markerAt < data.length && data[markerAt] === 0xff) markerAt++;
        if (markerAt >= data.length) fail("unterminated JPEG image data");
        const marker = data[markerAt];
        if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset = markerAt+1; continue;
        }
        break;
      }
      inScan = false;
    }
    if (offset >= data.length || data[offset] !== 0xff)
      fail("invalid JPEG marker");
    while (offset < data.length && data[offset] === 0xff) offset++;
    if (offset >= data.length) fail("truncated JPEG marker");
    const marker = data[offset++];
    if (marker === 0xd9) {
      if (!sawFrame || !sawScan || offset !== data.length)
        fail("incomplete JPEG image or trailing data");
      return;
    }
    if (marker === 0xd8 || marker === 0x00 ||
        marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7))
      fail("unexpected JPEG marker");
    if (offset+2 > data.length) fail("truncated JPEG segment");
    const length = data.readUInt16BE(offset);
    if (length < 2 || length > data.length - offset)
      fail("invalid JPEG segment length");
    const start = offset+2, size = length-2;
    if (marker >= 0xe0 && marker <= 0xef) {
      const jfif = marker === 0xe0 && size === 14 &&
        data.toString("ascii",start,start+5) === "JFIF\u0000" &&
        data[start+12] === 0 && data[start+13] === 0;
      const adobe = marker === 0xee && size === 12 &&
        data.toString("ascii",start,start+5) === "Adobe";
      if (!jfif && !adobe)
        fail("JPEG APP metadata (EXIF/XMP/ICC/private data); normalize export first");
    } else if (marker === 0xfe) {
      fail("JPEG comment metadata");
    } else if (marker === 0xda) {
      if (!sawFrame) fail("JPEG scan precedes image header");
      sawScan = true;
      inScan = true;
    } else if ((marker >= 0xc0 && marker <= 0xcf &&
                ![0xc4,0xc8,0xcc].includes(marker))) {
      sawFrame = true;
    } else if (![0xc4,0xcc,0xdb,0xdd,0xdc].includes(marker)) {
      fail("unsupported JPEG segment: " + marker.toString(16));
    }
    offset += length;
  }
  fail("JPEG missing EOI");
}

function webp(data) {
  if (data.length < 20 ||
      data.toString("ascii",0,4) !== "RIFF" ||
      data.toString("ascii",8,12) !== "WEBP" ||
      data.readUInt32LE(4) !== data.length-8)
    fail("invalid WebP RIFF structure");
  let offset = 12, image = false, extended = false;
  const allowed = new Set(["VP8 ","VP8L","VP8X","ALPH"]);
  while (offset < data.length) {
    if (offset+8 > data.length) fail("truncated WebP chunk");
    const name = data.toString("ascii",offset,offset+4);
    const size = data.readUInt32LE(offset+4);
    if (size > data.length-offset-8) fail("invalid WebP chunk length");
    if (!allowed.has(name))
      fail("WebP EXIF/XMP/ICC/animation or unsupported chunk: " + name);
    if (name === "VP8X") {
      if (extended || size !== 10 ||
          (data[offset+8] & 0x2f) !== 0)
        fail("WebP extended image carries metadata, animation or unsupported flags");
      extended = true;
    }
    if (name === "VP8 " || name === "VP8L") image = true;
    offset += 8 + size + (size % 2);
  }
  if (!image || offset !== data.length) fail("incomplete WebP image");
}

/** Byte-level allowlist; passes unchanged encoded pixels, not a full decode. */
export function assertPrivateImageContainer(data, ext) {
  if (!Buffer.isBuffer(data) || data.length > 60*1024*1024)
    fail("invalid image data or oversized file");
  if (ext === ".png") png(data);
  else if (ext === ".jpg" || ext === ".jpeg") jpeg(data);
  else if (ext === ".webp") webp(data);
  else fail("unsupported image type");
  return true;
}
