#!/usr/bin/env node
// A whole-product smoke run: scaffold a project with the built CLI, drive the
// dev server and its editor API over HTTP, build the static output, and check
// the failure paths. No browser and no network — see testbed/README.md for the
// manual pass that covers what only a browser can show.
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const CLI = join(repoRoot, 'packages/cli/dist/cli.js');

const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const VERBOSE = argv.includes('--verbose');
const only = (() => {
  const i = argv.indexOf('--only');
  return i === -1 ? null : new Set((argv[i + 1] ?? '').split(',').filter(Boolean));
})();

const PHASES = ['cli', 'dev', 'editor', 'build', 'host', 'capture', 'failures'];
// Later phases need what earlier ones set up, so `--only capture` still
// scaffolds and builds a project to capture.
const NEEDS = {
  cli: [],
  dev: ['cli'],
  editor: ['cli', 'dev'],
  build: ['cli'],
  host: ['cli', 'build'],
  capture: ['cli', 'build', 'host'],
  failures: ['cli'],
};
const selected = (() => {
  if (!only) return null;
  const out = new Set();
  const add = (phase) => {
    if (out.has(phase)) return;
    if (!NEEDS[phase]) {
      process.stderr.write(`unknown phase: ${phase} (known: ${PHASES.join(', ')})\n`);
      process.exit(2);
    }
    out.add(phase);
    for (const dep of NEEDS[phase]) add(dep);
  };
  for (const phase of only) add(phase);
  return out;
})();
const wanted = (phase) => !selected || selected.has(phase);

// ── tiny harness ────────────────────────────────────────────────────────────
const checks = [];
let currentPhase = 'cli';

function check(name, ok, detail) {
  checks.push({ phase: currentPhase, name, ok: Boolean(ok), detail });
  const mark = ok ? '\u001b[32m✓\u001b[0m' : '\u001b[31m✗\u001b[0m';
  process.stdout.write(`  ${mark} ${name}${!ok && detail ? `\n      ${String(detail).split('\n').join('\n      ')}` : ''}\n`);
  return Boolean(ok);
}

function phase(name, description) {
  currentPhase = name;
  process.stdout.write(`\n\u001b[1m${name}\u001b[0m — ${description}\n`);
}

function contains(haystack, needle, name) {
  return check(name, haystack.includes(needle), `missing ${JSON.stringify(needle)}`);
}

// ── helpers ─────────────────────────────────────────────────────────────────
async function cli(args, opts = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], {
      cwd: opts.cwd ?? repoRoot,
      env: { ...process.env, NO_COLOR: '1', ...opts.env },
      maxBuffer: 32 * 1024 * 1024,
    });
    if (VERBOSE) process.stdout.write(stdout);
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? String(err) };
  }
}

async function get(url, init) {
  const res = await fetch(url, init);
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}

async function json(url, init) {
  const res = await get(url, init);
  try {
    return { ...res, data: JSON.parse(res.body) };
  } catch {
    return { ...res, data: null };
  }
}

function fileSize(path) {
  try {
    return statSync(path).size;
  } catch {
    return -1;
  }
}

async function freePort() {
  const { createServer } = await import('node:net');
  const server = createServer();
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const { port } = server.address();
  await new Promise((res) => server.close(res));
  return port;
}

// A 1x1 transparent PNG, for the asset upload round trip.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// ── the run ─────────────────────────────────────────────────────────────────
const work = await mkdtemp(join(tmpdir(), 'interactive-demo-testbed-'));
const projectRoot = join(work, 'acme-product');
let devProc = null;

let hostProcRef = null;
process.on('exit', () => {
  if (devProc && !devProc.killed) devProc.kill('SIGTERM');
  if (hostProcRef && !hostProcRef.killed) hostProcRef.kill('SIGTERM');
});

try {
  process.stdout.write(`testbed: ${work}\n`);

  // ── phase: cli ────────────────────────────────────────────────────────────
  if (wanted('cli')) {
    phase('cli', 'the built binary, scaffolding and validation');

    check('packages/cli/dist/cli.js exists (run `npm run build` first)', existsSync(CLI));
    check(
      'the editor bundle is inside the CLI dist',
      existsSync(join(repoRoot, 'packages/cli/dist/editor/index.html')),
      'packages/cli/dist/editor/index.html is missing — `npm run build` builds the editor into the CLI',
    );

    const version = await cli(['version']);
    check('version exits 0', version.code === 0, version.stderr);
    check('version prints a semver', /\d+\.\d+\.\d+/.test(version.stdout), version.stdout);

    const help = await cli(['help']);
    for (const cmd of ['init', 'dev', 'validate', 'build', 'capture', 'publish']) {
      contains(help.stdout, cmd, `help lists \`${cmd}\``);
    }
    const captureHelp = await cli(['help', 'capture']);
    contains(captureHelp.stdout, 'capture start', 'help capture documents `capture start`');
    const unknown = await cli(['help', 'nope']);
    check('help for an unknown command exits 1', unknown.code === 1, unknown.stdout);

    const init = await cli(['init', 'acme-product'], { cwd: work });
    check('init exits 0', init.code === 0, init.stderr);
    for (const rel of [
      'interactive-demo.json',
      'package.json',
      'README.md',
      'demos/getting-started/demo.config.json',
    ]) {
      check(`init wrote ${rel}`, existsSync(join(projectRoot, rel)));
    }

    const added = await cli(['init', '--demo', 'onboarding'], { cwd: projectRoot });
    check('init --demo exits 0', added.code === 0, added.stderr);
    check(
      'init --demo wrote demos/onboarding/demo.config.json',
      existsSync(join(projectRoot, 'demos/onboarding/demo.config.json')),
    );

    const project = JSON.parse(readFileSync(join(projectRoot, 'interactive-demo.json'), 'utf8'));
    check('the project file lists both demos', project.demos?.length === 2, JSON.stringify(project.demos));

    const ids = ['getting-started', 'onboarding'].map(
      (slug) => JSON.parse(readFileSync(join(projectRoot, `demos/${slug}/demo.config.json`), 'utf8')).id,
    );
    check('each demo got its own id', ids[0] && ids[1] && ids[0] !== ids[1], ids.join(' / '));

    const validate = await cli(['validate', '--json', '--strict'], { cwd: projectRoot });
    check('validate --strict exits 0 on a fresh project', validate.code === 0, validate.stderr || validate.stdout);
    const report = JSON.parse(validate.stdout || '{}');
    check('validate reports 0 errors', (report.errors?.length ?? 0) === 0, JSON.stringify(report.errors));
  }

  // ── phase: dev ────────────────────────────────────────────────────────────
  let origin = null;
  if (wanted('dev') || wanted('editor')) {
    phase('dev', 'the preview server');

    const devPort = await freePort();
    devProc = spawn(process.execPath, [CLI, 'dev', '--port', String(devPort)], {
      cwd: projectRoot,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    const started = new Promise((resolveStart, rejectStart) => {
      const timer = setTimeout(() => rejectStart(new Error(`dev did not start in 30s:\n${log}`)), 30_000);
      devProc.stdout.on('data', (chunk) => {
        log += chunk;
        if (VERBOSE) process.stdout.write(chunk);
        const match = /running at (http:\/\/localhost:(\d+))\//.exec(log);
        if (match) {
          clearTimeout(timer);
          resolveStart(`http://127.0.0.1:${match[2]}`);
        }
      });
      devProc.stderr.on('data', (chunk) => {
        log += chunk;
        if (VERBOSE) process.stderr.write(chunk);
      });
      devProc.once('exit', (code) => {
        clearTimeout(timer);
        rejectStart(new Error(`dev exited with ${code}:\n${log}`));
      });
    });
    try {
      origin = await started;
    } catch (err) {
      check('dev starts and prints its URL', false, err.message);
      throw err;
    }
    check('dev starts and prints its URL', Boolean(origin), log);
    contains(log, 'editor:', 'dev prints the editor URL');

    const index = await get(`${origin}/`);
    check('GET / is 200', index.status === 200, String(index.status));
    contains(index.body, 'getting-started', 'the index lists the scaffolded demo');
    contains(index.body, 'onboarding', 'the index lists the added demo');

    const page = await get(`${origin}/getting-started/`);
    check('GET /<slug>/ is 200', page.status === 200, String(page.status));
    for (const marker of ['id="demo-config"', 'id="root"', 'player.js', 'player.css']) {
      contains(page.body, marker, `the demo page carries ${marker}`);
    }
    const configTag = /<script[^>]*id="demo-config"[^>]*>([\s\S]*?)<\/script>/.exec(page.body);
    let parsed = null;
    try {
      parsed = JSON.parse(configTag?.[1] ?? '');
    } catch {
      /* reported below */
    }
    check('#demo-config holds parseable JSON', parsed !== null, configTag?.[1]?.slice(0, 120));
    check('the served config has steps', (parsed?.steps?.length ?? 0) > 0);

    const inline = await get(`${origin}/getting-started/?embed=inline`);
    check('GET /<slug>/?embed=inline is 200', inline.status === 200, String(inline.status));
    check(
      'embed=inline serves the chrome-free page',
      inline.body.includes('embed=inline') || inline.body.length > 0,
    );

    for (const file of ['player.js', 'player.css']) {
      const res = await get(`${origin}/__demo/${file}`);
      check(`GET /__demo/${file} is 200`, res.status === 200, String(res.status));
      check(`/__demo/${file} is not empty`, res.body.length > 1000, `${res.body.length} bytes`);
    }

    const demos = await json(`${origin}/__demo/demos`);
    check('GET /__demo/demos returns JSON', demos.data !== null, demos.body.slice(0, 120));
    check(
      '/__demo/demos lists two demos',
      (demos.data?.demos?.length ?? demos.data?.length ?? 0) === 2,
      demos.body.slice(0, 200),
    );

    const missing = await get(`${origin}/no-such-demo/`);
    check('an unknown demo path is 404', missing.status === 404, String(missing.status));
  }

  // ── phase: editor ─────────────────────────────────────────────────────────
  if (wanted('editor') && origin) {
    phase('editor', 'the static bundle and its file/asset API');

    const shell = await get(`${origin}/__demo/editor/`);
    check('GET /__demo/editor/ is 200', shell.status === 200, String(shell.status));
    contains(shell.body.toLowerCase(), '<div id="root"', 'the editor shell mounts a root element');

    const api = `${origin}/__demo/editor/demos/getting-started`;

    const files = await json(`${api}/files`);
    check('GET …/files is 200', files.status === 200, String(files.status));
    check('…/files returns demo.config.json', Boolean(files.data?.files?.['demo.config.json']));

    // Edit through the API the way the editor does, then read the file on disk.
    const configPath = join(projectRoot, 'demos/getting-started/demo.config.json');
    const before = JSON.parse(readFileSync(configPath, 'utf8'));
    const edited = { ...before, subtitle: 'Edited by the testbed' };
    const put = await json(`${api}/files`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: { 'demo.config.json': `${JSON.stringify(edited, null, 2)}\n` } }),
    });
    check('PUT …/files is 200', put.status === 200, put.body);
    const after = JSON.parse(readFileSync(configPath, 'utf8'));
    check('the edit landed on disk', after.subtitle === 'Edited by the testbed', after.subtitle);
    check('the edit kept the demo id', after.id === before.id, `${before.id} → ${after.id}`);

    const assetsBefore = await json(`${api}/assets`);
    check('GET …/assets is 200', assetsBefore.status === 200, assetsBefore.body.slice(0, 120));

    const upload = await json(`${api}/assets?name=testbed.png&kind=image`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: ONE_PIXEL_PNG,
    });
    check('POST …/assets is 200', upload.status === 200, upload.body.slice(0, 200));
    const uploadedPath = join(projectRoot, 'demos/getting-started/assets/testbed.png');
    check('the uploaded file is on disk', existsSync(uploadedPath), uploadedPath);
    check(
      'the upload reports a project-relative path',
      upload.data?.asset?.path === 'assets/testbed.png',
      upload.data?.asset?.path,
    );

    const served = await get(`${origin}/getting-started/assets/testbed.png`);
    check('the dev server serves the uploaded asset', served.status === 200, String(served.status));

    const del = await json(`${api}/assets?name=testbed.png`, { method: 'DELETE' });
    check('DELETE …/assets is 200', del.status === 200, del.body.slice(0, 120));
    check('the file is gone from disk', !existsSync(uploadedPath));

    const embed = await json(`${api}/embed`);
    check('GET …/embed is 200', embed.status === 200, embed.body.slice(0, 120));
    const snippets = JSON.stringify(embed.data ?? {});
    contains(snippets, '<iframe', 'the embed endpoint returns an inline iframe snippet');
    contains(snippets, 'embed.js', 'the embed endpoint returns the pop-up loader snippet');
    contains(snippets, 'InteractiveDemo', 'the pop-up snippet calls the InteractiveDemo global');

    const badSlug = await json(`${origin}/__demo/editor/demos/nope/files`);
    check('the API 404s on an unknown demo', badSlug.status === 404, String(badSlug.status));
    const traversal = await json(`${api}/assets?name=../escape.png`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: ONE_PIXEL_PNG,
    });
    check('the API rejects a traversing asset name', traversal.status === 400, String(traversal.status));
  }

  if (devProc) {
    devProc.kill('SIGTERM');
    await once(devProc, 'exit');
    devProc = null;
  }

  // ── phase: build ──────────────────────────────────────────────────────────
  if (wanted('build')) {
    phase('build', 'the static output');

    const build = await cli(['build'], { cwd: projectRoot });
    check('build exits 0', build.code === 0, build.stderr);

    const dist = join(projectRoot, 'dist');
    for (const rel of [
      'getting-started/index.html',
      'getting-started/player.js',
      'getting-started/player.css',
      'onboarding/index.html',
      'embed.js',
    ]) {
      check(`build wrote dist/${rel}`, existsSync(join(dist, rel)));
    }
    check('dist/embed.js is a small loader', fileSize(join(dist, 'embed.js')) < 20_000, `${fileSize(join(dist, 'embed.js'))} bytes`);

    const html = readFileSync(join(dist, 'getting-started/index.html'), 'utf8');
    for (const marker of ['id="demo-config"', 'id="root"', 'player.js', 'player.css']) {
      contains(html, marker, `the built page carries ${marker}`);
    }
    check('no absolute /__demo/ URLs leak into the build', !html.includes('"/__demo/'), 'found an absolute /__demo/ URL');
    const built = JSON.parse(/<script[^>]*id="demo-config"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? 'null');
    check('the built config parses', built !== null);
    check(
      'media stays a relative assets/ path',
      JSON.stringify(built ?? {}).includes('assets/') && !JSON.stringify(built ?? {}).includes('asset:'),
    );

    const assetsDir = join(dist, 'getting-started/assets');
    check('the build copied the referenced assets', existsSync(assetsDir) && readdirSync(assetsDir).length > 0);

    const outFlag = await cli(['build', '--out', 'public'], { cwd: projectRoot });
    check('build --out <dir> exits 0', outFlag.code === 0, outFlag.stderr);
    check('build --out wrote public/getting-started/index.html', existsSync(join(projectRoot, 'public/getting-started/index.html')));
  }


  // ── phase: host + capture ─────────────────────────────────────────────────
  // The host page serves the build the way a real site would; `capture` then
  // records a click-through of it headlessly, which is the same path the
  // headed capture takes with a person doing the clicking.
  let hostProc = null;
  let hostOrigin = null;
  if (wanted('host') || wanted('capture')) {
    phase('host', 'the stand-in website that embeds the build');

    const hostPort = await freePort();
    hostProc = spawn(
      process.execPath,
      [join(repoRoot, 'testbed/host/serve.mjs'), '--dist', join(projectRoot, 'dist'), '--port', String(hostPort)],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    hostProcRef = hostProc;
    let hostLog = '';
    hostProc.stdout.on('data', (c) => {
      hostLog += c;
      if (VERBOSE) process.stdout.write(c);
    });
    hostProc.stderr.on('data', (c) => {
      hostLog += c;
    });
    let hostUp = false;
    try {
      await Promise.race([
        new Promise((resolveUp) => {
          const timer = setInterval(() => {
            if (hostLog.includes('testbed host running')) {
              clearInterval(timer);
              resolveUp();
            }
          }, 100);
        }),
        new Promise((_, rejectUp) => setTimeout(() => rejectUp(new Error(hostLog)), 15_000)),
      ]);
      hostUp = true;
    } catch (err) {
      check('the host server starts', false, err.message);
    }
    if (hostUp) hostOrigin = `http://127.0.0.1:${hostPort}`;

    const page = hostOrigin ? await get(`${hostOrigin}/`) : { status: 0, body: '' };
    check('the host page is 200', page.status === 200, String(page.status));
    contains(page.body, 'window.__testbed', 'the host page gets its demo list injected');
    contains(page.body, 'getting-started', 'the injected list names the built demo');

    const embed = await get(`${hostOrigin}/embed.js`);
    check('the host serves embed.js from the build', embed.status === 200, String(embed.status));
    contains(embed.body, 'InteractiveDemo', 'embed.js installs the InteractiveDemo global');

    const framed = await get(`${hostOrigin}/demo/getting-started/?embed=inline`);
    check('the host serves the demo page', framed.status === 200, String(framed.status));

    const posted = await json(`${hostOrigin}/api/form`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'testbed@example.com' }),
    });
    check('the host accepts a form submission', posted.data?.ok === true, posted.body.slice(0, 120));
    const stored = await json(`${hostOrigin}/api/submissions`);
    check(
      'the submission is readable back',
      stored.data?.submissions?.[0]?.payload?.email === 'testbed@example.com',
      stored.body.slice(0, 200),
    );
  }

  if (wanted('capture') && hostOrigin) {
    phase('capture', 'a headless click-through recorded into a demo');

    const captureOut = join(work, 'captured');
    const start = await cli(
      [
        'capture',
        'start',
        `${hostOrigin}/`,
        '--headless',
        '--name',
        'Testbed capture',
        '--window-size',
        '1280x800',
        '--no-video',
      ],
      { cwd: projectRoot },
    );
    if (start.code !== 0) {
      check('capture start exits 0 (needs Chrome on this machine)', false, `${start.stderr}${start.stdout}`.slice(0, 400));
    } else {
      const session = JSON.parse(start.stdout);
      check('capture start arms the recorder', session.capture?.listenerReadyAt != null, start.stdout.slice(0, 200));

      const { attach } = await import('./lib/cdp.mjs');
      const tab = await attach(session.browser.webSocketDebuggerUrl, session.tab.targetId);
      try {
        // Two clicks on different screens: the pop-up button, then the
        // overlay's close. Each click the recorder sees becomes one step.
        await tab.evaluate("document.getElementById('popup')?.scrollIntoView({ block: 'center' }); 1");
        await new Promise((r) => setTimeout(r, 600));
        const button = await tab.centerOf('#popup');
        check('the capture tab rendered the host page', button != null, 'no #popup button in the page');
        if (button) await tab.click(button.x, button.y, 2500);
        const opened = await tab.evaluate("!!document.getElementById('interactive-demo-embed-root')");
        check('the recorded click opened the pop-up', opened === true);
        await tab.click(40, 40, 1500);
      } finally {
        tab.close();
      }

      const stop = await cli(['capture', 'stop', '--session', session.session.id, '--out', captureOut], {
        cwd: projectRoot,
      });
      check('capture stop exits 0', stop.code === 0, stop.stderr);
      const output = stop.code === 0 ? JSON.parse(stop.stdout).output : null;
      check('capture wrote at least one step', (output?.stepCount ?? 0) >= 1, stop.stdout.slice(0, 300));
      const capturedDir = output?.demoDir;
      check('capture wrote demo.config.json', capturedDir && existsSync(join(capturedDir, 'demo.config.json')));
      const shots = capturedDir && existsSync(join(capturedDir, 'assets')) ? readdirSync(join(capturedDir, 'assets')) : [];
      check('capture wrote screenshots into assets/', shots.length >= 1, shots.join(', '));

      if (capturedDir) {
        const captured = JSON.parse(readFileSync(join(capturedDir, 'demo.config.json'), 'utf8'));
        check('the captured config has an id', typeof captured.id === 'string' && captured.id.length > 0);
        check(
          'captured steps reference assets/ by path',
          JSON.stringify(captured).includes('assets/') && !JSON.stringify(captured).includes('asset:'),
        );
        // A captured demo must drop straight into a project and validate.
        const imported = await cli(['init', '--demo', 'captured', '--from', capturedDir], { cwd: projectRoot });
        check('init --demo --from imports a captured demo', imported.code === 0, imported.stderr);
        const afterImport = await cli(['validate', '--strict'], { cwd: projectRoot });
        check('the imported capture validates', afterImport.code === 0, afterImport.stdout || afterImport.stderr);
      }

      const status = await cli(['capture', 'status', '--session', session.session.id], { cwd: projectRoot });
      check('capture status reports the finished session is gone', status.code === 1, status.stdout.slice(0, 200));
    }
  }

  if (hostProc) {
    hostProc.kill('SIGTERM');
    await once(hostProc, 'exit').catch(() => undefined);
    hostProc = null;
  }

  // ── phase: failures ───────────────────────────────────────────────────────
  if (wanted('failures')) {
    phase('failures', 'the paths that should fail cleanly');

    const publish = await cli(['publish', '--demo', 'getting-started'], {
      cwd: projectRoot,
      env: { INTERACTIVE_DEMO_API_TOKEN: '', HOME: work },
    });
    check('publish without credentials exits 1', publish.code === 1, String(publish.code));
    const publishOut = `${publish.stdout}${publish.stderr}`;
    check('publish says how to log in', /log in|login/i.test(publishOut), publishOut.slice(0, 200));
    check('publish does not print a stack trace', !publishOut.includes('    at '), publishOut.slice(0, 300));

    const status = await cli(['login', '--status', '--json'], { cwd: projectRoot, env: { HOME: work } });
    check('login --status --json prints JSON', (() => {
      try {
        JSON.parse(status.stdout);
        return true;
      } catch {
        return false;
      }
    })(), status.stdout.slice(0, 200));

    // A config that references a file that isn't there must fail validation.
    const brokenDir = join(projectRoot, 'demos/onboarding');
    const brokenPath = join(brokenDir, 'demo.config.json');
    const good = readFileSync(brokenPath, 'utf8');
    const broken = JSON.parse(good);
    const step = broken.steps?.find((s) => s.background);
    if (step) step.background.src = 'assets/does-not-exist.png';
    const { writeFileSync } = await import('node:fs');
    writeFileSync(brokenPath, `${JSON.stringify(broken, null, 2)}\n`);
    const missingAsset = await cli(['validate'], { cwd: projectRoot });
    check('validate fails on a missing media file', missingAsset.code === 1, missingAsset.stdout);
    contains(`${missingAsset.stdout}${missingAsset.stderr}`, 'does-not-exist.png', 'validate names the missing file');

    // An `asset:<id>` pointer is the old authoring format and must be rejected.
    if (step) step.background.src = 'asset:legacyPointer';
    writeFileSync(brokenPath, `${JSON.stringify(broken, null, 2)}\n`);
    const pointer = await cli(['validate'], { cwd: projectRoot });
    check('validate rejects a legacy asset: pointer', pointer.code === 1, pointer.stdout);

    writeFileSync(brokenPath, good);
    const healed = await cli(['validate', '--strict'], { cwd: projectRoot });
    check('validate passes again once restored', healed.code === 0, healed.stdout || healed.stderr);

    const badPort = await cli(['dev', '--port', '99999'], { cwd: projectRoot });
    check('dev rejects an out-of-range port', badPort.code === 1, badPort.stdout);
  }
} finally {
  if (devProc && !devProc.killed) {
    devProc.kill('SIGTERM');
    await once(devProc, 'exit').catch(() => undefined);
  }
  if (KEEP) {
    process.stdout.write(`\nkept: ${projectRoot}\n`);
  } else {
    await rm(work, { recursive: true, force: true });
  }
}

// ── summary ─────────────────────────────────────────────────────────────────
const failed = checks.filter((c) => !c.ok);
process.stdout.write('\n\u001b[1msummary\u001b[0m\n');
for (const name of PHASES) {
  const inPhase = checks.filter((c) => c.phase === name);
  if (inPhase.length === 0) continue;
  const bad = inPhase.filter((c) => !c.ok).length;
  process.stdout.write(`  ${bad === 0 ? '\u001b[32mpass\u001b[0m' : '\u001b[31mfail\u001b[0m'}  ${name.padEnd(10)} ${inPhase.length - bad}/${inPhase.length}\n`);
}
process.stdout.write(`\n${checks.length - failed.length}/${checks.length} checks passed\n`);
if (failed.length > 0) {
  process.stdout.write('\nfailed:\n');
  for (const c of failed) process.stdout.write(`  - [${c.phase}] ${c.name}\n`);
}
process.exit(failed.length === 0 ? 0 : 1);
