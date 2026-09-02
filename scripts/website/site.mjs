// site.mjs — RUN the isolated (podman) docs-website environment. Port of the former
// scripts/website/site.sh. The image lifecycle lives in scripts/container/image.mjs
// (imported here for `ensure`); this module only RUNS the site in that shared image.
//
// The website's source (app/ sites/ public/ server/ scripts/) is bind-mounted so
// edits hot-reload; config + node_modules come from the image. You cannot run the
// site on the host.
//
// ONE install, TWO sites: MION_SITE (runtypes | mion) picks the content tree, the
// app.config and the public assets, and is forwarded into the container. Build
// output lands per site at container/website/.output/<site>.
//
// Commands: dev [--isAgent] | build | generate | smoke | verify-docs | shell.
// TTY commands (dev/build/generate/shell) run podman with stdio inherited so SIGINT
// (Ctrl-C) reaches the container via the shared process group and --rm cleans up.
// smoke/verify-docs boot a detached server and probe it FROM INSIDE the container
// (podman exec + the image's own node fetch), removing the container on
// exit/SIGINT/SIGTERM. The in-container `sh -c '…'` blocks stay shell (they run
// inside the Linux container, which always has sh).

import {existsSync, globSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {ensureImage} from '../container/image.mjs';
import {loadEnv, REPO_ROOT, SITES} from '../lib/env.mjs';
import {requireEngine} from '../lib/engine.mjs';
import {capture, die, note, reportCliError, run, runAsync, sleep, warn, which} from '../lib/proc.mjs';

const WEBSITE_DIR = join(REPO_ROOT, 'container/website');
// Source directories bind-mounted into /app (host is the source of truth).
// `sites/` holds the per-site trees (content, public assets, app.config, logo);
// MION_SITE picks one — see container/website/site.config.ts.
const MOUNT_DIRS = ['app', 'sites', 'public', 'server', 'scripts', 'tests'];
// Config files bind-mounted into /app (first-party, NOT baked into the image).
const MOUNT_FILES = ['nuxt.config.ts', 'content.config.ts', 'site.config.ts', 'tsconfig.json', 'eslint.config.mjs'];
export {SITES};
// Third-party packages the twoslash VFS mounts so example imports type-resolve.
// Deliberately a NAMED allowlist rather than the whole node_modules tree: it keeps
// the container's read-only view of the repo as small as the packages/ mount is.
// Must match `externalDeps` in container/website/server/api/twoslash.post.ts.
const TWOSLASH_EXTERNAL_DEPS = ['drizzle-orm'];

// Repo context: the checkout that contains packages/ (first-party source + built
// .d.ts). This repo carries packages/examples, so prefer it; only fall back to a
// sibling ../mion checkout for a legacy split layout.
function defaultRepoContext() {
  if (existsSync(join(REPO_ROOT, 'packages/examples'))) return REPO_ROOT;
  if (existsSync(join(REPO_ROOT, '../mion/packages'))) return realpathSync(join(REPO_ROOT, '..', 'mion'));
  return REPO_ROOT;
}

// Env-dependent config, read fresh (matches lib.sh + site.sh's var block).
function config(env = process.env) {
  const containerBase = env.MION_WEBSITE_CONTAINER || 'tsrt-website';
  // Which of the two sites to serve/build. The container reads it too (envArgs).
  const site = env.MION_SITE || 'runtypes';
  if (!SITES.includes(site)) die(`site: MION_SITE must be one of ${SITES.join(' | ')}, got '${site}'`);
  // Watcher polling: bind mounts on macOS deliver no native fs events, so default
  // it on there; Linux passes events through natively. Override with MION_WEBSITE_POLL.
  let poll = env.MION_WEBSITE_POLL;
  if (poll === undefined || poll === '') poll = process.platform === 'darwin' ? '1' : '0';
  return {
    engine: env.MION_WEBSITE_ENGINE || 'podman',
    image: env.MION_WEBSITE_IMAGE || 'tsrt-website:dev',
    containerBase,
    mountOpts: env.MION_WEBSITE_MOUNT_OPTS || '',
    port: env.MION_WEBSITE_PORT || '3000',
    agentPort: env.MION_WEBSITE_AGENT_PORT || '3100',
    agentIdle: env.MION_WEBSITE_AGENT_IDLE_SECONDS || '300',
    poll,
    runNetwork: env.MION_WEBSITE_RUN_NETWORK || '',
    repoContext: env.MION_WEBSITE_REPO_CONTEXT || defaultRepoContext(),
    docdataDir: env.MION_WEBSITE_DOCDATA || join(REPO_ROOT, '.docdata'),
    skipPlayground: env.MION_WEBSITE_SKIP_PLAYGROUND === '1',
    smokeTimeout: env.MION_WEBSITE_SMOKE_TIMEOUT || '',
    site,
    // The parallel two-site build (build.mjs --parallel): the build container's
    // output is piped + line-prefixed with the site name instead of inherited, and
    // the vite/nitro cache volume is per site so two concurrent builds never write
    // the same cache files.
    parallel: env.MION_WEBSITE_PARALLEL === '1',
    // Build state is PER SITE: .nuxt holds the site's generated scaffolding and
    // .data the Nuxt Content SQLite database. Sharing them across sites would let
    // one site's pages leak into the other's build.
    volNuxt: `${containerBase}-nuxt-${site}`,
    volData: `${containerBase}-data-${site}`,
    volCache: env.MION_WEBSITE_PARALLEL === '1' ? `${containerBase}-cache-${site}` : `${containerBase}-cache`,
  };
}

/** Host dir the built site is copied to: container/website/.output/<site>. */
export const outputDir = (site) => join(WEBSITE_DIR, '.output', site);

// The bind-mount + named-volume `-v …` args for `run`.
function mountArgs(cfg) {
  const args = [];
  for (const dir of MOUNT_DIRS) {
    if (existsSync(join(WEBSITE_DIR, dir))) args.push('-v', `${join(WEBSITE_DIR, dir)}:/app/${dir}${cfg.mountOpts}`);
  }
  for (const file of MOUNT_FILES) {
    if (existsSync(join(WEBSITE_DIR, file))) args.push('-v', `${join(WEBSITE_DIR, file)}:/app/${file}:ro${cfg.mountOpts}`);
  }
  // Repo context, READ-ONLY: only packages/ is exposed, never the repo root, so
  // code-import/twoslash can read first-party code + types but nothing else.
  // MION_REPO_ROOT=/repo-context (see envArgs). Third-party .d.ts come in one dir at a
  // time through TWOSLASH_EXTERNAL_DEPS below, never as a whole node_modules tree.
  if (existsSync(join(cfg.repoContext, 'packages'))) args.push('-v', `${join(cfg.repoContext, 'packages')}:/repo-context/packages:ro${cfg.mountOpts}`);
  // docs/ holds the specs a content page inlines with <markdown-import>. Without
  // this mount the import fails inside the container ("Document not readable").
  // What a page may publish is still decided by the IMPORTABLE_DOCS allowlist in
  // server/utils/repo-root.ts, never by the mount.
  if (existsSync(join(cfg.repoContext, 'docs'))) args.push('-v', `${join(cfg.repoContext, 'docs')}:/repo-context/docs:ro${cfg.mountOpts}`);
  // One dir per third-party package the twoslash VFS needs, never node_modules itself.
  for (const dep of TWOSLASH_EXTERNAL_DEPS) {
    const depDir = join(cfg.repoContext, 'node_modules', dep);
    if (existsSync(depDir)) args.push('-v', `${realpathSync(depDir)}:/repo-context/node_modules/${dep}:ro${cfg.mountOpts}`);
  }
  // Generated benchmark/test results the docs read (MION_DOCDATA=/app/.docdata).
  mkdirSync(cfg.docdataDir, {recursive: true});
  args.push('-v', `${cfg.docdataDir}:/app/.docdata:ro${cfg.mountOpts}`);
  args.push('-v', `${cfg.volNuxt}:/app/.nuxt`);
  args.push('-v', `${cfg.volData}:/app/.data`);
  args.push('-v', `${cfg.volCache}:/app/node_modules/.cache`);
  return args;
}

const netArgs = (cfg) => (cfg.runNetwork ? [`--network=${cfg.runNetwork}`] : []);
// MION_REPO_ROOT/MION_DOCDATA point the resolvers at the mounted repo context + results.
// MION_SITE picks which of the two sites nuxt.config.ts + content.config.ts build.
const envArgs = (cfg) => ['-e', 'MION_REPO_ROOT=/repo-context', '-e', 'MION_DOCDATA=/app/.docdata', '-e', `MION_SITE=${cfg.site}`];
// CHOKIDAR_USEPOLLING (read by nuxt.config.ts) switches watchers to polling — the
// only reliable mode over a bind mount that delivers no native fs events.
const pollArgs = (cfg) => (cfg.poll === '1' ? ['-e', 'CHOKIDAR_USEPOLLING=true'] : []);

// The mion site's home page renders type hovers from the @mionjs/* built .d.ts
// (server/api/twoslash.post.ts mounts them into its virtual filesystem). Without
// those dists every hover card on the home page renders an error instead, and the
// build still exits 0 — so build them before serving. nx caches the whole thing, so
// this is a no-op once warm. Warn rather than die: a hover-less page is worth
// looking at, a hard stop is not.
export function ensureMionDists(site) {
  if (site !== 'mion') return;
  // Every @mionjs package EXCEPT test-server, whose build bundles the edge/cloudflare
  // workers — minutes of work the docs site has no use for. (examples' build is a noop.)
  const args = ['--filter', '@mionjs/*', '--filter', '!@mionjs/test-server', 'run', 'build'];
  if (run('pnpm', args, {cwd: REPO_ROOT}) !== 0) {
    warn('building the @mionjs dists failed - the mion home page will render type-hover errors (see output above).');
  }
}

// Stage the playground assets (resolver WASM + mion source overlay) the
// /playground page fetches. build-playground.mjs is itself staleness-gated (instant
// no-op when nothing changed), so we just invoke it before serving.
function ensurePlayground(cfg) {
  if (cfg.skipPlayground) return note('MION_WEBSITE_SKIP_PLAYGROUND=1 - skipping playground assets');
  if (!which('go')) {
    warn('Go toolchain not found - skipping playground build (the /playground page will 404). Install Go + bootstrap submodules (SETUP.md), or set MION_WEBSITE_SKIP_PLAYGROUND=1 to silence.');
    return;
  }
  if (run('node', [join(WEBSITE_DIR, 'scripts/build-playground.mjs')]) !== 0) {
    warn('playground build failed - the site will run but /playground will 404 (see output above; needs Go + bootstrapped submodule, SETUP.md).');
  }
}

// Remove a container by name, swallowing "no such container".
const rmContainer = (cfg, name) => capture(cfg.engine, ['rm', '-f', name]);

function cmdDev(cfg, args) {
  let isAgent = false;
  for (const arg of args) {
    if (arg === '--isAgent' || arg === '--is-agent') isAgent = true;
    else die(`site: dev: unknown option '${arg}' (only --isAgent is supported)`);
  }
  ensureImage();
  const margs = mountArgs(cfg);
  const pargs = pollArgs(cfg);
  const nargs = netArgs(cfg);
  const eargs = envArgs(cfg);
  if (isAgent) return cmdDevAgent(cfg, margs, pargs, nargs, eargs);

  // --rm cleans up on a clean exit; an ungraceful kill leaves the named container
  // behind and the next run collides. Remove any stale one first (user container only).
  rmContainer(cfg, `${cfg.containerBase}-dev`);
  note(`dev server at http://localhost:${cfg.port}  (Ctrl-C to stop)`);
  const code = run(cfg.engine, ['run', '--rm', '-it', '--init', '--name', `${cfg.containerBase}-dev`, '-p', `${cfg.port}:3000`, ...nargs, ...margs, ...pargs, ...eargs, '-e', 'NODE_ENV=development', '-w', '/app', cfg.image, 'pnpm', 'exec', 'nuxt', 'dev', '--extends', 'docus', '--host', '0.0.0.0', '--port', '3000']);
  if (code !== 0) die('', code);
}

// The in-container watchdog: stop nuxt once the heartbeat file (bumped per request
// by server/middleware/agent-heartbeat.ts) goes stale. Runs inside the Linux
// container, so it stays shell.
const AGENT_WATCHDOG = `
      hb="$MION_AGENT_HEARTBEAT"; idle="\${MION_AGENT_IDLE_SECONDS:-300}"
      touch "$hb"
      pnpm exec nuxt dev --extends docus --host 0.0.0.0 --port 3000 &
      nuxt_pid=$!
      while kill -0 "$nuxt_pid" 2>/dev/null; do
        sleep 30
        last=$(stat -c %Y "$hb" 2>/dev/null || echo 0)
        now=$(date +%s)
        if [ $((now - last)) -ge "$idle" ]; then
          echo "agent: idle \${idle}s with no requests, stopping nuxt"
          kill "$nuxt_pid" 2>/dev/null || true
          break
        fi
      done
      wait "$nuxt_pid" 2>/dev/null || true
    `;

function cmdDevAgent(cfg, margs, pargs, nargs, eargs) {
  const cname = `${cfg.containerBase}-agent`;
  note(`agent dev server at http://localhost:${cfg.agentPort}  (detached; self-stops after ${cfg.agentIdle}s idle)`);
  rmContainer(cfg, cname);
  // Detached; discard the printed container id (stdout), keep stderr.
  run(cfg.engine, ['run', '-d', '--rm', '--init', '--name', cname, '-p', `${cfg.agentPort}:3000`, ...nargs, ...margs, ...pargs, ...eargs, '-e', 'NODE_ENV=development', '-e', 'MION_AGENT=1', '-e', 'MION_AGENT_HEARTBEAT=/tmp/agent-heartbeat', '-e', `MION_AGENT_IDLE_SECONDS=${cfg.agentIdle}`, '-w', '/app', cfg.image, 'sh', '-c', AGENT_WATCHDOG], {stdio: ['inherit', 'ignore', 'inherit']});
  note(`started detached as '${cname}'. Logs: ${cfg.engine} logs -f ${cname}   Stop early: ${cfg.engine} stop ${cname}`);
}

// `nuxt build`/`nuxt generate` transform first-party .ts through Vite's esbuild,
// whose tsconfck resolves the bind-mounted tsconfig.json -> `extends:
// ./.nuxt/tsconfig.json`. On a FRESH .nuxt volume (every CI run) that file doesn't
// exist yet, so the build dies with `TSConfckParseError: failed to resolve
// "extends":"./.nuxt/tsconfig.json"`. `nuxt prepare` writes the .nuxt scaffolding
// (tsconfig.json included) up front, so the extends target exists before the build.
// The standard Nuxt `postinstall: nuxt prepare` never runs here (deps are baked into
// the image, first-party config is bind-mounted at run time); locally it's masked
// because the persistent .nuxt named volume was populated by an earlier `nuxt dev`.
const PREPARE = 'pnpm exec nuxt prepare --extends docus';

const BUILD_SCRIPT = `${PREPARE} && pnpm exec nuxt build --extends docus`;
const GENERATE_SCRIPT = `${PREPARE} \\
      && pnpm exec nuxt generate --extends docus \\
      && node scripts/embed-panel-highlights.mjs /app/.output/public`;

// Build/generate into the container's OWN /app/.output, then `podman cp` it to the
// host - NOT a bind mount. A bind-mounted .output fails two ways: nitro rmdir's
// /app/.output while finalizing (EBUSY on a mount point), AND a rootless bind mount
// does not reliably write the container's output back to the host (CI produced an
// empty host .output that broke the artifact upload + the Cloudflare deploy, though
// it worked on the macOS podman-machine VM). `podman cp` copies deterministically
// and maps ownership to the host user. The container is NAMED + non-`--rm` so cp can
// read it afterwards; the mem bump keeps the client build off the ~2GB default heap.
//
// Async so two sites can build at once (cfg.parallel): the engine calls then go
// through runAsync (piped, `[site]`-prefixed lines) instead of inheriting stdio.
async function buildAndCopyOut(cfg, cname, script) {
  const margs = mountArgs(cfg);
  const nargs = netArgs(cfg);
  const eargs = envArgs(cfg);
  const hostOut = outputDir(cfg.site);
  // podman cp is used in its `<dir> <parent>` form (below), which always lands the
  // copy as `<parent>/.output`. Stage it in an empty parent, then rename the result
  // into place, so each site keeps its own .output/<site> without the two clobbering.
  const staging = join(WEBSITE_DIR, '.output', `.staging-${cfg.site}`);
  const engine = (args) => (cfg.parallel ? runAsync(cfg.engine, args, {prefix: cfg.site}) : Promise.resolve(run(cfg.engine, args)));
  rmContainer(cfg, cname); // drop any stale container from an ungraceful prior exit
  const code = await engine(['run', '--init', '--name', cname, ...nargs, ...margs, ...eargs, '-e', 'NODE_ENV=production', '-e', 'NODE_OPTIONS=--max-old-space-size=6144', '-w', '/app', cfg.image, 'sh', '-c', script]);
  if (code === 0) {
    // Copy the whole /app/.output dir into the staging parent. Use the plain
    // `podman cp <dir> <parent>` form: the `<dir>/.` CONTENTS form silently
    // copied nothing under CI's rootless podman 4.9.3 (worked on the macOS VM's 5.8.3).
    rmSync(hostOut, {recursive: true, force: true});
    rmSync(staging, {recursive: true, force: true});
    mkdirSync(staging, {recursive: true});
    if ((await engine(['cp', `${cname}:/app/.output`, staging])) !== 0) {
      rmContainer(cfg, cname);
      die('site: podman cp of /app/.output to the host failed');
    }
    renameSync(join(staging, '.output'), hostOut);
    rmSync(staging, {recursive: true, force: true});
    const files = existsSync(hostOut) ? globSync('**/*', {cwd: hostOut}).length : 0;
    if (files > 0) note(`copied build output -> ${hostOut} (${files} entries)`);
    // Warn (don't die): the build itself succeeded, which is what the gate checks. An
    // empty extraction still fails the DEPLOY's Cloudflare upload downstream, loudly.
    else warn(`podman cp left ${hostOut} EMPTY - rootless container->host extraction failed (the build succeeded)`);
  }
  rmContainer(cfg, cname);
  if (code !== 0) die('', code);
}

// Container names carry the site so the two sites' builds never collide (they
// run at once under --parallel, and a stale one from the other site must not be
// swept away as "ours").
function cmdBuild(cfg) {
  ensureImage();
  note(`production build (${cfg.site}) -> ${outputDir(cfg.site)}`);
  return buildAndCopyOut(cfg, `${cfg.containerBase}-build-${cfg.site}`, BUILD_SCRIPT);
}

function cmdGenerate(cfg) {
  ensureImage();
  note(`static prerender (${cfg.site}) -> ${join(outputDir(cfg.site), 'public')}`);
  return buildAndCopyOut(cfg, `${cfg.containerBase}-generate-${cfg.site}`, GENERATE_SCRIPT);
}

// The build.mjs entry: build (`build` = SSR, `generate` = static) ONE named site
// from an explicit env, without touching process.env, so two calls can overlap.
// Skips the dist/playground pre-stages main() runs: build.mjs stages them ONCE
// up front, which is what keeps two concurrent builds from racing on the
// bind-mounted packages/*/dist and playground dirs.
export function buildSite(target, site, {parallel = false} = {}) {
  const cfg = config({...process.env, MION_SITE: site, MION_WEBSITE_PARALLEL: parallel ? '1' : ''});
  requireEngine(cfg.engine);
  mkdirSync(join(WEBSITE_DIR, '.output'), {recursive: true});
  return target === 'build' ? cmdBuild(cfg) : cmdGenerate(cfg);
}

// Register container cleanup on exit / SIGINT / SIGTERM (the `trap … EXIT INT TERM`
// replacement). Returns a function that performs (idempotent) cleanup on demand.
function withCleanup(cfg, cname) {
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    capture(cfg.engine, ['rm', '-f', cname]);
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
  return cleanup;
}

async function cmdSmoke(cfg) {
  ensureImage();
  const cname = `${cfg.containerBase}-smoke`;
  const timeoutS = Number(cfg.smokeTimeout || '90');
  note(`smoke: starting dev server in background (${cname})`);
  rmContainer(cfg, cname);
  const margs = mountArgs(cfg);
  const pargs = pollArgs(cfg);
  const nargs = netArgs(cfg);
  const eargs = envArgs(cfg);
  if (run(cfg.engine, ['run', '-d', '--init', '--name', cname, '-p', `${cfg.port}:3000`, ...nargs, ...margs, ...pargs, ...eargs, '-e', 'NODE_ENV=development', '-w', '/app', cfg.image, 'pnpm', 'exec', 'nuxt', 'dev', '--extends', 'docus', '--host', '0.0.0.0', '--port', '3000'], {stdio: ['inherit', 'ignore', 'inherit']}) !== 0) die('site: podman run failed');
  const cleanup = withCleanup(cfg, cname);

  note(`smoke: probing / inside the container for HTTP 200 (timeout ${timeoutS}s; host port ${cfg.port} stays published)`);
  const deadline = Date.now() + timeoutS * 1000;
  let title = '';
  let lastStatus = null;
  while (Date.now() < deadline) {
    const res = containerHttp(cfg, cname, '/');
    if (res && res.status === 200 && res.body.includes('<title>')) {
      title = res.body.match(/<title>[^<]*<\/title>/)?.[0] ?? '';
      break;
    }
    // A non-200 means the server is up but the render failed - name the status
    // instead of looking identical to "not up yet" (a 500 here once hid a real
    // SSR crash behind a bare timeout).
    if (res && res.status !== lastStatus) {
      lastStatus = res.status;
      note(`smoke: server answered HTTP ${res.status}, waiting for 200`);
    }
    await sleep(2000);
  }

  if (title) {
    note(`smoke: PASS  ${title}`);
    capture(cfg.engine, ['stop', '--time', '1', cname]);
    cleanup();
    return;
  }
  console.error(`==> smoke: FAIL (no 200 from the in-container probe within ${timeoutS}s${lastStatus ? `; last status ${lastStatus}` : ''})`);
  console.error('==> last 40 lines of container logs:');
  run(cfg.engine, ['logs', '--tail', '40', cname], {stdio: ['inherit', 'inherit', 'inherit']});
  capture(cfg.engine, ['stop', '--time', '1', cname]);
  cleanup();
  die('', 1);
}

// Probe the dev server FROM INSIDE the container (podman exec + the image's own
// node fetch). Host-side polling through the published port broke when the CI
// runner image rolled to 20260729+: rootless podman stopped forwarding
// localhost:<port>, so the server sat healthy inside while every host poll died
// silently and the smoke went red with a green container. The smoke asserts "the
// server renders a page", not "the runner forwards ports", so the probe rides the
// container's own loopback; the -p publish stays for humans browsing the mapped
// port. Returns {status, body} once HTTP reached the server, else null (server
// not up yet / exec failed). Pass `body` to POST it as JSON.
function containerHttp(cfg, cname, path, body) {
  const script = [
    `const body = process.env.MION_PROBE_BODY;`,
    `const res = await fetch('http://127.0.0.1:3000' + process.env.MION_PROBE_PATH, body ? {method: 'POST', headers: {'content-type': 'application/json'}, body} : {}).catch(() => null);`,
    `if (!res) process.exit(7);`,
    `process.stdout.write(res.status + '\\n' + (await res.text()));`,
  ].join('\n');
  const probeEnv = ['-e', `MION_PROBE_PATH=${path}`, '-e', `MION_PROBE_BODY=${body ? JSON.stringify(body) : ''}`];
  const result = capture(cfg.engine, ['exec', ...probeEnv, cname, 'node', '--input-type=module', '-e', script]);
  if (result.status !== 0) return null;
  const nl = result.stdout.indexOf('\n');
  const status = nl === -1 ? NaN : Number(result.stdout.slice(0, nl));
  if (!Number.isFinite(status)) return null;
  return {status, body: result.stdout.slice(nl + 1)};
}

// The example files the site's home page renders through ::twoslash-code, in page
// order: every `path: packages/examples/src/…` its index.md names. Empty for a site
// whose home page has no card (the runtypes site).
function homeTwoslashPaths(cfg) {
  const index = join(WEBSITE_DIR, 'sites', cfg.site, 'content', 'index.md');
  if (!existsSync(index)) return [];
  return [...readFileSync(index, 'utf8').matchAll(/^\s*path:\s*(packages\/examples\/src\/\S+\.ts)\s*$/gm)].map((match) => match[1]);
}

async function cmdVerifyDocs(cfg) {
  ensureImage();
  const cname = `${cfg.containerBase}-verify`;
  const timeoutS = Number(cfg.smokeTimeout || '120');
  // Pick a real example file from the mounted context for the endpoint checks.
  const examples = globSync('**/*.ts', {cwd: join(cfg.repoContext, 'packages/examples/src')});
  if (examples.length === 0) die(`site: no examples found under ${cfg.repoContext}/packages/examples/src - run 'rt website check' after building packages`);
  const relpath = `packages/examples/src/${examples[0]}`;
  note(`verify-docs: example = ${relpath}`);

  rmContainer(cfg, cname);
  const margs = mountArgs(cfg);
  const pargs = pollArgs(cfg);
  const nargs = netArgs(cfg);
  const eargs = envArgs(cfg);
  if (run(cfg.engine, ['run', '-d', '--init', '--name', cname, '-p', `${cfg.port}:3000`, ...nargs, ...margs, ...pargs, ...eargs, '-e', 'NODE_ENV=development', '-w', '/app', cfg.image, 'pnpm', 'exec', 'nuxt', 'dev', '--extends', 'docus', '--host', '0.0.0.0', '--port', '3000'], {stdio: ['inherit', 'ignore', 'inherit']}) !== 0) die('site: podman run failed');
  const cleanup = withCleanup(cfg, cname);

  note(`verify-docs: waiting for the dev server (in-container probe, timeout ${timeoutS}s)`);
  const deadline = Date.now() + timeoutS * 1000;
  let up = false;
  while (Date.now() < deadline) {
    const res = containerHttp(cfg, cname, '/');
    if (res && res.status === 200) {
      up = true;
      break;
    }
    await sleep(2000);
  }
  if (!up) {
    run(cfg.engine, ['logs', '--tail', '40', cname], {stdio: ['inherit', 'inherit', 'inherit']});
    cleanup();
    die('site: dev server never came up');
  }

  // POST JSON in-container; true if the 2xx body includes `needle`.
  const postIncludes = (path, body, needle) => {
    const res = containerHttp(cfg, cname, path, body);
    return res !== null && res.status >= 200 && res.status < 300 && res.body.includes(needle);
  };

  let fails = 0;
  // 1. twoslash endpoint renders hovers from the mounted packages' .d.ts: every card
  //    the site's home page embeds (the five on the mion home page; a home page with
  //    no card falls back to the example above). A card imports the packages the
  //    reader sees documented, so it is the mount list this actually proves. The
  //    endpoint answers 500 on a compiler error (an unresolved import included), and
  //    2xx-with-no-markup is the same failure with the noise stripped.
  const cards = homeTwoslashPaths(cfg);
  for (const card of cards.length > 0 ? cards : [relpath]) {
    if (postIncludes('/api/twoslash', {path: card, hoverMode: 'all'}, 'twoslash')) console.log(`  PASS  twoslash: rendered hovers for ${card}`);
    else (console.error(`  FAIL  twoslash: no hover markup for ${card}`), (fails = 1));
  }
  // 2. file read (the resolver code-import uses) returns code from the context.
  if (postIncludes('/api/read-file', {path: relpath}, '"code"')) console.log(`  PASS  code read: ${relpath}`);
  else (console.error(`  FAIL  code read: ${relpath}`), (fails = 1));
  // 3. security boundary: a path escaping packages/ is rejected (403).
  const code = containerHttp(cfg, cname, '/api/read-file', {path: 'packages/examples/../../package.json'})?.status ?? 0;
  if (code === 403) console.log('  PASS  security: out-of-packages path rejected (403)');
  else (console.error(`  FAIL  security: expected 403, got ${code}`), (fails = 1));
  // 4. homepage server-renders twoslash markup (full SSR path).
  const home = containerHttp(cfg, cname, '/');
  if (home && home.status === 200 && home.body.includes('twoslash')) console.log('  PASS  homepage: twoslash markup present in SSR HTML');
  else console.error('  WARN  homepage: no twoslash markup (homepage may not use ::twoslash-code)');

  cleanup();
  if (fails === 0) return void note('verify-docs: PASS');
  die('site: verify-docs: FAIL');
}

function cmdShell(cfg) {
  ensureImage();
  const margs = mountArgs(cfg);
  const nargs = netArgs(cfg);
  const eargs = envArgs(cfg);
  const code = run(cfg.engine, ['run', '--rm', '-it', '--init', '--name', `${cfg.containerBase}-shell`, '-p', `${cfg.port}:3000`, ...nargs, ...margs, ...eargs, '-w', '/app', cfg.image, 'bash']);
  if (code !== 0) die('', code);
}

export async function main(args) {
  const cfg = config();
  requireEngine(cfg.engine);
  mkdirSync(join(WEBSITE_DIR, '.output'), {recursive: true});
  const cmd = args[0];
  // Ensure the playground bundle is staged for every command that serves the site.
  if (['dev', 'build', 'generate', 'smoke', 'verify-docs'].includes(cmd)) {
    ensureMionDists(cfg.site);
    ensurePlayground(cfg);
  }
  switch (cmd) {
    case 'dev': return cmdDev(cfg, args.slice(1));
    case 'build': return cmdBuild(cfg);
    case 'generate': return cmdGenerate(cfg);
    case 'smoke': return cmdSmoke(cfg);
    case 'verify-docs': return cmdVerifyDocs(cfg);
    case 'shell': return cmdShell(cfg);
    default: die(`site: unknown command '${cmd ?? ''}'. Try: dev | build | generate | smoke | verify-docs | shell  (image lifecycle: pnpm rtx container build-image|ensure|login|push|pull|lock|clean)`);
  }
}

if (import.meta.main) {
  loadEnv();
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
