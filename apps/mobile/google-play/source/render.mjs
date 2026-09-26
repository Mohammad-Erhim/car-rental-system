#!/usr/bin/env node
/**
 * Re-renders every Google Play asset in ../1-app-icon … ../4-promo-video from:
 *   - the six untouched device captures in ../5-app-captures/
 *   - the app's real launcher icon in apps/mobile/assets/
 *   - the HTML designs in this folder (screens.html, feature.html, video.html)
 *
 * Usage:  node render.mjs [all|captures|icon|feature|screens|thumb|video|video:landscape|video:vertical]
 *                         [--frames N]   (N = render only the first N frames, for a quick check)
 * Needs:  `playwright` (npm i --no-save playwright) and `ffmpeg` with libx264 on PATH.
 *         CHROME_PATH / FFMPEG env vars override the browser / ffmpeg binaries.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CAPTURES = [
  'light-home',
  'light-results',
  'light-detail',
  'dark-home',
  'dark-results',
  'dark-detail',
];
const SCREENSHOTS = [
  '01-rent-the-right-car',
  '02-live-availability',
  '03-trip-price-up-front',
  '04-light-and-dark-mode',
  '05-pickup-where-you-need-it',
  '06-choose-your-exact-car',
];

const args = process.argv.slice(2);
const step = args.find((a) => !a.startsWith('--')) || 'all';
const framesArg = args.indexOf('--frames');
const maxFrames = framesArg >= 0 ? Number(args[framesArg + 1]) : Infinity;
const url = (file, query = '') => pathToFileURL(path.join(HERE, file)).href + query;
const out = (...p) => {
  const f = path.join(ROOT, ...p);
  mkdirSync(path.dirname(f), { recursive: true });
  return f;
};

/** Pipe `input` through ffmpeg (`-i pipe:0 …args… outFile`). */
function ffmpeg(input, argv, outFile) {
  return new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-i', 'pipe:0', ...argv, outFile], {
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    ff.stdin.end(input);
  });
}
/** Play wants screenshots / feature graphic as 24-bit PNG without an alpha channel. */
const toRgbPng = (png, outFile, extra = []) =>
  ffmpeg(png, [...extra, '-pix_fmt', 'rgb24'], outFile);

async function openPage(browser, file, { width, height, scale = 1, query = '' }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => console.error(`[${file}]`, e.message));
  await page.goto(url(file, query));
  await page.waitForSelector('body[data-ready="1"]');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  });
  await page.waitForTimeout(300);
  return page;
}

/**
 * The emulator captures end in a 72px black navigation strip (rows 2920–2991). Repaint it with the
 * screen's own background plus a theme-coloured gesture pill so the phones look native. On the
 * home screens content runs under the strip, so it is faded out instead of stretched.
 */
async function prepareCaptures(browser) {
  mkdirSync(path.join(HERE, 'captures'), { recursive: true });
  const page = await browser.newPage();
  await page.goto(url('screens.html').replace('screens.html', ''));
  for (const name of CAPTURES) {
    const src = pathToFileURL(path.join(ROOT, '5-app-captures', `${name}.png`)).href;
    const dataUrl = await page.evaluate(
      async ({ src, dark, home }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const STRIP = 2920;
        const [r, gg, b] = g.getImageData(4, STRIP - 1, 1, 1).data;
        const bg = `rgb(${r},${gg},${b})`;
        if (home) {
          const fade = g.createLinearGradient(0, STRIP - 58, 0, STRIP);
          fade.addColorStop(0, `rgba(${r},${gg},${b},0)`);
          fade.addColorStop(1, bg);
          g.fillStyle = fade;
          g.fillRect(0, STRIP - 58, c.width, 58);
          g.fillStyle = bg;
          g.fillRect(0, STRIP, c.width, c.height - STRIP);
        } else {
          for (let y = STRIP; y < c.height; y++)
            g.drawImage(c, 0, STRIP - 1, c.width, 1, 0, y, c.width, 1);
        }
        g.fillStyle = dark ? 'rgba(235,238,244,.9)' : 'rgba(40,44,52,.7)';
        g.beginPath();
        g.roundRect((c.width - 324) / 2, 2958, 324, 10, 5);
        g.fill();
        return c.toDataURL('image/png');
      },
      { src, dark: name.startsWith('dark'), home: name.endsWith('home') },
    );
    await writeFile(
      path.join(HERE, 'captures', `${name}.png`),
      Buffer.from(dataUrl.split(',')[1], 'base64'),
    );
  }
  await page.close();
  console.log('captures: cleaned 6 device captures');
}

async function renderIcon() {
  const { readFile } = await import('node:fs/promises');
  const icon = await readFile(path.resolve(ROOT, '../assets/icon.png'));
  await ffmpeg(
    icon,
    ['-vf', 'scale=512:512:flags=lanczos'],
    out('1-app-icon', 'play-store-icon-512.png'),
  );
  console.log('icon: 1-app-icon/play-store-icon-512.png');
}

async function renderFeature(browser) {
  const page = await openPage(browser, 'feature.html', { width: 1024, height: 500, scale: 2 });
  const png = await page.screenshot();
  await page.close();
  await toRgbPng(png, out('2-feature-graphic', 'feature-graphic-1024x500.png'), [
    '-vf',
    'scale=1024:500:flags=lanczos',
  ]);
  console.log('feature: 2-feature-graphic/feature-graphic-1024x500.png');
}

async function renderScreens(browser) {
  const page = await openPage(browser, 'screens.html', { width: 8640, height: 2560 });
  for (let i = 0; i < SCREENSHOTS.length; i++) {
    const png = await page.screenshot({ clip: { x: i * 1440, y: 0, width: 1440, height: 2560 } });
    await toRgbPng(png, out('3-phone-screenshots', `${SCREENSHOTS[i]}.png`));
  }
  await page.close();
  console.log('screens: 3-phone-screenshots/01…06');
}

async function renderThumb(browser) {
  const page = await openPage(browser, 'video.html', {
    width: 1920,
    height: 1080,
    query: '?w=1920&h=1080',
  });
  await page.evaluate(() => window.render(17.3)); // the light/dark split — the most striking frame
  const png = await page.screenshot();
  await page.close();
  await toRgbPng(png, out('4-promo-video', 'youtube-thumbnail-1280x720.png'), [
    '-vf',
    'scale=1280:720:flags=lanczos',
  ]);
  console.log('thumb: 4-promo-video/youtube-thumbnail-1280x720.png');
}

/** Frame-accurate: drive window.render(t) per frame, capture over CDP, pipe JPEGs into x264. */
async function renderVideo(browser, w, h, file, fps = 60) {
  const page = await openPage(browser, 'video.html', {
    width: w,
    height: h,
    query: `?w=${w}&h=${h}`,
  });
  const duration = await page.evaluate(() => window.DURATION);
  const cdp = await page.context().newCDPSession(page);
  const target = out('4-promo-video', file);
  const ff = spawn(
    FFMPEG,
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-framerate',
      String(fps),
      '-c:v',
      'mjpeg',
      '-i',
      '-',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-shortest',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '16',
      '-pix_fmt',
      'yuv420p',
      '-profile:v',
      'high',
      '-level',
      '4.2',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      target,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const done = new Promise((resolve) => ff.on('close', resolve));
  const n = Math.min(Math.round(duration * fps), maxFrames);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.render(t), i / fps);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 96,
      optimizeForSpeed: true,
    });
    if (!ff.stdin.write(Buffer.from(data, 'base64')))
      await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`video ${file}: frame ${i}/${n}`);
  }
  ff.stdin.end();
  await done;
  await page.close();
  console.log(`video: 4-promo-video/${file}`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--allow-file-access-from-files'], // lets the capture clean-up read local PNGs into a canvas
});
try {
  if (step === 'captures' || step === 'all' || !existsSync(path.join(HERE, 'captures')))
    await prepareCaptures(browser);
  if (step === 'icon' || step === 'all') await renderIcon();
  if (step === 'feature' || step === 'all') await renderFeature(browser);
  if (step === 'screens' || step === 'all') await renderScreens(browser);
  if (step === 'thumb' || step === 'all') await renderThumb(browser);
  if (['video', 'video:landscape', 'all'].includes(step))
    await renderVideo(browser, 1920, 1080, 'promo-video-1920x1080.mp4');
  if (['video', 'video:vertical', 'all'].includes(step))
    await renderVideo(browser, 1080, 1920, 'promo-video-vertical-1080x1920.mp4');
} finally {
  await browser.close();
}
