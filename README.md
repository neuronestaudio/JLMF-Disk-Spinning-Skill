# vinyl-spin (Claude Code skill)

Turn a static turntable / record-player photo into a seamless looping video where **only the vinyl spins** (with a flickering candle). 1920×1080, 8s, 240-frame seamless loop, rendered with Remotion.

**How to use:** just drop a turntable photo into a Claude Code session and ask to "spin it" — the skill auto-triggers. The full method (layer architecture, per-photo calibration, QA checklist, and the non-obvious gotchas that make the output clean) is in [SKILL.md](SKILL.md).

## Quick start (manual)
```bash
cp -r template/ ~/work/my-spin && cd ~/work/my-spin   # a normal folder, NOT the Claude app dir
cp /path/to/photo.png public/source.png
npm install
# calibrate: node scripts/rings.mjs   node scripts/tube-zoom.mjs   (edit layers.config.json)
npm run layers
node scripts/arm-check.mjs            # verify arm cutout
npm run render                        # -> out/vinyl-loop.mp4
```

## What lives here
- `SKILL.md` — the procedure + invariants (read this).
- `template/` — the Remotion project: `prepare-layers.mjs` (layer builder), `src/VinylSpin.tsx` (spin + candle flicker), `src/Calibrate.tsx` (overlay check), and `scripts/` calibration helpers (`rings`, `tube-zoom`, `ov`, `arm-check`, `arm-debug`).
- `template/layers.config.json` — worked example (the "Focus Jam Lounge" build); recalibrate per photo.

The committed project is v2 — it includes the background blackout (kills the doubled rim edge), radial-average under-arm refill (no smear), warm-metal arm cutout (solid tube), and the seamless candle flicker.
