// Screenshot the visual harness with a locally installed Chromium (Chrome or Edge), headless.
// No dependencies. Usage:
//   node scripts/visual-shot.mjs <out.png> '<query>' [--width=1180] [--height=560] [--port=5178]
//   node scripts/visual-shot.mjs out/ab.png 'a={"blurStage":"after"}&b={"blurStage":"before"}&base={"blur":1.5}'
// Needs `npm run dev -- --port 5178` (or --port) running. Waits for the page to mark itself
// data-ready via a virtual-time budget; raise --budget if large maps are still encoding.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const [out, query = ''] = positional;
if (!out) {
  console.error('usage: node scripts/visual-shot.mjs <out.png> [query] [--width=] [--height=] [--port=] [--budget=ms] [--browser=path]');
  process.exit(2);
}
const width = Number(flag('width', 1180));
const height = Number(flag('height', 560));
const port = flag('port', '5178');
const budget = flag('budget', '8000');

const candidates = [
  flag('browser', ''),
  process.env.LIQUID_GLASS_BROWSER ?? '',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) {
  console.error('No Chromium-based browser found. Pass --browser=<path> or set LIQUID_GLASS_BROWSER.');
  process.exit(2);
}

const url = `http://localhost:${port}/visual.html${query ? `?${query}` : ''}`;
const outPath = resolve(out);
mkdirSync(dirname(outPath), { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'lg-shot-'));

const result = spawnSync(
  browser,
  [
    '--headless=new',
    `--screenshot=${outPath}`,
    `--window-size=${width},${height}`,
    `--virtual-time-budget=${budget}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--enable-unsafe-swiftshader',
    `--user-data-dir=${profile}`,
    url,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 },
);
rmSync(profile, { recursive: true, force: true });

if (result.status !== 0 || !existsSync(outPath)) {
  console.error(`screenshot failed (exit ${result.status})\n${result.stderr?.toString().slice(-2000)}`);
  process.exit(1);
}
console.log(`${outPath}\n  ${url}\n  browser: ${browser}`);
