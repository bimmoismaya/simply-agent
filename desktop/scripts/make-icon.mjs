// Membuat ikon app: cincin dengan berlian di tengah (selaras dengan favicon dan ikon agent di UI).
// Tanpa dependensi: encoder PNG sederhana memakai zlib bawaan Node.
// Pakai: node scripts/make-icon.mjs   -> assets/icon.png (512) dan assets/tray.png (64)
import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const ACCENT = [34, 211, 238];
const BG = [10, 14, 18];

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Titik (u,v) dalam satuan 0..1 termasuk bentuk: cincin + berlian pusat.
const inShape = (u, v) => {
  const dx = u - 0.5, dy = v - 0.5, d = Math.hypot(dx, dy);
  return (d <= 0.34 && d >= 0.27) || Math.abs(dx) + Math.abs(dy) <= 0.14;
};

function render(size, { background }) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 3; // supersampling untuk tepi halus
  const r = size * 0.18;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Persegi tumpul: sudut dipotong dengan jarak ke pusat sudut.
    const dx = Math.max(r - x, 0, x - (size - 1 - r));
    const dy = Math.max(r - y, 0, y - (size - 1 - r));
    const bg = background && dx * dx + dy * dy <= r * r ? 1 : 0;
    let cov = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      cov += inShape((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size) ? 1 : 0;
    }
    cov /= SS * SS;
    const i = (y * size + x) * 4;
    for (let k = 0; k < 3; k++) px[i + k] = Math.round(ACCENT[k] * cov + BG[k] * bg * (1 - cov));
    px[i + 3] = Math.round(Math.max(bg, cov) * 255);
  }
  return png(size, size, px);
}

mkdirSync("assets", { recursive: true });
writeFileSync("assets/icon.png", render(512, { background: true }));
writeFileSync("assets/tray.png", render(64, { background: false }));
console.log("assets/icon.png dan assets/tray.png dibuat");
