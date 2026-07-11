// Find the disc centre + radius. Draws concentric test rings on the source photo
// so you can read off where the record art meets the chrome-rim inner edge.
//
//   node scripts/rings.mjs [cx] [cy] [r0] [r1] [r2] [r3]
//
// cx,cy default to the current layers.config.json disc centre (in px on the
// 1920x1080 cover frame). r0..r3 default to 228/234/240/246. The magenta cross
// marks the centre. Pick the ring that sits exactly on the inner edge of the
// chrome rim (art fully inside it, deck fully outside) and set disc.r = ring/1080.
import Jimp from 'jimp';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'layers.config.json'), 'utf8'));
const W = 1920, H = 1080;

const a = process.argv.slice(2).map(Number);
const cx = a[0] || cfg.disc.cx * W;
const cy = a[1] || cfg.disc.cy * H;
const rings = [a[2] || 228, a[3] || 234, a[4] || 240, a[5] || 246];
const cols = [[255, 0, 0], [0, 255, 0], [0, 180, 255], [255, 255, 0]];

const img = await Jimp.read(path.join(root, 'public', cfg.sourceFile));
img.cover(W, H);
const d = img.bitmap.data;
const set = (x, y, c) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
};
rings.forEach((rad, k) => {
  for (let t = 0; t < 360; t += 0.15) { const r = t * Math.PI / 180; set(cx + rad * Math.cos(r), cy + rad * Math.sin(r), cols[k]); }
});
for (let t = -10; t <= 10; t++) { set(cx + t, cy, [255, 0, 255]); set(cx, cy + t, [255, 0, 255]); }

fs.mkdirSync(path.join(root, 'out'), {recursive: true});
const crop = img.crop(Math.round(0.33 * W), Math.round(0.11 * H), Math.round(0.34 * W), Math.round(0.58 * H));
await crop.writeAsync(path.join(root, 'out', 'rings.png'));
console.log('centre', cx, cy, '| rings red=' + rings[0], 'green=' + rings[1], 'blue=' + rings[2], 'yellow=' + rings[3]);
console.log('-> disc.cx', (cx / W).toFixed(4), 'disc.cy', (cy / H).toFixed(4), '| r fractions:', rings.map(r => (r / H).toFixed(4)).join(' '));
console.log('wrote out/rings.png');
