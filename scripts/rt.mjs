#!/usr/bin/env node
// rtx — the internal RunTypes repo CLI. A single zero-dependency Node ESM
// dispatcher over the area modules under scripts/ (core, website, bench,
// container, env, release). INTERNAL tooling for maintainers — NOT a public CLI
// for RunTypes. Run as `pnpm rtx <area> <command>` (or `node scripts/rt.mjs …`).
//
// THE entry point: loadEnv() runs once here, then dispatch imports the area
// modules IN-PROCESS (they inherit the loaded process.env) or spawns the tools
// they drive (go/podman/pnpm/vitest/git/npm) with stdio inherited. Leaves throw a
// CliError on failure (never process.exit); this file catches it, prints, and sets
// process.exitCode.
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {main as coreBuild} from './core/build.mjs';
import {loadEnv, REPO_ROOT} from './lib/env.mjs';
import {CliError, capture, reportCliError} from './lib/proc.mjs';

// ── spawn helpers ──────────────────────────────────────────────────────────
// Run one command to completion (stdio inherited); return its exit code.
function exec(cmd, args = [], extraEnv) {
  const env = extraEnv ? {...process.env, ...extraEnv} : process.env;
  const result = spawnSync(cmd, args, {stdio: 'inherit', env});
  if (result.error) {
    console.error(`rtx: failed to launch ${cmd}: ${result.error.message}`);
    return 1;
  }
  return typeof result.status === 'number' ? result.status : 1;
}
// Run one command; a non-zero code throws a code-only CliError (the child already
// printed its own error). Success returns and dispatch completes with exit 0.
function proxy(cmd, args = [], extraEnv) {
  const code = exec(cmd, args, extraEnv);
  if (code !== 0) throw new CliError('', code);
}
// Run [cmd, args, env?] steps in order; first non-zero short-circuits (throws).
function steps(list) {
  for (const step of list) proxy(step[0], step[1] ?? [], step[2]);
}
// Build the engine first (throws CliError on its failure), then continue in-process.
function ensureBuilt() {
  coreBuild(['all']);
}
const hasFlag = (args, ...names) => args.some((a) => names.includes(a));
function takeFlag(args, flag, {valued = false} = {}) {
  const i = args.indexOf(flag);
  if (i === -1) return {value: undefined, rest: args};
  if (!valued) return {value: true, rest: [...args.slice(0, i), ...args.slice(i + 1)]};
  return {value: args[i + 1], rest: [...args.slice(0, i), ...args.slice(i + 2)]};
}
const die = (msg, code = 1) => {
  throw new CliError(`rtx: ${msg}`, code);
};

// ── core: the engine (Go resolver + TS marker/plugin) ──────────────────────
const FUZZ = {
  unit: {config: 'packages/ts-runtypes/test/fuzz/vitest.fuzz-unit.config.ts'},
  value: {patterns: ['fuzz.integration'], soak: {RT_FUZZ_SOAK_MS: '60000'}},
  types: {patterns: ['typeFuzz.integration'], soak: {RT_FUZZ_TYPES_SOAK_MS: '60000'}},
  jsonschema: {patterns: ['jsonSchemaFuzz.integration'], soak: {RT_FUZZ_JSONSCHEMA_SOAK_MS: '60000'}},
  cloning: {patterns: ['cloneFuzz.integration'], soak: {RT_FUZZ_CLONE_SOAK_MS: '60000'}},
  enrich: {patterns: ['enrichFuzz.integration'], soak: {RT_FUZZ_ENRICH_SEQUENCES: '400', RT_FUZZ_ENRICH_MAXCMDS: '24'}},
  i18n: {patterns: ['i18nFuzz.integration'], soak: {RT_FUZZ_I18N_SEQUENCES: '400', RT_FUZZ_I18N_MAXCMDS: '24'}},
  typemod: {patterns: ['typeModFuzz.integration'], soak: {RT_FUZZ_TYPEMOD_REPORT: '1', RT_FUZZ_TYPEMOD_SEQUENCES: '400', RT_FUZZ_TYPEMOD_MAXSTEPS: '20'}},
  // race is the ONLY path that sets RT_FUZZ_RACE=1 — without it enrichRace self-skips.
  race: {patterns: ['enrichRace'], env: {RT_FUZZ_RACE: '1'}, soak: {RT_FUZZ_RACE_ITERATIONS: '25', RT_FUZZ_RACE_FANOUT: '8'}},
  // Robustness fuzz of the committed go:embed sidecar bundle under real node
  // (garbage patterns/flags/samples + oversized batches; RT_FUZZ_SEED replays).
  sidecar: {patterns: ['patternSidecarFuzz']},
  // Generation fuzz of the sidecar's `generate` op (supported-subset round-trip
  // + determinism oracles, adversarial construct contract; RT_FUZZ_SEED replays).
  patterngen: {patterns: ['patternGenFuzz']},
  all: {patterns: ['fuzz.integration', 'typeFuzz.integration', 'binaryEncoderResize']},
};
// Go→TS mirrors. rtx runs each generator DIRECTLY — the whole point is that
// adding a mirror is ONE entry here, with no companion `gen:*` package.json
// script and no CI edit. `run` is the argv; `stdoutTo` captures the generator's
// stdout into that file (it prints the module), otherwise the generator writes
// its own outputs. `fmt` files get oxfmt --write afterwards (the Go generators
// emit unformatted TS; diag self-formats via prettier). `--check` regenerates +
// formats then git-diffs `outputs`; CI runs `pnpm rtx core codegen all --check`,
// so the drift gate and this registry can never disagree.
const GO_RUN = ['go', '-C', 'ts-go-runtypes', 'run'];
const CODEGEN = {
  constants: {run: [...GO_RUN, './cmd/gen-ts-constants'], outputs: ['packages/ts-runtypes-devtools/src/go-generated/runtypes-constants.generated.ts'], fmt: ['packages/ts-runtypes-devtools/src/go-generated/runtypes-constants.generated.ts']},
  // Writes BOTH mirrors itself (marker RunTypeKind + devtools ReflectionKind enum)
  // from one protocol parse, so they can't drift; no stdoutTo (multi-file output).
  kind: {run: [...GO_RUN, './cmd/gen-run-type-kind'], outputs: ['packages/ts-runtypes/src/go-generated/runTypeKind.generated.ts', 'packages/ts-runtypes-devtools/src/go-generated/reflectionKind.generated.ts'], fmt: ['packages/ts-runtypes/src/go-generated/runTypeKind.generated.ts', 'packages/ts-runtypes-devtools/src/go-generated/reflectionKind.generated.ts']},
  fnhashes: {run: [...GO_RUN, './cmd/gen-fn-hashes'], stdoutTo: 'packages/ts-runtypes/src/go-generated/fnHashes.generated.ts', outputs: ['packages/ts-runtypes/src/go-generated/fnHashes.generated.ts'], fmt: ['packages/ts-runtypes/src/go-generated/fnHashes.generated.ts']},
  // Type-format metadata mirror: the canonical format names (+ base RunTypeKind)
  // each emitter under internal/cachegen/typefunctions/formats registers, so a
  // reflection consumer keys off `typeFormats` instead of re-declaring the names.
  typeformats: {run: [...GO_RUN, './cmd/gen-type-formats'], stdoutTo: 'packages/ts-runtypes/src/go-generated/typeFormats.generated.ts', outputs: ['packages/ts-runtypes/src/go-generated/typeFormats.generated.ts'], fmt: ['packages/ts-runtypes/src/go-generated/typeFormats.generated.ts']},
  diag: {run: ['node', 'scripts/core/gen-diagnostics-catalog.mjs'], outputs: ['packages/ts-runtypes-devtools/src/go-generated/diagnosticCatalog.generated.ts', 'container/website/app/components/content/go-generated/diagnostics-catalog.json'], fmt: []},
  // Built-in pure-fn body table (Go, not a Go->TS mirror): extracts the
  // package's own `rt::`/`rtFormats::` registrations from packages/ts-runtypes/src
  // so the resolver can deliver them to published consumers on demand. The Go
  // generator self-formats via go/format, so no `fmt` post-step.
  builtinpurefns: {run: [...GO_RUN, './cmd/gen-builtin-purefns'], outputs: ['ts-go-runtypes/internal/cachegen/builtinpurefns/table.generated.go'], fmt: []},
  // tsRuntypesPlugin json-key mirror: the tsconfig plugin entry's recognised keys,
  // read by the bundler-option parity test so a project option added to only one
  // side (PluginOptions vs the tsconfig struct) fails CI.
  pluginkeys: {run: [...GO_RUN, './cmd/gen-plugin-keys'], outputs: ['packages/ts-runtypes-devtools/src/go-generated/tsconfig-plugin-keys.generated.ts'], fmt: ['packages/ts-runtypes-devtools/src/go-generated/tsconfig-plugin-keys.generated.ts']},
  // JS→Go mirror (the one lane pointed the other way): bundles the private
  // @ts-runtypes/go-be-sidecar package (vite lib build) into the committed
  // go:embed bundle the resolver spawns under node/bun for JS-regex jobs.
  // No fmt step — the output is a JS bundle, not generated TS.
  sidecar: {run: ['node', 'scripts/core/gen-sidecar-js.mjs'], outputs: ['ts-go-runtypes/internal/jsengine/sidecar.bundle.mjs'], fmt: []},
};

// Run one generator: either it writes its own outputs (proxy, stdio inherited),
// or it prints the module to stdout and we capture it into `stdoutTo`.
function runGen(name) {
  const [cmd, ...args] = CODEGEN[name].run;
  const {stdoutTo} = CODEGEN[name];
  if (!stdoutTo) return proxy(cmd, args);
  const {status, stdout, stderr, error} = capture(cmd, args);
  if (error) die(`codegen '${name}': failed to launch ${cmd}: ${error.message}`);
  if (status !== 0) {
    if (stderr) process.stderr.write(stderr);
    die(`codegen '${name}': ${cmd} exited ${status}`, status ?? 1);
  }
  writeFileSync(join(REPO_ROOT, stdoutTo), stdout);
}

function runCodegen(args) {
  const check = hasFlag(args, '--check');
  const which = args.find((a) => !a.startsWith('-')) ?? 'all';
  const names = which === 'all' ? Object.keys(CODEGEN) : [which];
  for (const name of names) if (!CODEGEN[name]) die(`unknown codegen target '${name}'. Try: all | ${Object.keys(CODEGEN).join(' | ')} [--check]`);
  for (const name of names) {
    runGen(name);
    if (CODEGEN[name].fmt.length) proxy('pnpm', ['exec', 'oxfmt', '--write', ...CODEGEN[name].fmt]);
  }
  if (!check) return;
  const outputs = names.flatMap((name) => CODEGEN[name].outputs);
  if (exec('git', ['diff', '--exit-code', '--', ...outputs]) !== 0) die('codegen drift — a committed Go→TS mirror is stale. Run `rtx core codegen all` and commit.');
}

function runCore(args) {
  const [sub, ...rest] = args;
  if (sub === 'build') return coreBuild(rest);
  if (sub === 'smoke') return (ensureBuilt(), proxy('node', ['scripts/core/smoke.mjs', ...rest]));
  if (sub === 'bump-tsgolint') return proxy('node', ['scripts/core/bump-tsgolint.mjs', ...rest]);
  if (sub === 'ensure-tsgolint') return proxy('node', ['scripts/core/ensure-tsgolint.mjs', ...rest]);
  if (sub === 'codegen') return runCodegen(rest);
  if (sub === 'fuzz') {
    const suite = FUZZ[rest[0]];
    if (!suite) die(`unknown fuzz suite '${rest[0] ?? ''}'. Try: ${Object.keys(FUZZ).join(' | ')} [--soak]`);
    const {value: soak, rest: extra} = takeFlag(rest.slice(1), '--soak');
    const env = {...(suite.env ?? {}), ...(soak ? suite.soak ?? {} : {})};
    ensureBuilt();
    if (suite.config) return proxy('pnpm', ['exec', 'vitest', 'run', '--config', suite.config, ...extra], env);
    return proxy('pnpm', ['exec', 'vitest', 'run', ...suite.patterns, ...extra], env);
  }
  die('usage: rtx core <build|smoke|fuzz <suite>|codegen [--check]|bump-tsgolint [<rev>]|ensure-tsgolint [--check]>');
}

// ── website ────────────────────────────────────────────────────────────────
async function runWebsite(args) {
  const [sub, ...rest] = args;
  if (sub === 'dev') {
    const {value: agent, rest: pass} = takeFlag(rest, '--agent');
    const {main} = await import('./website/site.mjs');
    return main(['dev', ...(agent ? ['--isAgent'] : []), ...pass]);
  }
  if (sub === 'build') {
    let a = rest;
    const target = hasFlag(a, '--ssr') ? 'build' : 'generate';
    a = takeFlag(a, '--ssr').rest;
    const skip = takeFlag(a, '--skip-playground');
    if (skip.value) process.env.RT_WEBSITE_SKIP_PLAYGROUND = '1';
    const {main} = await import('./website/build.mjs');
    return main([target, ...skip.rest]);
  }
  // container-build: the container-only prod build (site.mjs build), NOT the full
  // pipeline (build.mjs). Used by the release gate's website-build job.
  if (sub === 'container-build') {
    const {main} = await import('./website/site.mjs');
    return main(['build', ...rest]);
  }
  if (sub === 'preview') {
    // --no-build: skip the (re)generate and serve the existing .output/public as-is
    // (serve.mjs fails loud if no build is there). Otherwise generate, then serve.
    const {value: noBuild, rest: pass} = takeFlag(rest, '--no-build');
    if (!noBuild) {
      const {main} = await import('./website/site.mjs');
      await main(['generate']);
    }
    return proxy('node', ['scripts/website/serve.mjs', ...pass]);
  }
  if (sub === 'check') {
    // --static checks the BUILT artifact (.output/public): serve it and assert every
    // benchmark page renders its benchmark. The other two boot the dev container.
    if (hasFlag(rest, '--static')) {
      const {main} = await import('./website/check-static.mjs');
      return main(takeFlag(rest, '--static').rest);
    }
    const {main} = await import('./website/site.mjs');
    return main([hasFlag(rest, '--docs') ? 'verify-docs' : 'smoke']);
  }
  if (sub === 'shell') {
    const {main} = await import('./website/site.mjs');
    return main(['shell']);
  }
  die('usage: rtx website <dev [--agent]|build [--no-bench|--quick|--ssr|--skip-playground]|preview [--no-build]|check [--docs|--static]|container-build|shell>');
}

// ── bench ────────────────────────────────────────────────────────────────
const BENCH_SUB = new Set(['audit', 'typecost', 'compiletime', 'serialization', 'smoke', 'prep', 'clean', 'capture-env', 'shell', 'transform-wire', 'fullbench', 'website-bench', 'bench-one', 'build']);
// Translate the rtx-level flags (--one/--full/--website/--build-only) to bench.mjs's
// own sub-verbs; a bare sub-verb passes through, and the default is `bench`.
function benchArgs(args) {
  if (args[0] && !args[0].startsWith('-') && BENCH_SUB.has(args[0])) return args;
  const one = takeFlag(args, '--one', {valued: true});
  if (one.value !== undefined) return ['bench-one', one.value, ...one.rest];
  const full = takeFlag(args, '--full');
  if (full.value) return ['fullbench', ...full.rest];
  const web = takeFlag(args, '--website');
  if (web.value) return ['website-bench', ...web.rest];
  const buildOnly = takeFlag(args, '--build-only');
  if (buildOnly.value) return ['build', ...buildOnly.rest];
  const stray = args.find((a) => !a.startsWith('-'));
  if (stray) die(`unknown bench target '${stray}'. Try a flag (--one/--full/--website/--build-only) or a sub-verb.`);
  return ['bench', ...args];
}
async function runBench(args) {
  const {main} = await import('./website/bench-data/bench.mjs');
  return main(benchArgs(args));
}

// ── release: npm publish + orchestrate the site build/deploy ────────────────

// Flags the no-sub umbrella accepts. Anything else — an unknown flag, a
// mistyped subcommand — must NOT reach it: the umbrella ends in an
// irreversible npm publish, so it is the one default in this CLI that must
// never run by accident.
const UMBRELLA_FLAGS = new Set(['--preflight-only', '--no-website', '--dry-run']);

const isHelpFlag = (arg) => arg === 'help' || arg === '-h' || arg === '--help';

function runRelease(args) {
  const [sub, ...rest] = args;
  const map = {
    preflight: ['node', ['scripts/release/preflight.mjs']],
    npm: ['node', ['scripts/release/publish.mjs']],
    'manual-publish': ['node', ['scripts/release/manual-publish.mjs']],
    website: ['node', ['scripts/website/build.mjs', 'generate']],
    unpublish: ['node', ['scripts/release/unpublish.mjs']],
    bump: ['node', ['scripts/release/bump-version.mjs']],
    dists: ['pnpm', ['-r', 'run', 'build']],
    binaries: ['node', ['scripts/release/build-binaries.mjs']],
    pack: ['node', ['scripts/release/pack.mjs']],
    tarballs: ['node', ['scripts/release/publish-tarballs.mjs']],
    'stage-approve': ['node', ['scripts/release/stage-approve.mjs']],
    'verify-live': ['node', ['scripts/release/verify-live.mjs']],
    e2e: ['node', ['scripts/release/e2e.mjs']],
  };
  if (map[sub]) return proxy(map[sub][0], [...map[sub][1], ...rest]);
  if (sub === 'all') return runReleaseChain(rest);
  // Bare `rtx release` prints help — it does NOT release. The chain ends in an
  // interactive npm publish that bumps, commits and tags, so it answers to its
  // own name (`rtx release all`) and never to a bare word or a typo.
  if (sub === undefined || isHelpFlag(sub)) return void process.stdout.write(RELEASE_HELP);
  if (!sub.startsWith('-')) die(`unknown release command '${sub}'. Run \`pnpm rtx release --help\`.`, 2);
  die(`\`rtx release\` no longer runs the release chain — use \`pnpm rtx release all ${args.join(' ')}\`.`, 2);
}

// The chain: preflight -> npm publish -> website build. Deploy is CI-only.
function runReleaseChain(flags) {
  const stray = flags.find((arg) => !UMBRELLA_FLAGS.has(arg));
  if (stray) die(`unknown flag '${stray}' for \`rtx release all\`. Run \`pnpm rtx release --help\`.`, 2);
  const preflightOnly = hasFlag(flags, '--preflight-only');
  const noWebsite = hasFlag(flags, '--no-website');
  const plan = [['node', ['scripts/release/preflight.mjs']]];
  if (!preflightOnly) {
    plan.push(['node', ['scripts/release/publish.mjs']]);
    if (!noWebsite) plan.push(['node', ['scripts/website/build.mjs', 'generate']]);
  }
  if (hasFlag(flags, '--dry-run')) {
    console.log('rtx release all would run, in order:');
    for (const [cmd, a] of plan) console.log(`  ${cmd} ${a.join(' ')}`);
    console.log('(website deploy to Cloudflare Pages stays CI-only — see publish.yml)');
    return;
  }
  steps(plan);
}

// In-process leaves import + call their main(). Dynamic import defers module
// evaluation until after loadEnv() so the leaf sees a populated process.env.
async function runEnv(args) {
  const {main} = await import('./env/check.mjs');
  main(args);
}
async function runContainer(args) {
  const {main} = await import('./container/image.mjs');
  main(args);
}

// ── dispatch ────────────────────────────────────────────────────────────────
// The release rows live here so `rtx release --help` and the full `rtx --help`
// print the SAME text (HELP interpolates this block).
const RELEASE_HELP = `release   npm publish + site build (CI stages to npm; a maintainer approves with 2FA)
  rtx release                             prints this help — the chain answers to 'all', never to a bare word
  rtx release all [--preflight-only] [--no-website] [--dry-run]   the chain: preflight -> npm publish -> site build
  rtx release <preflight|npm|website|bump <v>|dists|binaries|pack|tarballs|unpublish>
  rtx release stage-approve [--dry-run|--no-deploy|--deploy-only]   approve staged packages (one 2FA OTP prompt, leaves-first), then auto-dispatch the website deploy once npm serves the version
  rtx release verify-live                 deploy guard: fail unless the tree's version is LIVE on npm (all packages, lockstep)
  rtx release manual-publish [--skip-build|--dry-run|--yes]   first-publish bootstrap: build + npm login + publish all 10 LIVE (resumable)
  rtx release e2e [--backend container|host-npx] [--pack]   pre-publish e2e (containerized verdaccio + feature matrix + host smoke)
  rtx release e2e --backend npm [--registry URL] [--version V] [--no-matrix]   post-publish e2e (install the LIVE @ts-runtypes/* from npm + run the same suite)
`;

const HELP = `rtx — internal RunTypes dev/build/publish CLI  (run as: pnpm rtx <area> <command>)

core     the engine (Go resolver + TS marker/plugin)
  rtx core build [targets…]        build the binary + dev dists if stale
  rtx core smoke                   end-to-end smoke of the resolver + devtools
  rtx core fuzz <suite> [--soak]   unit|value|types|jsonschema|cloning|enrich|i18n|typemod|race|sidecar|patterngen|all
  rtx core codegen [all|constants|kind|fnhashes|typeformats|diag|builtinpurefns|pluginkeys|sidecar] [--check]   regenerate Go→TS mirrors, pure-fn table + sidecar bundle
  rtx core bump-tsgolint [<rev>] [--skip-tests]   move the tsgolint/typescript-go pin (default: latest release), re-patch, rebuild + test
  rtx core ensure-tsgolint [--check]   check the submodule out to tsgolint.pin.json + re-apply patches (--check verifies only)

website
  rtx website dev [--agent]        hot-reload docs server (:3000, or :3100 --agent)
  rtx website build [--no-bench]   build the docs site (WITH benchmarks; --no-bench reuses data)
                    [--quick] [--ssr] [--skip-playground]
  rtx website preview [--no-build] serve the static site locally; regenerates it first unless --no-build
  rtx website check [--docs]       serves-a-page smoke (code-import + twoslash with --docs)
  rtx website check --static       serve the BUILT site + assert every benchmark page renders
  rtx website container-build      container-only prod build (not the full pipeline)
  rtx website shell                debug shell inside the website container

bench
  rtx bench [--one <name>|--full|--website|--build-only] [--quick]
  rtx bench <audit|typecost|compiletime|serialization|smoke>

${RELEASE_HELP}
container  rtx container <build-image|ensure|login|push|pull|lock|clean> [website|e2e]
           (build-image/push/pull/clean act on BOTH images when no target is given)
env        rtx env [push-image|publish-npm|deploy-website|--create-env]

verify     build if stale, then lint + typecheck + format check
fmt        format (oxfmt + prettier + gofmt); --check is read-only
clean      clean build outputs; --deep also wipes node_modules
`;

async function dispatch(argv) {
  const [verb, ...rest] = argv;
  // `rtx <area> --help` prints help instead of reaching the area's dispatcher,
  // uniformly across areas. Deeper help (`rtx release e2e --help`) still goes
  // to the leaf, which owns its own usage text.
  if (verb && isHelpFlag(rest[0])) {
    process.stdout.write(verb === 'release' ? RELEASE_HELP : HELP);
    return;
  }
  switch (verb) {
    case 'core': return runCore(rest);
    case 'website': return runWebsite(rest);
    case 'bench': return runBench(rest);
    case 'release': return runRelease(rest);
    case 'container': return runContainer(rest);
    case 'env': return runEnv(rest);
    case 'verify': return (coreBuild(['all']), steps([['pnpm', ['run', 'lint']], ['pnpm', ['run', 'check-format']]]));
    case 'fmt': return proxy('pnpm', ['run', hasFlag(rest, '--check') ? 'check-format' : 'format']);
    case 'clean': return proxy('pnpm', ['run', hasFlag(rest, '--deep') ? 'fresh-start' : 'clean']);
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      process.stdout.write(HELP);
      return;
    default:
      die(`unknown command '${verb}'. Run \`pnpm rtx --help\`.`, 2);
  }
}

loadEnv();
try {
  await dispatch(process.argv.slice(2));
} catch (err) {
  reportCliError(err);
}
