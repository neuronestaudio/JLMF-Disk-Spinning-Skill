// node scripts/ov.mjs cx cy rx ry   (all in px)  -> draws ellipse overlay
import Jimp from 'jimp';
import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'layers.config.json'), 'utf8'));
const W = 1920, H = 1080;
const [cx, cy, rx, ry] = process.argv.slice(2).map(Number);
const img = await Jimp.read(path.join(root, 'public', cfg.sourceFile));
img.cover(W, H);
const od = img.bitmap.data;
const set = (x, y, r, g, b) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4; od[i] = r; od[i + 1] = g; od[i + 2] = b;
};
for (let a = 0; a < 360; a += 0.2) {
  const rad = a * Math.PI / 180;
  for (let t = -1; t <= 1; t++) set(cx + (rx + t) * Math.cos(rad), cy + (ry + t) * Math.sin(rad), 0, 255, 0);
}
for (let t = -8; t <= 8; t++) { set(cx + t, cy, 0, 255, 255); set(cx, cy + t, 0, 255, 255); }
const c = img.crop(Math.round(0.33 * W), Math.round(0.11 * H), Math.round(0.34 * W), Math.round(0.58 * H));
await c.writeAsync(path.join(root, 'out', 'ov.png'));
console.log('cx', cx, 'cy', cy, 'rx', rx, 'ry', ry, '-> cx', (cx / W).toFixed(4), 'cy', (cy / H).toFixed(4), 'rx', (rx / W).toFixed(4), 'ry', (ry / H).toFixed(4));
