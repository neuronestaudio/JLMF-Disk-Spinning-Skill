// Slices public/source.png into three 1920x1080 layers:
//   background.png - the untouched photo (everything static)
//   vinyl.png      - the circular record only, tonearm + its cast shadow removed
//                    & refilled, transparent elsewhere (this layer rotates)
//   tonearm.png    - ONLY the arm's true silhouette (accurate alpha), static, on top
//
// The arm alpha = geometric corridor (localises the arm) INTERSECT an arm-colour
// test (dark metal + specular glints, rejecting bright record art and warm deck),
// blurred + re-thresholded for a clean anti-aliased edge. This tight alpha is what
// gets PASTED on top (tonearm.png).
//
// The vinyl refill uses a WIDER "fill" mask = arm alpha PLUS a geometric shadow
// band (the tube offset toward its cast shadow), because the tonearm's shadow is
// baked into the photo and, if left in, rotates as a dark "negative" of the arm.
// Refill is a LOCAL TANGENTIAL BLEND (nearest clear pixel on each side along the
// same radius) — on a detailed/picture disc this continues the real art instead
// of the old whole-ring average, which washed out into a visible ghost.
//   Shadow band knobs (fractions of H, per-photo): arm.shadowOffset (distance to
//   the shadow), arm.shadowRadius (band half-width; 0 disables), arm.shadowSign
//   (+1/-1 to flip which side of the tube the shadow is on).
// Debug: writes out/maskdbg.png — red = fill (arm+shadow), green = pasted arm.
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
  if (sat > 74) return 0;      // saturated record art (incl. warm headwrap pattern)
  if (rr - gg > 46) return 0;  // strongly red / orange art (e.g. sunset labels) - metal is grayer (r-g small)
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
// Tangential blend along the radius ring: nearest CLEAR pixel on each side.
// clearBuf[p] < 0.05 means "usable donor". Returns {rgb, lum} or null.
function tangBlend(x, y, clearBuf) {
  const dx = x - cx, dy = y - cy;
  const rr = Math.hypot(dx, dy);
  const ang0 = Math.atan2(dy, dx);
  const step = 0.7 / Math.max(rr, 1);
  const find = (dir) => {
    for (let k = 1; k < 6000; k++) {
      const a2 = ang0 + dir * k * step;
      const nx = cx + rr * Math.cos(a2);
      const ny = cy + rr * Math.sin(a2);
      if (nx < 0 || ny < 0 || nx > W - 1 || ny > H - 1) return null;
      if (clearBuf[Math.round(ny) * W + Math.round(nx)] < 0.05) return {s: sampleBilinear(nx, ny), d: k};
    }
    return null;
  };
  const P = find(1), M = find(-1);
  let rgb = null;
  if (P && M) {
    const wP = M.d / (P.d + M.d);
    rgb = [P.s[0]*wP + M.s[0]*(1-wP), P.s[1]*wP + M.s[1]*(1-wP), P.s[2]*wP + M.s[2]*(1-wP)];
  } else if (P) rgb = P.s;
  else if (M) rgb = M.s;
  if (!rgb) return null;
  return {rgb, lum: 0.299*rgb[0] + 0.587*rgb[1] + 0.114*rgb[2]};
}

// ---- geometric shadow band -> add to the FILL mask (not the pasted tonearm).
// The tonearm's cast shadow is baked into the photo, offset to one side of the
// tube. Left in, it rotates as a dark "negative" of the arm. We cover it with a
// band = the tube segment shifted perpendicular toward the shadow, so it gets
// removed + refilled. shadowOffset/shadowRadius are fractions of H; toward the
// shadow is the +perp direction of the elbow->head tube. shadowRadius=0 disables.
const eF = pt(arm.elbow), hF = pt(arm.head);
let ux = hF[0] - eF[0], uy = hF[1] - eF[1];
const uL = Math.hypot(ux, uy) || 1; ux /= uL; uy /= uL;
const px = -uy, py = ux;                         // unit perpendicular (toward shadow)
const sOff = (arm.shadowOffset ?? 0) * H;
const sRad = (arm.shadowRadius ?? 0) * H;
const sSign = (arm.shadowSign ?? 1);
const eS = [eF[0] + px * sOff * sSign, eF[1] + py * sOff * sSign];
const hS = [hF[0] + px * sOff * sSign, hF[1] + py * sOff * sSign];
const fillRaw = new Float32Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x;
    let f = alpha[p] >= 0.05 ? 1 : 0;
    if (sRad > 0) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= (r + 2) * (r + 2)) {
        if (distSeg(x, y, eS, hS) <= sRad) f = 1;
      }
    }
    fillRaw[p] = f;
  }
}
const fillBlur = boxBlur(fillRaw, 2);            // feathered edge for a soft refill
const fillAlpha = new Float32Array(W * H);
for (let p = 0; p < W * H; p++) fillAlpha[p] = Math.max(alpha[p], Math.min(1, fillBlur[p] * 1.25));

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

    // Refill uses the WIDER fill mask (arm + its cast shadow) so the shadow is
    // removed from the spinning disc; the pasted tonearm above stays tight.
    const mF = fillAlpha[p];
    let rgb = [data[i], data[i + 1], data[i + 2]];
    if (mF > 0.02) {
      const est = tangBlend(x, y, fillAlpha); // donors = clear of arm AND shadow
      if (est) {
        rgb = [
          rgb[0] * (1 - mF) + est.rgb[0] * mF,
          rgb[1] * (1 - mF) + est.rgb[1] * mF,
          rgb[2] * (1 - mF) + est.rgb[2] * mF,
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

// --- debug: dump fill mask vs arm mask ---
{
  const dbg = new Jimp(W, H, 0x000000ff);
  const dd = dbg.bitmap.data;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    dd[i] = Math.round(fillAlpha[p] * 255);   // red = fill (arm+shadow)
    dd[i + 1] = Math.round(alpha[p] * 255);    // green = arm only
    dd[i + 2] = 0;
  }
  await dbg.writeAsync(path.join(root, 'out', 'maskdbg.png'));
}
