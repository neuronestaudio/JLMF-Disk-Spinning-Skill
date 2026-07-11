import React from 'react';
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  interpolate,
} from 'remotion';
import cfg from '../layers.config.json';

const DUR = 240; // frames per loop (must match Root.tsx durationInFrames)

const layerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
};

// Candle flame position (fraction of the 1920x1080 frame).
const CANDLE = {x: 0.744, y: 0.135};

// Seamless flicker: only INTEGER cycle-counts over the loop, so frame DUR
// lands exactly back on frame 0. A slow warm sway plus faster shimmer =
// an organic candle wobble that never jumps at the loop seam.
function flicker(frame: number) {
  const t = frame / DUR;
  const T = Math.PI * 2;
  let f =
    0.62 +
    0.20 * Math.sin(T * 3 * t + 0.0) +
    0.12 * Math.sin(T * 7 * t + 1.7) +
    0.09 * Math.sin(T * 11 * t + 3.1) +
    0.06 * Math.sin(T * 17 * t + 0.6) +
    0.04 * Math.sin(T * 23 * t + 2.2);
  return Math.max(0.15, Math.min(1, f));
}

export const VinylSpin: React.FC = () => {
  const frame = useCurrentFrame();

  // Perfectly linear: frames [0, 240] map to [0, 720] degrees, clamped.
  // Frame 0 = 0 deg, frame 240 = 720 = 0 deg -> seamless, no duplicate frame.
  const rotation = interpolate(frame, [0, DUR], [0, 720], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const origin = cfg.disc.cx * 100 + '% ' + cfg.disc.cy * 100 + '%';

  const fl = flicker(frame);
  const cxp = CANDLE.x * 100 + '%';
  const cyp = CANDLE.y * 100 + '%';

  // Glow intensity & size breathe with the flame.
  const coreOpacity = 0.22 + 0.5 * fl;      // bright inner pool of light
  const haloOpacity = 0.10 + 0.28 * fl;     // soft warm spill across the desk
  const glowScale = 0.9 + 0.22 * fl;
  const globalWarm = 0.03 + 0.05 * fl;      // faint scene-wide warm breath

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      {/* 1. Static background: desk, deck, plant, headphones, coffee, candle */}
      <Img src={staticFile('background.png')} style={layerStyle} />

      {/* 2. The only mechanically-animated layer: the vinyl record (clockwise) */}
      <Img
        src={staticFile('vinyl.png')}
        style={{
          ...layerStyle,
          transform: 'rotate(' + rotation + 'deg)',
          transformOrigin: origin,
        }}
      />

      {/* 3. Static foreground: the accurately cut-out tonearm */}
      <Img src={staticFile('tonearm.png')} style={layerStyle} />

      {/* 4. Candle light — soft warm spill across the desk, flickering. */}
      <AbsoluteFill
        style={{
          mixBlendMode: 'screen',
          pointerEvents: 'none',
          background:
            'radial-gradient(42% 46% at ' + cxp + ' ' + cyp + ', ' +
            'rgba(255,180,90,' + haloOpacity.toFixed(3) + ') 0%, ' +
            'rgba(255,150,70,' + (haloOpacity * 0.5).toFixed(3) + ') 32%, ' +
            'rgba(255,120,50,0) 70%)',
          transform: 'scale(' + glowScale.toFixed(3) + ')',
          transformOrigin: cxp + ' ' + cyp,
        }}
      />

      {/* 4b. Candle core — tight bright pool right at the flame. */}
      <AbsoluteFill
        style={{
          mixBlendMode: 'screen',
          pointerEvents: 'none',
          background:
            'radial-gradient(13% 15% at ' + cxp + ' ' + cyp + ', ' +
            'rgba(255,225,170,' + coreOpacity.toFixed(3) + ') 0%, ' +
            'rgba(255,180,90,' + (coreOpacity * 0.4).toFixed(3) + ') 45%, ' +
            'rgba(255,150,70,0) 100%)',
        }}
      />

      {/* 4c. Faint scene-wide warm breath so the whole tabletop reacts. */}
      <AbsoluteFill
        style={{
          mixBlendMode: 'soft-light',
          pointerEvents: 'none',
          background: 'rgb(255,170,90)',
          opacity: globalWarm,
        }}
      />
    </AbsoluteFill>
  );
};
