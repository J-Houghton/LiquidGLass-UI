// Compare two PNG screenshots without dependencies: decodes 8-bit RGB/RGBA non-interlaced PNGs
// (what Chrome's --screenshot writes), reports how many pixels differ and by how much, and can
// write a diff image (red where pixels differ). Usage:
//   node scripts/png-diff.mjs a.png b.png [diff.png] [--tol=0]
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error(`unsupported PNG (bitDepth ${bitDepth}, colorType ${colorType}, interlace ${interlace})`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      switch (filter) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * channels];
      out[o + 1] = cur[x * channels + 1];
      out[o + 2] = cur[x * channels + 2];
      out[o + 3] = channels === 4 ? cur[x * channels + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodePng(width, height, rgba) {
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const tol = Number((args.find((a) => a.startsWith('--tol=')) ?? '--tol=0').slice(6));
if (files.length < 2) {
  console.error('usage: node scripts/png-diff.mjs a.png b.png [diff.png] [--tol=0]');
  process.exit(2);
}
const A = decodePng(readFileSync(files[0]));
const B = decodePng(readFileSync(files[1]));
if (A.width !== B.width || A.height !== B.height) {
  console.log(`size differs: ${A.width}x${A.height} vs ${B.width}x${B.height}`);
  process.exit(1);
}
let differing = 0, sumAbs = 0, maxAbs = 0;
let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
const diff = new Uint8Array(A.data.length);
for (let i = 0; i < A.data.length; i += 4) {
  const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
  const gray = Math.round((A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3 / 4) + 160;
  diff[i] = gray; diff[i + 1] = gray; diff[i + 2] = gray; diff[i + 3] = 255;
  if (d > tol) {
    differing++;
    sumAbs += d;
    if (d > maxAbs) maxAbs = d;
    const px = (i / 4) % A.width, py = Math.floor(i / 4 / A.width);
    if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
    diff[i] = 220; diff[i + 1] = 30; diff[i + 2] = 30;
  }
}
const total = A.width * A.height;
console.log(
  differing === 0
    ? `identical (${A.width}x${A.height}, tol ${tol})`
    : `${differing} of ${total} px differ (${((100 * differing) / total).toFixed(3)}%), mean |delta| ${(sumAbs / differing).toFixed(1)}, max ${maxAbs}, bbox x ${minX}-${maxX} y ${minY}-${maxY}`,
);
if (files[2]) {
  writeFileSync(files[2], encodePng(A.width, A.height, diff));
  console.log(`diff image: ${files[2]}`);
}
process.exit(differing === 0 ? 0 : 1);
