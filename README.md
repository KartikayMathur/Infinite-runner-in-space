# Space Runner — Self-contained HTML Prototype

## Quick start
1. Save `index.html`, `styles.css`, `main.js`, `README.md` into one folder.
2. Open `index.html` in your browser (Chrome/Edge/Firefox recommended).
3. Tap/click or press Space to thrust the ship. Hold to sustain thrust. Swipe gestures detected on touch.

## Acceptance checklist
- Game window black background
- Triangle ship on left
- Gravity pulls ship downward
- Click/Space makes ship jump upward
- Distance value increases over time

## Files
- index.html — base HTML referencing Phaser CDN and main.js
- styles.css — small UI overlay styles
- main.js — full game logic, spawn manager, pooling basics, save, ad & telemetry stubs

## Notes & next steps
- Ads & telemetry are stubs (`window.requestRewardedAd`, `window.showInterstitial`, `window.telemetry.emit`) and respect the consent toggle in the lower-left.
- To test reproducible runs, add `?seed=1234` to the URL; RNG will use that seed.
- Replace runtime-generated textures with an atlas when ready; keep pooling for obstacles/coins.
- For real ad SDKs, implement adapters that call the stubbed functions and flip consent handling accordingly.

## Acceptance testing
If any of the five checklist items fail, paste browser console logs here and I will debug instantly.
