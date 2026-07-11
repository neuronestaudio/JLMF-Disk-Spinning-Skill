// Slices public/source.png into three 1920x1080 layers:
//   background.png - the untouched photo (everything static)
//   vinyl.png      - the circular record only, tonearm digitally removed &
//                    refilled, transparent elsewhere (this layer rotates)
//   tonearm.png    - ONLY the arm's true silhouette (accurate alpha), static, on top
//
// The arm alpha = geometric corridor (localises the arm) INTERSECT an
// arm-colour test (dark metal + specular glints, rejecting bright record art
// and warm deck), then blurred + re-thresholded to remove speckles and give a
// clean anti-aliased edge. The SAME alpha drives the vinyl refill, so the disc
// keeps maximum original art and only the thin strip under the arm is donor-filled.
import Jimp from 'jimp';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const pub = path.join(root, 'public');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'layers.config.json'), 'utf8'));

const W = 1920;
const H = 1080;

const candidates = [cfg.sourceFile, 'source.png', 'source.jpg', 'source.jpeg'];
const srcName = candidates.find((f) => fs.existsSync(path.join(pub, f)));
if (!srcName) {
  console.error('Put your photo at public/' + cfg.sourceFile + ' first.');
  process.exit(1);
}

const src = await Jimp.read(path.join(pub, srcName));
src.cover(W, H);
const data = src.bitmap.data;

const cx = cfg.disc.cx * W;
const cy = cfg.disc.cy * H;
const r = cfg.disc.r * H;
const arm = cfg.arm;

const pt = (p) => [p[0] * W, p[1] * H];
const pivot = pt(arm.pivot);
const cw = pt(arm.counterweight);
const elbow = pt(arm.elbow);
const head = pt(arm.head);

function distSeg(x, y, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const wx = x - a[0], wy = y - a[1];
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : (wx * vx + wy * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (a[0] + t * vx), y - (a[1] + t * vy));
}
// signed distance to the arm corridor (<0 inside)
function corridor(x, y) {
  return Math.min(
    Math.hypot(x - pivot[0], y - pivot[1]) - arm.pivotRadius * H,
    distSeg(x, y, pivot, cw) - arm.counterweightRadius * H,
    distSeg(x, y, pivot, elbow) - arm.tubeRadius * H,
    distSeg(x, y, elbow, head) - arm.tubeRadius * H,
    Math.hypot(x - head[0], y - head[1]) - arm.headRadius * H
  );
}
// arm pixel? dark metal / shadow OR specular metal glint. rejects saturated
// record art (red/yellow/teal/cream) and the warmer, brighter deck wood.
// The arm is warm-neutral metal across its whole tonal range: dark shadowed
// steel AND bright specular highlights, always warm (red >= blue) and not
// vividly coloured. We KEEP that whole range so the tube reads solid, and lean
// on the thin corridor geometry to exclude the adjacent dark record art.
// Only reject pixels that are unmistakably record art: cool (navy/purple/blue),
// green/teal, or vividly saturated (red/yellow).
function armLike(i) {
  const rr = data[i], gg = data[i + 1], bb = data[i + 2];
  const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);
  const sat = mx - mn;
  if (bb > gg + 6) return 0;   // cool: purple / navy record art
  if (bb > rr + 6) return 0;   // blue record art
  if (gg > rr + 10) return 0;  // green / teal record art
  if (sat > 88) return 0;      // vivid red / yellow record art
  return 1;                    // warm metal: highlight or shadow
}

// ---- raw arm alpha (0/1) over the corridor -------------------------------
const raw = new Float32Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (corridor(x, y) <= 0 && armLike(p * 4)) raw[p] = 1;
  }
}

// ---- separable box blur then re-threshold --------------------------------
// kills isolated speckles, fills pinholes, yields an anti-aliased edge.
function boxBlur(buf, rad) {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  const win = rad * 2 + 1;
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -rad; x <= rad; x++) acc += buf[y * W + Math.max(0, Math.min(W - 1, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / win;
      const add = buf[y * W + Math.min(W - 1, x + rad + 1)];
      const sub = buf[y * W + Math.max(0, x - rad)];
      acc += add - sub;
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -rad; y <= rad; y++) acc += tmp[Math.max(0, Math.min(H - 1, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / win;
      const add = tmp[Math.min(H - 1, y + rad + 1) * W + x];
      const sub = tmp[Math.max(0, y - rad) * W + x];
      acc += add - sub;
    }
  }
  return out;
}
const blur = boxBlur(raw, 1);
// soft-threshold around 0.5 -> clean feathered alpha; speckles average low and vanish.
const alpha = new Float32Array(W * H);
for (let p = 0; p < W * H; p++) {
  const v = blur[p];
  alpha[p] = Math.max(0, Math.min(1, (v - 0.35) / 0.30));
}

// ---- donor fill for the vinyl under the arm ------------------------------
function sampleBilinear(x, y) {
  const x0 = Math.max(0, Math.min(W - 2, Math.floor(x)));
  const y0 = Math.max(0, Math.min(H - 2, Math.floor(y)));
  const fx = Math.min(1, Math.max(0, x - x0));
  const fy = Math.min(1, Math.max(0, y - y0));
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const i00 = (y0 * W + x0) * 4 + c;
    const i10 = (y0 * W + x0 + 1) * 4 + c;
    const i01 = ((y0 + 1) * W + x0) * 4 + c;
    const i11 = ((y0 + 1) * W + x0 + 1) * 4 + c;
    out[c] =
      data[i00] * (1 - fx) * (1 - fy) + data[i10] * fx * (1 - fy) +
      data[i01] * (1 - fx) * fy + data[i11] * fx * fy;
  }
  return out;
}
const vinyl = new Jimp(W, H, 0x00000000);
const tonearm = new Jimp(W, H, 0x00000000);
const vd = vinyl.bitmap.data;
const td = tonearm.bitmap.data;

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x;
    const i = p * 4;
    const mA = alpha[p];

    // ---- tonearm layer (accurate silhouette, static foreground) ----
    if (mA > 0.004) {
      td[i] = data[i];
      td[i + 1] = data[i + 1];
      td[i + 2] = data[i + 2];
      td[i + 3] = Math.round(mA * 255);
    }

    // ---- vinyl layer (spins) ----
    const dx = x - cx;
    const dy = y - cy;
    const rr = Math.hypot(dx, dy);
    const edge = rr - r;
    if (edge > 1.5) continue;
    const discA = edge <= 0 ? 1 : 1 - edge / 1.5;

    let rgb = [data[i], data[i + 1], data[i + 2]];
    if (mA > 0.02) {
      // Radial average: mean of every CLEAR pixel on the same radius ring.
      // This is exactly what a fast-spinning record looks like under motion
      // blur, so the reconstructed strip reads as a smooth part of the disc
      // instead of a duplicated-feature smear.
      const ang0 = Math.atan2(dy, dx);
      const N = 160;
      let ar = 0, ag = 0, ab = 0, wsum = 0;
      for (let k = 1; k < N; k++) {
        const a2 = ang0 + (k / N) * Math.PI * 2;
        const nx = cx + rr * Math.cos(a2);
        const ny = cy + rr * Math.sin(a2);
        if (nx < 0 || ny < 0 || nx > W - 1 || ny > H - 1) continue;
        if (alpha[Math.round(ny) * W + Math.round(nx)] >= 0.05) continue; // skip arm
        const s = sampleBilinear(nx, ny);
        ar += s[0]; ag += s[1]; ab += s[2]; wsum++;
      }
      if (wsum > 0) {
        const avg = [ar / wsum, ag / wsum, ab / wsum];
        rgb = [
          rgb[0] * (1 - mA) + avg[0] * mA,
          rgb[1] * (1 - mA) + avg[1] * mA,
          rgb[2] * (1 - mA) + avg[2] * mA,
        ];
      }
    }
    vd[i] = Math.round(rgb[0]);
    vd[i + 1] = Math.round(rgb[1]);
    vd[i + 2] = Math.round(rgb[2]);
    vd[i + 3] = Math.round(discA * 255);
  }
}

// Background: black out the whole record disc so NOTHING static lives under the
// spinning vinyl. Otherwise the original record art (baked into the photo) peeks
// past the rotating layer at the rim and reads as a doubled edge. The rotating
// vinyl covers this fill completely; the fill only ever shows through the 1.5px
// edge feather, where a dark disc-edge shadow is exactly what you want.
const bg = src.clone();
const bd = bg.bitmap.data;
const Rblack = r + 2;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= Rblack * Rblack) {
      const i = (y * W + x) * 4;
      bd[i] = 12; bd[i + 1] = 9; bd[i + 2] = 7;
    }
  }
}
await bg.writeAsync(path.join(pub, 'background.png'));
await vinyl.writeAsync(path.join(pub, 'vinyl.png'));
await tonearm.writeAsync(path.join(pub, 'tonearm.png'));
console.log('Wrote public/background.png, public/vinyl.png, public/tonearm.png');
