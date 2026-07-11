// Zoom a region of the source photo so you can trace the tonearm precisely
// (tube endpoints, headshell, bearing). Read pixel coords off the printed crop
// box: a displayed pixel (dx,dy) maps to frame (x0 + dx/scale, y0 + dy/scale),
// and to config fractions x/1920, y/1080.
//
//   node scripts/tube-zoom.mjs [x0] [y0] [w] [h] [scale]
//
// Defaults frame a right-of-centre region that usually contains the arm.
import Jimp from 'jimp';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'layers.config.json'), 'utf8'));
const W = 1920, H = 1080;

const a = process.argv.slice(2).map(Number);
const x0 = a[0] ?? 1080, y0 = a[1] ?? 180, w = a[2] ?? 300, h = a[3] ?? 380, scale = a[4] ?? 2.6;

const img = await Jimp.read(path.join(root, 'public', cfg.sourceFile));
img.cover(W, H);
fs.mkdirSync(path.join(root, 'out'), {recursive: true});
const c = img.crop(x0, y0, w, h).scale(scale);
await c.writeAsync(path.join(root, 'out', 'tube_zoom.png'));
console.log(`crop frame x0=${x0} y0=${y0} w=${w} h=${h} scale=${scale}`);
console.log(`map: frame_x = ${x0} + displayed_x/${scale} ; frame_y = ${y0} + displayed_y/${scale}`);
console.log('then config fraction = frame_x/1920 , frame_y/1080');
console.log('wrote out/tube_zoom.png');
