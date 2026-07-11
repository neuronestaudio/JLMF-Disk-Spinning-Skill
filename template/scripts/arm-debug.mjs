// Visualize the accurate arm mask: green = kept (arm), over the source.
import Jimp from 'jimp';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const pub = path.join(root, 'public');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'layers.config.json'), 'utf8'));
const W = 1920, H = 1080;

const src = await Jimp.read(path.join(pub, cfg.sourceFile));
src.cover(W, H);
const d = src.bitmap.data;

const arm = cfg.arm;
const pt = (p) => [p[0] * W, p[1] * H];
const pivot = pt(arm.pivot), cw = pt(arm.counterweight), elbow = pt(arm.elbow), head = pt(arm.head);

function distSeg(x, y, a, b) {
  const vx = b[0]-a[0], vy = b[1]-a[1], wx = x-a[0], wy = y-a[1];
  const len2 = vx*vx+vy*vy;
  let t = len2===0?0:(wx*vx+wy*vy)/len2; t = Math.max(0,Math.min(1,t));
  return Math.hypot(x-(a[0]+t*vx), y-(a[1]+t*vy));
}
function corridor(x, y) {
  return Math.min(
    Math.hypot(x-pivot[0],y-pivot[1]) - arm.pivotRadius*H,
    distSeg(x,y,pivot,cw) - arm.counterweightRadius*H,
    distSeg(x,y,pivot,elbow) - arm.tubeRadius*H,
    distSeg(x,y,elbow,head) - arm.tubeRadius*H,
    Math.hypot(x-head[0],y-head[1]) - arm.headRadius*H
  );
}
// arm pixel? dark metal OR specular highlight (neutral+bright). reject saturated record art & warm deck.
function armLike(r,g,b){
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), sat=mx-mn, bri=mx;
  if (bri < 60) return 1;                    // dark metal / shadow
  if (sat < 26 && bri > 110) return 1;       // specular metal glint
  return 0;
}

const out = src.clone();
const od = out.bitmap.data;
let kept=0;
for (let y=0;y<H;y++) for (let x=0;x<W;x++){
  const i=(y*W+x)*4;
  if (corridor(x,y) <= 0 && armLike(d[i],d[i+1],d[i+2])){
    od[i]=0; od[i+1]=255; od[i+2]=0; kept++;
  }
}
await out.writeAsync(path.join(root,'out','arm_debug.png'));
console.log('kept px', kept);
