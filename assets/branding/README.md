# Helicoptea branding

Original artwork made for this project: Steam library images and the app icon.

| File | Size | Use |
|---|---|---|
| `steam/hero.png` | 3840×1240 | Steam library hero (background) |
| `steam/logo.png` | transparent PNG | Steam library logo, drawn over the hero |
| `steam/portrait.png` | 600×900 | Steam grid / portrait capsule |
| `steam/wide.png` | 920×430 | Steam wide capsule ("recent games") |
| `steam/icon.png`, `steam/icon.ico` | 256×256 (+16–128 in the .ico) | Steam shortcut and desktop icon |
| `../../public/favicon.ico`, `icon.svg`, `icon-192/512.png`, `apple-touch-icon.png`, `manifest.webmanifest` | | Web game favicon and app icons |

## Sources

- `renders/` are stills from the game itself: `tools/branding/stage.mjs` flies the micro heli with the in-game
  autopilot, hooks a tea bag, brews it in the mug, lifts it over the cup, freezes the simulation and renders
  each camera in `tools/branding/shots.json`. Staging only: warmer lights, fuller steam (rotor wash on the
  steam turned off), and the teapot hidden in the portrait shot.
- `src/logo.svg` is the wordmark (Palatino Linotype and Segoe UI, Windows system fonts, as in the game's UI).
- `src/icon.svg` is the icon, hand-drawn vector.
- `tools/branding/build.mjs` grades the renders (warm light, vignette), lays the logo on the capsules,
  and exports every file above, including the multi-size `.ico`.

## Rebuild

```
node node_modules/vite/bin/vite.js --config tools/branding/vite.config.js   # dev server on 5190 (leave running)
node tools/branding/stage.mjs tools/branding/shots.json assets/branding/renders
node tools/branding/build.mjs
```

Both scripts drive the locally installed Chrome through playwright-core.
