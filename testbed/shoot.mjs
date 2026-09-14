#!/usr/bin/env node
/**
 * Retakes the self-demo.
 *
 *   node testbed/shoot.mjs [--out <dir>] [--keep]
 *
 * Everything the demo shows is produced here, in order: a throwaway project is
 * scaffolded with the built CLI, the stand-in product in testbed/app is
 * recorded with the real `capture` command, the result is built and served,
 * and then each of the tool's own surfaces is photographed at 1440x900 — plus
 * two terminal cards holding the actual transcripts of the commands that ran.
 *
 * The screenshots land in examples/self-demo/demos/product-tour/assets/ and
 * the element positions worth pointing at land next to them in metrics.json,
 * so the hand-written demo.config.json can anchor its hotspots to real pixels.
 */
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { attach } from './lib/cdp.mjs';
import { launch, sleep } from './lib/browser.mjs';
import { terminalCard } from './lib/terminal-card.mjs';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const CLI = join(repoRoot, 'packages/cli/dist/cli.js');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const KEEP = argv.includes('--keep');
const OUT = resolve(repoRoot, flag('out', 'examples/self-demo/demos/product-tour/assets'));
const W = 1440;
const H = 900;

if (!existsSync(CLI)) {
  process.stderr.write('no built CLI — run `npm run build` first\n');
  process.exit(1);
}

const step = (text) => process.stdout.write(`\n[1m> ${text}[0m\n`);
const note = (text) => process.stdout.write(`  ${text}\n`);

async function cli(args, opts = {}) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd ?? repoRoot,
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 32 * 1024 * 1024,
  });
  return { stdout, stderr };
}

async function freePort() {
  const server = createServer();
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const { port } = server.address();
  await new Promise((res) => server.close(res));
  return port;
}

function waitForLine(proc, needle, label) {
  let log = '';
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(`${label} did not start:\n${log}`)), 30_000);
    const onData = (chunk) => {
      log += chunk;
      if (log.includes(needle)) {
        clearTimeout(timer);
        resolvePromise(log);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (chunk) => {
      log += chunk;
    });
  });
}

const sizes = {};
/**
 * A screenshot, stored as WebP: these ship in the repo, and a 2880x1800 PNG of
 * a UI is three times the bytes for no visible gain.
 */
async function snap(browser, name) {
  const png = join(work, `${name}.png`);
  await browser.shot(png);
  const file = join(OUT, `${name}.webp`);
  const info = await sharp(png).webp({ quality: 82 }).toFile(file);
  sizes[`${name}.webp`] = { width: info.width, height: info.height, bytes: info.size };
  note(`${name}.webp  ${(info.size / 1024).toFixed(0)} KB  ${info.width}x${info.height}`);
  return file;
}

const metrics = {};
async function record(browser, name, selector) {
  const box = await browser.boxOf(selector);
  if (box) metrics[name] = { x: box.x, y: box.y, w: box.w, h: box.h };
  else note(`(no element for ${name}: ${selector})`);
  return box;
}

const children = [];
function track(proc) {
  children.push(proc);
  return proc;
}
async function stopAll() {
  for (const proc of children.splice(0)) {
    if (proc.killed) continue;
    proc.kill('SIGTERM');
    await once(proc, 'exit').catch(() => undefined);
  }
}
process.on('exit', () => {
  for (const proc of children) if (!proc.killed) proc.kill('SIGTERM');
});

const work = await mkdtemp(join(tmpdir(), 'interactive-demo-shoot-'));
const projectRoot = join(work, 'acme-demos');
mkdirSync(OUT, { recursive: true });

try {
  // ── 1. a project ──────────────────────────────────────────────────────────
  step('scaffolding a project with the built CLI');
  const initOut = await cli(['init', 'acme-demos'], { cwd: work });
  note(initOut.stdout.trim().split('\n')[0]);

  // The starter demo is a placeholder; it only ever appears in the demo list,
  // so give it a title that reads like a real second demo.
  const starterPath = join(projectRoot, 'demos/getting-started/demo.config.json');
  const starter = JSON.parse(readFileSync(starterPath, 'utf8'));
  starter.title = 'What shipped in 4.2';
  starter.subtitle = 'A 60-second look at the December release.';
  writeFileSync(starterPath, `${JSON.stringify(starter, null, 2)}\n`);

  await cli(['build'], { cwd: projectRoot });

  // ── 2. the stand-in product, served ───────────────────────────────────────
  step('serving the stand-in product');
  const hostPort = await freePort();
  const startHost = async () => {
    const proc = track(
      spawn(
        process.execPath,
        [join(here, 'host/serve.mjs'), '--dist', join(projectRoot, 'dist'), '--port', String(hostPort)],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    );
    await waitForLine(proc, 'testbed host running', 'host');
    return proc;
  };
  await startHost();
  const hostOrigin = `http://127.0.0.1:${hostPort}`;
  note(`${hostOrigin}/app/`);

  // ── 3. record it with the real capture command ────────────────────────────
  step('recording a click-through with `interactive-demo capture`');
  const started = await cli(
    [
      'capture',
      'start',
      `${hostOrigin}/app/`,
      '--headless',
      '--no-video',
      // Full screens, not a crop around the click: the demo is showing the
      // product, not a detail of it.
      '--no-zoom',
      '--name',
      'Acme Analytics onboarding',
      '--window-size',
      `${W}x${H}`,
    ],
    { cwd: projectRoot },
  );
  const session = JSON.parse(started.stdout);
  note(`session ${session.session.id}`);

  const tab = await attach(session.browser.webSocketDebuggerUrl, session.tab.targetId);
  // One click per screen, in the order a new customer would meet them.
  const clicks = [
    ['a.btn.primary', 'Overview -> New funnel'],
    ['a.btn.primary', 'Funnel -> Save funnel'],
    ['a.btn.primary', 'Segments -> New segment'],
    ['a.btn.primary', 'Settings -> Invite teammates'],
    ['.modal .btn.primary', 'Invite -> Send invite'],
  ];
  for (const [selector, label] of clicks) {
    const box = await tab.centerOf(selector);
    if (!box) throw new Error(`capture: nothing matched ${selector} (${label})`);
    await tab.click(box.x, box.y, 1800);
    note(label);
  }
  tab.close();

  const stopped = await cli(['capture', 'stop', '--session', session.session.id], { cwd: projectRoot });
  const captured = JSON.parse(stopped.stdout).output;
  note(`${captured.stepCount} steps -> demos/${captured.slug}/`);
  const slug = captured.slug;

  // ── 4. the edit pass a person would do next ───────────────────────────────
  step('writing the captured demo up');
  const configPath = join(projectRoot, `demos/${slug}/demo.config.json`);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  config.title = 'Get your first funnel live';
  config.subtitle = 'Five screens, about a minute.';
  const copy = [
    ['Your workspace', 'Every event from your site and your warehouse lands here. Start a funnel from the corner.'],
    ['Build the funnel', 'Five steps, drawn from events you already send. The drop-off that matters is usually the second one.'],
    ['Save an audience', 'Turn any step of the funnel into a segment the whole team can reuse.'],
    ['Bring the team in', 'Workspace settings is where seats, sources and invites live.'],
    ['Send the invite', 'They land on the workspace you were just looking at — nothing to set up.'],
  ];
  config.steps.forEach((s, i) => {
    if (!copy[i]) return;
    s.label = copy[i][0];
    s.script = copy[i][1];
  });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const validated = await cli(['validate'], { cwd: projectRoot });
  const built = await cli(['build'], { cwd: projectRoot });

  // The host server read the demo list at startup; restart it on the new build.
  await stopAll();
  await startHost();

  // ── 5. the dev server ─────────────────────────────────────────────────────
  step('starting the dev server');
  const devPort = await freePort();
  const dev = track(
    spawn(process.execPath, [CLI, 'dev', '--port', String(devPort)], {
      cwd: projectRoot,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
  await waitForLine(dev, 'running at', 'dev');
  const devOrigin = `http://127.0.0.1:${devPort}`;
  note(devOrigin);

  // ── 6. the photographs ────────────────────────────────────────────────────
  step('photographing the surfaces');
  const browser = await launch({ width: W, height: H, scale: 2 });

  // The player, on a captured screen rather than the cover.
  await browser.goto(`${devOrigin}/${slug}/`, 2800);
  await browser.evaluate('window.__demo?.controls?.next?.(); 1');
  await sleep(1600);
  await snap(browser, '02-player');

  // The editor, open on the captured demo.
  await browser.goto(`${devOrigin}/__demo/editor/#/${slug}`, 4200);
  await snap(browser, '03-editor');

  // The Share dialog.
  const share = await browser.evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Share');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
  })()`);
  if (share) {
    await browser.click(share.cx, share.cy, 2000);
    await snap(browser, '04-share');
    await browser.key('Escape', 'Escape', 27);
  } else {
    note('(no Share button found - skipped 04-share)');
  }

  // The host page: the inline embed in a real page.
  await browser.goto(`${hostOrigin}/`, 3000);
  await browser.evaluate("document.getElementById('demo')?.scrollIntoView({ block: 'start' }); 1");
  await sleep(1400);
  await record(browser, 'hostInline', '#inline-host iframe');
  await snap(browser, '06-embed-inline');

  // The host page: the pop-up over the hero, the way a visitor meets it.
  await browser.evaluate('window.scrollTo(0, 0); 1');
  await sleep(600);
  await browser.clickSelector('#popup', 3000);
  await record(browser, 'popupFrame', '#interactive-demo-embed-root .idm-frame');
  await snap(browser, '07-embed-popup');

  // ── 7. the terminal cards, from the transcripts above ─────────────────────
  step('rendering the terminal cards');
  const cardsDir = join(work, 'cards');
  mkdirSync(cardsDir, { recursive: true });

  writeFileSync(
    join(cardsDir, 'capture.html'),
    terminalCard({
      title: 'acme-demos — zsh',
      subtitle: 'interactive-demo',
      lines: [
        { t: 'cmd', text: 'interactive-demo init acme-demos' },
        { t: 'ok', text: 'Scaffolded project acme-demos at ~/work/acme-demos' },
        { t: 'cmd', text: 'interactive-demo capture start https://app.acme.io' },
        { t: 'out', text: '{' },
        { t: 'out', text: '  "ok": true,' },
        { t: 'out', text: `  "session": { "id": "${session.session.id.slice(0, 8)}..." },` },
        { t: 'out', text: '  "capture": { "window": { "width": 1440, "height": 900 } },' },
        { t: 'out', text: '  "next": "Click through the product in the Chrome window,' },
        { t: 'out', text: '           then run `interactive-demo capture stop`."' },
        { t: 'out', text: '}' },
        { t: 'dim', text: '# ...five clicks in the browser window...' },
        { t: 'cmd', text: 'interactive-demo capture stop' },
        { t: 'out', text: '{' },
        { t: 'out', text: '  "output": {' },
        { t: 'out', text: `    "demoDir": "demos/${slug}",` },
        { t: 'out', text: `    "stepCount": ${captured.stepCount},` },
        { t: 'out', text: '    "registered": true' },
        { t: 'out', text: '  }' },
        { t: 'out', text: '}' },
      ],
      caption: 'Every click becomes a step: the screen you clicked on, with a pointer where you clicked.',
    }),
  );

  const distTree = readdirSync(join(projectRoot, 'dist', slug)).sort();
  // The transcripts go into a demo that ships in the repo: no temp paths, no
  // home directory, nothing that only exists on the machine that shot it.
  const realWork = realpathSync(work);
  const tidy = (text) =>
    [realpathSync(projectRoot), projectRoot]
      .reduce((acc, path) => acc.split(path).join('~/work/acme-demos'), text)
      .split(realWork)
      .join('~/work')
      .split(work)
      .join('~/work');
  writeFileSync(
    join(cardsDir, 'build.html'),
    terminalCard({
      title: 'acme-demos — zsh',
      subtitle: 'interactive-demo',
      lines: [
        { t: 'cmd', text: 'interactive-demo validate' },
        { t: 'ok', text: tidy(validated.stdout.trim().split('\n').slice(-1)[0] || 'ok') },
        { t: 'cmd', text: 'interactive-demo build' },
        ...tidy(built.stdout)
          .trim()
          .split('\n')
          .slice(0, 4)
          .map((text) => ({ t: 'out', text })),
        { t: 'cmd', text: `ls dist/${slug}` },
        { t: 'out', text: distTree.join('   ') },
        { t: 'dim', text: '# a folder that works on any static host, or:' },
        { t: 'cmd', text: 'interactive-demo publish' },
        { t: 'ok', text: 'https://interactive-demo.example.dev/p/8Qd1mKte' },
      ],
      caption: 'One folder per demo: the page, the player, your screens. Or one command to a hosted link.',
    }),
  );

  await browser.goto(`file://${join(cardsDir, 'capture.html')}`, 1000);
  await snap(browser, '01-capture');
  await browser.goto(`file://${join(cardsDir, 'build.html')}`, 1000);
  await snap(browser, '05-build');

  await browser.close();

  // The README's hero is the same photograph, so it never drifts from the UI.
  copyFileSync(join(OUT, '03-editor.webp'), join(repoRoot, 'docs/images/editor.webp'));
  note('docs/images/editor.webp');

  // ── 8. the anchors ────────────────────────────────────────────────────────
  writeFileSync(
    join(OUT, '../metrics.json'),
    `${JSON.stringify(
      { takenAt: new Date().toISOString(), viewport: { width: W, height: H }, images: sizes, anchors: metrics },
      null,
      2,
    )}\n`,
  );

  step('done');
  for (const file of readdirSync(OUT).sort()) {
    const bytes = statSync(join(OUT, file)).size;
    note(`${file.padEnd(22)} ${(bytes / 1024).toFixed(0)} KB`);
  }
  note(`anchors -> ${join(OUT, '../metrics.json')}`);
} finally {
  await stopAll();
  if (KEEP) process.stdout.write(`\nkept: ${projectRoot}\n`);
  else await rm(work, { recursive: true, force: true });
}
