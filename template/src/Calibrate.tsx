import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import cfg from '../layers.config.json';

const W = 1920;
const H = 1080;

// Open this Still in Remotion Studio to check the geometry:
// the GREEN circle must hug the record edge (its dot on the spindle),
// the RED shapes must fully cover the tonearm, pivot and cartridge.
// Tweak layers.config.json until they do, then run: npm run layers
export const Calibrate: React.FC = () => {
  const cx = cfg.disc.cx * W;
  const cy = cfg.disc.cy * H;
  const r = cfg.disc.r * H;
  const a = cfg.arm;
  const pt = (p: number[]) => [p[0] * W, p[1] * H];
  const pivot = pt(a.pivot);
  const cw = pt(a.counterweight);
  const elbow = pt(a.elbow);
  const head = pt(a.head);
  const red = 'rgba(255,0,0,0.45)';

  return (
    <AbsoluteFill>
      <Img
        src={staticFile(cfg.sourceFile)}
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
      <svg
        viewBox={'0 0 ' + W + ' ' + H}
        style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%'}}
      >
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="lime" strokeWidth={3} />
        <circle cx={cx} cy={cy} r={5} fill="lime" />
        <circle cx={pivot[0]} cy={pivot[1]} r={a.pivotRadius * H} fill={red} />
        <circle cx={head[0]} cy={head[1]} r={a.headRadius * H} fill={red} />
        <line
          x1={pivot[0]} y1={pivot[1]} x2={cw[0]} y2={cw[1]}
          stroke={red} strokeWidth={a.counterweightRadius * 2 * H} strokeLinecap="round"
        />
        <line
          x1={pivot[0]} y1={pivot[1]} x2={elbow[0]} y2={elbow[1]}
          stroke={red} strokeWidth={a.tubeRadius * 2 * H} strokeLinecap="round"
        />
        <line
          x1={elbow[0]} y1={elbow[1]} x2={head[0]} y2={head[1]}
          stroke={red} strokeWidth={a.tubeRadius * 2 * H} strokeLinecap="round"
        />
      </svg>
    </AbsoluteFill>
  );
};
