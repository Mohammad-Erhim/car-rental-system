# Asset sources

The Play Store graphics and videos are plain HTML/CSS pages rendered by headless Chromium, so the
designs are version-controlled, reviewable, and can be regenerated after a UI change.

| File           | Renders                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| `screens.html` | the six phone screenshots as one 8640×2560 panorama, sliced into 1440×2560 panels      |
| `feature.html` | the 1024×500 feature graphic (rendered at 2× and downsampled)                          |
| `video.html`   | the promo video: a deterministic `render(t)` timeline, `?w=&h=` picks orientation      |
| `common.css`   | shared tokens (colors sampled from the app), device frame, callouts, type              |
| `lib.js`       | DOM helpers: phone frame, zoomed callout crop, map texture, route path                 |
| `icons.js`     | [Lucide](https://lucide.dev) icons (ISC, see `LUCIDE-LICENSE.txt`), the app's icon set |
| `fonts/`       | Plus Jakarta Sans (SIL OFL 1.1, see `fonts/OFL-LICENSE.txt`)                           |
| `render.mjs`   | cleans the captures, renders every asset into `../1-…` to `../4-…`                     |

## Re-render

```bash
cd apps/mobile/google-play/source
npm install --no-save playwright && npx playwright install chromium
node render.mjs            # everything (the two videos take ~10 min)
node render.mjs screens    # or one step: captures | icon | feature | screens | thumb | video
node render.mjs video:landscape --frames 120   # quick 2-second check
```

It needs `ffmpeg` with `libx264` on `PATH` (or set `FFMPEG=/path/to/ffmpeg`). Set `CHROME_PATH` to
use a specific Chromium build.

`render.mjs` first writes cleaned copies of `../5-app-captures/*.png` to `captures/` (gitignored):
it paints over the emulator's black navigation strip and adds a gesture pill. The designs read
the launcher icon straight from `apps/mobile/assets/`, so a new icon shows up everywhere on the
next render.

To preview while editing, open any HTML file in Chrome. Serve the folder, or launch Chrome with
`--allow-file-access-from-files`. In `video.html`, call `render(12.5)` in the console to jump to
a moment.
