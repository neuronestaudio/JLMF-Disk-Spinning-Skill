---
name: vinyl-spin
description: Turn a static photo of a record player / turntable into a seamless looping video where ONLY the vinyl spins (plus a flickering candle if present). Use when the user uploads or points to a JPG/PNG of a turntable, record deck, or vinyl on a platter and wants it animated / "spun" / made into a loop. Renders 1920x1080 via Remotion. Every photo needs a short per-image calibration pass (disc + tonearm + candle) — this skill encodes that exact method so the output is consistently clean (no cut-off disc, no doubled edge, solid static arm).
---

# Vinyl Spin

Animate a real turntable photo so the record spins in place. Photorealistic result: the disc rotates as a locked circle inside its chrome rim, the tonearm stays static and solid on top, everything else (deck, plant, coffee, candle) stays still, and the candle flickers. Output is a seamless 8s / 240-frame loop (720°, linear).

## Architecture (3 layers, composited in Remotion)

1. **background.png** — the full photo, but with the record disc region **blacked out**. This is critical: if the original record art stays baked in, it peeks past the rotating layer at the rim and reads as a *doubled edge*. Blacking it means nothing static lives under the spinning disc.
2. **vinyl.png** — the circular record, arm digitally removed and refilled by a **radial average** (mean of every clear pixel at the same radius = what a spinning record looks like under motion blur → no smear). This is the ONLY layer that rotates.
3. **tonearm.png** — the tonearm's true silhouette (accurate alpha), static, on top.

Plus a **candle flicker** (warm radial glow) added in `src/VinylSpin.tsx`.

`scripts/prepare-layers.mjs` builds layers 1–3 from `public/source.png` using `layers.config.json`. `src/VinylSpin.tsx` does the rotation + flicker. `src/Calibrate.tsx` is a Still that overlays the disc circle + arm mask for checking.

## Setup

1. Copy the working template somewhere durable and non-sandboxed, e.g. the scratchpad dir or `D:\...`. **Do NOT run `npm install` inside the Claude packaged-app session-outputs folder** — esbuild's postinstall fails there (`spawn cmd.exe EPERM/ENOENT`). The scratchpad or any normal drive folder works.
2. `cp template/* <workdir>/ -r`
3. Put the user's photo at `<workdir>/public/source.png`.
4. `npm install` (Remotion + jimp; ~1–3 min).
5. Confirm the photo is ~16:9. `cover(1920,1080)` scales it; if the aspect differs a lot it will crop — note that when calibrating.

## Calibration — the quality-critical pass (do this per photo)

Work on the 1920x1080 cover frame. All config values are fractions: `cx`/`rx` = fraction of **width**, `cy`/`r`/radii = fraction of **height**.

### A. Disc (must be a clean circle locked to the chrome rim)
- `node scripts/rings.mjs [cx_px] [cy_px]` draws concentric rings (red/green/blue/yellow) + a centre cross on `out/rings.png`.
- Adjust `cx,cy` until the cross is dead-centre and the rings are concentric with the platter; pick the ring that sits exactly on the **inner edge of the chrome rim** (all colourful art inside it, deck outside).
- Set `disc.cx, disc.cy, disc.r`. The rotating disc is extended to this radius, so it fills to the rim (no cut-off) without spilling onto the deck.
- The platter is usually very close to a true circle; if a photo is a steep angle it may be slightly elliptical — bias `r` to the *smaller* axis so it never overhangs the deck (colored overhang onto dark deck is the worst-looking failure).
- Optional double-check: `node scripts/ov.mjs cx cy rx ry` draws a single ellipse to eyeball.

### B. Tonearm (must end up solid, and ONLY the arm)
- `node scripts/tube-zoom.mjs` zooms the arm; it prints the pixel→fraction mapping. Trace:
  - `arm.pivot` = bearing centre, `pivotRadius` covers the bearing housing (this is usually off-disc over the deck, so generosity here is invisible).
  - `arm.counterweight` = the weight behind the pivot; `counterweightRadius`.
  - `arm.elbow` = top of the visible tube near the bearing; `arm.head` = the headshell/cartridge; `headRadius` covers the cartridge block.
  - `tubeRadius` — the tube is THIN (~7px wide → ~0.0075). Keep it thin: only the over-disc tube+headshell must be tight, because a fat corridor drags in the dark record art beside the tube and freezes it onto the spinning disc.
- The arm colour gate in `prepare-layers.mjs` keeps warm metal across its whole range (bright specular highlights AND dark shadow — reject only cool/navy/purple, green/teal, and vividly saturated art). This keeps the tube **solid**; don't tighten it back to "dark only" or the bright tube highlight drops out and the arm looks broken.

### C. Candle
- Find the flame position (fraction of frame) and set `CANDLE = {x, y}` in `src/VinylSpin.tsx`. If there's no candle, drop the glow opacity to 0 or delete the glow blocks.

## Build + QA loop

1. `npm run layers` (builds the 3 PNGs; the radial-average refill makes this take a few seconds).
2. `node scripts/arm-check.mjs` → `out/arm_check.png`. The arm must be ONLY the arm: solid continuous tube, bearing, headshell, no frozen record-art blobs. If blobs appear over the disc, the tube corridor is too fat or off-centre — retrace (B) or lower `tubeRadius`.
3. `npx remotion still Calibrate out/calibrate.png` to sanity-check the disc circle + arm mask overlay.
4. `npm run render` → `out/vinyl-loop.mp4`, then extract frames with the bundled ffmpeg (`find node_modules -name ffmpeg.exe`) at several angles and **verify all of**:
   - disc stays a circle, fills to the rim, **no cut-off sliver, no deck overhang, no wobble**;
   - **rim/NE edge: single clean edge, no doubled arc** (blackout working);
   - tonearm solid and static at every angle;
   - candle flickers (bright vs dim across frames);
   - only the record moves.
5. Deliver the mp4 (name it after the design). Media players cache frames — if the user still sees the old one, tell them to reopen/scrub, or export under a new filename.

## Key invariants (don't regress these)
- **Background blackout** under the disc → prevents the doubled edge.
- **Radial-average refill** → clean under-arm reconstruction (no duplicated-feature smear).
- **Warm-metal arm gate + thin tube corridor** → solid arm, no frozen art.
- **Seamless flicker**: only integer cycle counts over `DUR` frames, so the loop point is seamless. `DUR` in `VinylSpin.tsx` must match `durationInFrames` in `Root.tsx` (240).
- Rotation maps frames [0,DUR] → [0,720]° linearly, clamped → seamless, no duplicate frame.

## Config reference (`layers.config.json`)
```
disc.cx / disc.cy   disc centre (cx=frac width, cy=frac height)
disc.r              disc radius = chrome-rim inner edge (frac height)
arm.pivot           bearing centre [fracW, fracH]      + pivotRadius (fracH)
arm.counterweight   weight behind pivot               + counterweightRadius
arm.elbow           top of visible tube (near bearing)
arm.head            headshell / cartridge             + headRadius
arm.tubeRadius      HALF-width of the thin tube (~0.0075)
arm.padPx / featherPx  legacy mask feathering
```
The committed `layers.config.json` holds the "Focus Jam Lounge" values as a worked example — recalibrate for each new photo.
