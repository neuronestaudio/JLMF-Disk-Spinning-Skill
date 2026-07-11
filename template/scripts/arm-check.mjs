// Inspect the tonearm cutout: composite public/tonearm.png over flat grey and
// crop to the arm so you can confirm it is ONLY the arm (solid tube, bearing,
// headshell) with no frozen record-art blobs. Run after `npm run layers`.
//
//   node scripts/arm-check.mjs [x0f] [y0f] [wf] [hf]   (fractions of the frame)
import Jimp from 'jimp';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const W = 1920, H = 1080;
const a = process.argv.slice(2).map(Number);
const x0 = (a[0] ?? 0.50) * W, y0 = (a[1] ?? 0.14) * H, w = (a[2] ?? 0.26) * W, h = (a[3] ?? 0.48) * H;

const t = await Jimp.read(path.join(root, 'public', 'tonearm.png'));
const bg = new Jimp(W, H, 0x707070ff);
bg.composite(t, 0, 0);
fs.mkdirSync(path.join(root, 'out'), {recursive: true});
await bg.crop(Math.round(x0), Math.round(y0), Math.round(w), Math.round(h)).scale(1.7).writeAsync(path.join(root, 'out', 'arm_check.png'));
console.log('wrote out/arm_check.png');
