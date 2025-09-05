# Space Infinite Runner - Prototype (Slice 1)

Phaser 3 (Arcade) prototype scaffold for an infinite runner in space.
This slice includes a working ship, unified input manager, UI overlay, telemetry & ads stubs, and minimal tooling using Vite.

## Quick start
1. `npm install`
2. `npm run dev`
3. Open the printed URL (e.g. `http://localhost:5173`) on desktop or mobile.

## Project structure
```

/src
/scenes
BootScene.js
PreloadScene.js
MainScene.js
UIScene.js
/systems
InputManager.js
ObjectPool.js
SpawnManager.js
/services
telemetry.js
ads.js
consent.js
main.js
index.html
vite.config.js

```

## Acceptance checklist
- Ship spawns center-left, responds to tap/space (thrust).
- Hold detection triggers repeated thrust.
- Works on mobile (touch) and desktop.
- UI overlay shows distance and other placeholders.
- Telemetry & Ads are present as stubs and respect consent flag.

## Next steps
- Procedural obstacle spawner + pooling
- Collectibles / scoring / end-run modal
- Ad SDK integration via adapter
- Local storage save for currency/progression
