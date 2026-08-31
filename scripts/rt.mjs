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
// THE single source of truth for the fuzz lane list. The soak workflows derive
// their matrices from it (`rtx core fuzz-lanes`); the one list that cannot be
// derived (fuzz-soak.yml's workflow_dispatch choice options — GitHub resolves
// those before any job runs) plus ci.yml's quick-tier wiring are pinned back to
// this table by packages/ts-runtypes-devtools/test/fuzz-lane-contracts.test.ts.
// Entries stay ONE PER LINE — that test parses them line-wise.
//
// Budget tiers. Every lane always runs at one of three:
//   default  what `pnpm test` / `vitest run test/fuzz` executes: a handful of
//            iterations — a floor proving the harness runs, not real coverage.
//   quick    `--quick`: the per-PR tier (ci.yml). Roughly 2x the default work,
//            sized so the two heavy CI jobs stay balanced (~+2-3 min total).
//   soak     `--soak`: the release tier (release-gate.yml / fuzz-soak.yml),
//            one lane per runner under a 45-minute cap. Giving a lane a `soak`
//            block IS the opt-in — it is a wall-clock commitment, and the
//            workflows will pick the lane up from here automatically.
//
// ⚠ Scheduling rule (docs/done/drain-fuzz-soak-backlog.md): the *_SOAK_MS lanes
// are TIME-BOXED — CPU contention silently buys LESS coverage in the same wall
// clock, so never run two of them concurrently (ci.yml soaks them one at a
// time; the soak workflows give each lane its own runner). The count-based
// lanes (sequences / iterations) have fixed coverage — contention only costs
// wall clock, so they may share a runner.
//
// ⚠ RT_FUZZ_ITER drives BOTH convert lanes (`convert` and `convertcli`):
// exporting it in a shell widens the two at once. The tier blocks set it
// per-lane, so `--quick` / `--soak` never collide.
const FUZZ = {
  unit: {config: 'packages/run-types/test/fuzz/vitest.fuzz-unit.config.ts'},
  // Patterns are vitest positional filters: case-INSENSITIVE substring matches
  // on the file path. `value` and `types` are path-anchored because their bare
  // names are substrings of half the tree ('fuzz.integration' matches every
  // *Fuzz.integration file; 'typeFuzz' matches nonDataTypeFuzz) — anchored, a
  // lane runs exactly its own file, so per-lane tier runs stay cheap and the
  // ci.yml partition stays exact.
  value: {patterns: ['value/fuzz.integration'], quick: {RT_FUZZ_SOAK_MS: '10000'}, soak: {RT_FUZZ_SOAK_MS: '60000'}},
  types: {patterns: ['type/typeFuzz.integration'], quick: {RT_FUZZ_TYPES_SOAK_MS: '10000'}, soak: {RT_FUZZ_TYPES_SOAK_MS: '60000'}},
  cloning: {patterns: ['cloneFuzz.integration'], quick: {RT_FUZZ_CLONE_SOAK_MS: '10000'}, soak: {RT_FUZZ_CLONE_SOAK_MS: '60000'}},
  nondata: {patterns: ['nonDataTypeFuzz.integration'], quick: {RT_FUZZ_NONDATA_SOAK_MS: '10000'}, soak: {RT_FUZZ_NONDATA_SOAK_MS: '60000'}},
  roundtrip: {patterns: ['allStrategyRoundtrip.integration'], quick: {RT_FUZZ_ROUNDTRIP_SOAK_MS: '10000'}, soak: {RT_FUZZ_ROUNDTRIP_SOAK_MS: '60000'}},
  elision: {patterns: ['elision/elisionFuzz.integration'], quick: {RT_FUZZ_ELISION_SOAK_MS: '10000'}, soak: {RT_FUZZ_ELISION_SOAK_MS: '60000'}},
  size: {patterns: ['binarySizeEstimate.integration'], quick: {RT_FUZZ_SIZE_SOAK_MS: '10000'}, soak: {RT_FUZZ_SIZE_SOAK_MS: '60000'}},
  enrich: {patterns: ['enrichFuzz.integration'], quick: {RT_FUZZ_ENRICH_SEQUENCES: '12'}, soak: {RT_FUZZ_ENRICH_SEQUENCES: '400', RT_FUZZ_ENRICH_MAXCMDS: '24'}},
  i18n: {patterns: ['i18nFuzz.integration'], quick: {RT_FUZZ_I18N_SEQUENCES: '12'}, soak: {RT_FUZZ_I18N_SEQUENCES: '400', RT_FUZZ_I18N_MAXCMDS: '24'}},
  typemod: {patterns: ['typeModFuzz.integration'], quick: {RT_FUZZ_TYPEMOD_SEQUENCES: '12'}, soak: {RT_FUZZ_TYPEMOD_REPORT: '1', RT_FUZZ_TYPEMOD_SEQUENCES: '400', RT_FUZZ_TYPEMOD_MAXSTEPS: '20'}},
  // race is the ONLY path that sets RT_FUZZ_RACE=1 — without it enrichRace self-skips.
  race: {patterns: ['enrichRace'], env: {RT_FUZZ_RACE: '1'}, quick: {RT_FUZZ_RACE_ITERATIONS: '5', RT_FUZZ_RACE_FANOUT: '8'}, soak: {RT_FUZZ_RACE_ITERATIONS: '25', RT_FUZZ_RACE_FANOUT: '8'}},
  // Robustness fuzz of the committed go:embed sidecar bundle under real node
  // (garbage patterns/flags/samples + oversized batches; RT_FUZZ_SEED replays).
  sidecar: {patterns: ['patternSidecarFuzz']},
  // Generation fuzz of the sidecar's `generate` op (supported-subset round-trip
  // + determinism oracles, adversarial construct contract; RT_FUZZ_SEED replays).
  patterngen: {patterns: ['patternGenFuzz']},
  // Format-conversion sweep (Go-side: the printers live in internal/convert).
  // Chain oracle per iteration: ids preserved on every leg (C2), canonical
  // reflection graphs equal (C6), full chain converges (C4), re-conversion is
  // a byte no-op (C5). RT_FUZZ_SEED replays a failure; RT_FUZZ_ITER widens.
  convert: {goTest: ['./internal/convert/', '-run', 'TestFuzz_AtomChain|TestFuzz_DrizzleRoundTrip', '-count=1'], quick: {RT_FUZZ_ITER: '30'}, soak: {RT_FUZZ_ITER: '150'}},
  // FE twin of `convert`: the REAL `ts-runtypes convert` binary over a real
  // temp project, randomized form chains over the full generated type space,
  // per-leg id checks + the byte-equal type-form fixpoint oracle.
  convertcli: {patterns: ['convertFuzz.integration'], quick: {RT_FUZZ_ITER: '10'}, soak: {RT_FUZZ_ITER: '40'}},
  // Drizzle pure-types road: random table specs rendered as TYPE SOURCE,
  // scanned by the real resolver, tableFromType over the reflected graph must
  // equal a raw drizzle build (the wide in-process three-surface fuzz rides
  // the ordinary drizzle-pg vitest project). RT_FUZZ_SEED replays.
  drizzletypes: {patterns: ['drizzleTypeSource.integration'], quick: {RT_FUZZ_ITER: '10'}, soak: {RT_FUZZ_ITER: '40'}},
  // Honest composite: EVERY lane at its default budget — the whole test/fuzz
  // tree (all JS lanes + the unit files + the fuzz-adjacent regression tests),
  // both sidecar lanes, the race test (via the env below), and both Go sweeps
  // under internal/convert (`-run TestFuzz_` also catches the lane-less
  // schemadoc determinism sweep). No tier blocks on purpose: a quick/soak
  // round is per-lane so the time-boxed lanes never share CPU (rule above).
  all: {patterns: ['test/fuzz', 'patternSidecarFuzz', 'patternGenFuzz'], env: {RT_FUZZ_RACE: '1'}, goTest: ['./internal/convert/', '-run', 'TestFuzz_', '-count=1']},
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
  fnhashes: {run: [...GO_RUN, './cmd/gen-fn-hashes'], stdoutTo: 'packages/run-types/src/go-generated/fnHashes.generated.ts', outputs: ['packages/run-types/src/go-generated/fnHashes.generated.ts'], fmt: ['packages/run-types/src/go-generated/fnHashes.generated.ts']},
  // Type-format metadata mirror: the canonical format names (+ base RunTypeKind)
  // each emitter under internal/cachegen/typefunctions/formats registers, so a
  // reflection consumer keys off `typeFormats` instead of re-declaring the names.
  typeformats: {run: [...GO_RUN, './cmd/gen-type-formats'], stdoutTo: 'packages/run-types/src/go-generated/typeFormats.generated.ts', outputs: ['packages/run-types/src/go-generated/typeFormats.generated.ts'], fmt: ['packages/run-types/src/go-generated/typeFormats.generated.ts']},
  diag: {run: ['node', 'scripts/core/gen-diagnostics-catalog.mjs'], outputs: ['packages/ts-runtypes-devtools/src/go-generated/diagnosticCatalog.generated.ts', 'container/website/app/components/content/go-generated/diagnostics-catalog.json'], fmt: []},
  // Built-in pure-fn body table (Go, not a Go->TS mirror): extracts the
  // package's own `rt::`/`rtFormats::` registrations from packages/run-types/src
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

// A lane is TIME-BOXED when its budget is a wall clock (RT_FUZZ_*_SOAK_MS):
// CPU contention silently buys it LESS coverage, so such lanes must never run
// concurrently (see the FUZZ registry note). Count-based lanes are immune.
const isTimeBoxed = (lane) => Object.keys(FUZZ[lane].soak ?? {}).some((key) => key.endsWith('_SOAK_MS'));

// rtx core fuzz <lane…> [--quick|--soak] [vitest/go args…]
// Several lanes in ONE invocation pay vitest's startup once (~80s saved over
// six separate runs), which is why ci.yml runs the time-boxed lanes this way.
// The scheduling rule is ENFORCED here, not just documented: a multi-lane run
// that includes a time-boxed lane goes sequential automatically.
function runFuzz(args) {
  const {value: quick, rest: afterQuick} = takeFlag(args, '--quick');
  const {value: soak, rest: afterSoak} = takeFlag(afterQuick, '--soak');
  // Lanes are the LEADING words; everything from the first flag on is forwarded
  // verbatim to vitest/go (so `fuzz value -t "soak"` still works).
  const firstFlag = afterSoak.findIndex((arg) => arg.startsWith('-'));
  const lanes = firstFlag === -1 ? afterSoak : afterSoak.slice(0, firstFlag);
  const extra = firstFlag === -1 ? [] : afterSoak.slice(firstFlag);
  if (!lanes.length) die(`name at least one fuzz suite. Try: ${Object.keys(FUZZ).join(' | ')} [--quick|--soak]`);
  for (const lane of lanes) if (!Object.hasOwn(FUZZ, lane)) die(`unknown fuzz suite '${lane}'. Try: ${Object.keys(FUZZ).join(' | ')} [--quick|--soak]`);
  if (quick && soak) die(`pick one budget tier: --quick or --soak, not both`);
  const tier = quick ? 'quick' : soak ? 'soak' : undefined;

  const env = {};
  for (const lane of lanes) {
    if (tier && !FUZZ[lane][tier]) die(`fuzz suite '${lane}' has no ${tier} budget${lane === 'all' ? ' on purpose — budget tiers are per-lane so the time-boxed lanes never share CPU (see the FUZZ registry note)' : ''}`);
    for (const [key, value] of Object.entries({...(FUZZ[lane].env ?? {}), ...(tier ? FUZZ[lane][tier] : {})})) {
      // convert + convertcli share RT_FUZZ_ITER, so one invocation cannot give
      // them different budgets — fail loudly instead of silently picking one.
      if (key in env && env[key] !== value) die(`'${lanes.join(' ')}' collide on ${key} (${env[key]} vs ${value}) — run those lanes separately`);
      env[key] = value;
    }
  }

  const patterns = lanes.flatMap((lane) => FUZZ[lane].patterns ?? []);
  const goTests = lanes.filter((lane) => FUZZ[lane].goTest);
  const configs = lanes.filter((lane) => FUZZ[lane].config);
  if (configs.length && lanes.length > 1) die(`fuzz suite '${configs[0]}' runs its own vitest config — run it on its own`);
  // Enforced, not advisory: sequential the moment a time-boxed lane shares the
  // invocation, unless the caller already said how to parallelise.
  const sequential = lanes.length > 1 && lanes.some(isTimeBoxed) && !extra.some((arg) => arg.includes('file-parallelism'));
  if (sequential) console.log(`rtx: running ${lanes.length} lanes sequentially — ${lanes.filter(isTimeBoxed).join(', ')} time-boxed (contention would silently cut coverage)`);

  ensureBuilt();
  if (configs.length) proxy('pnpm', ['exec', 'vitest', 'run', '--config', FUZZ[configs[0]].config, ...extra], env);
  else if (patterns.length) proxy('pnpm', ['exec', 'vitest', 'run', ...(sequential ? ['--no-file-parallelism'] : []), ...patterns, ...extra], env);
  for (const lane of goTests) proxy('go', ['-C', 'ts-go-runtypes', 'test', ...FUZZ[lane].goTest, ...extra], env);
}

function runCore(args) {
  const [sub, ...rest] = args;
  if (sub === 'build') return coreBuild(rest);
  if (sub === 'smoke') return (ensureBuilt(), proxy('node', ['scripts/core/smoke.mjs', ...rest]));
  if (sub === 'bump-tsgolint') return proxy('node', ['scripts/core/bump-tsgolint.mjs', ...rest]);
  if (sub === 'ensure-tsgolint') return proxy('node', ['scripts/core/ensure-tsgolint.mjs', ...rest]);
  // drizzle's own integration suites, fetched at the pinned tag and sha256-verified
  // into .cache/drizzle-suites/ for the drizzle-e2e lane to translate and run.
  // --record re-pins at a new tag; --check verifies without downloading.
  if (sub === 'drizzle-suites') return proxy('node', ['scripts/drizzle/fetch-suites.mjs', ...rest]);
  if (sub === 'codegen') return runCodegen(rest);
  // The batched whole-suite run behind `pnpm run test:ci`, and its drift gate:
  // every project in vitest.config.ts must belong to exactly one batch. --check is
  // the read-only CI gate (ci.yml), and the run itself refuses to start on drift.
  if (sub === 'test-batches') {
    // --check / --list are pure file reads: no build, so the CI drift gate stays cheap.
    if (!hasFlag(rest, '--check', '--list')) ensureBuilt();
    return proxy('node', ['scripts/core/test-batches.mjs', ...rest]);
  }
  // The drizzle proxy manifest gate: regenerates the per-dialect manifests, driven by the
  // hand-owned drizzle-dialects.json at the repo root (the required --config), from
  // drizzle-orm's d.ts via the embedded checker; --check is the read-only CI gate
  // (drift + pending entries + migrated-wrapper coverage), so it is NOT a CODEGEN row.
  if (sub === 'drizzle-manifest')
    return proxy('go', [
      '-C',
      'ts-go-runtypes',
      'run',
      './cmd/gen-drizzle-manifest',
      '--repo-root',
      REPO_ROOT,
      '--config',
      'drizzle-dialects.json',
      ...rest,
    ]);
  // The whole suite tree, converted into the value forms and run against the
  // same assertions. Generates, runs, removes — see scripts/core/converted-suites.mjs.
  if (sub === 'converted-suites') return (ensureBuilt(), proxy('node', ['scripts/core/converted-suites.mjs', ...rest]));
  // Translate only, no container and no database: rewrite the vendored drizzle
  // suites onto the slim packages so the translation can be inspected. The full
  // lane is `rtx release drizzle-e2e`.
  if (sub === 'drizzle-translate') return (ensureBuilt(), proxy('node', ['scripts/core/drizzle-translate.mjs', ...rest]));
  // The machine-readable soak lane list (every FUZZ entry with a soak budget),
  // as sorted JSON. release-gate.yml and fuzz-soak.yml build their matrices
  // from this — bare node, no deps, no build, no env needed.
  if (sub === 'fuzz-lanes') {
    process.stdout.write(`${JSON.stringify(Object.keys(FUZZ).filter((lane) => FUZZ[lane].soak).sort())}\n`);
    return;
  }
  if (sub === 'fuzz') return runFuzz(rest);
  die(
    'usage: rtx core <build|smoke|test-batches [--check|--list]|fuzz <suite> [--quick|--soak]|fuzz-lanes|codegen [--check]|drizzle-manifest [--check|--pending]|drizzle-suites [--record|--check]|drizzle-translate [--to-types] [--keep]|converted-suites [--target T] [--keep]|bump-tsgolint [<rev>]|ensure-tsgolint [--check]>'
  );
}

// ── website ────────────────────────────────────────────────────────────────
async function runWebsite(args) {
  let [sub, ...rest] = args;
  // ONE Nuxt install, TWO sites. `--site` sets RT_SITE for the whole command, which
  // is what every leaf (site.mjs, build.mjs, check-static.mjs, serve.mjs) reads.
  // `build` additionally accepts `--site both` to do them one after the other.
  const siteOpt = takeFlag(rest, '--site', {valued: true});
  rest = siteOpt.rest;
  if (siteOpt.value && siteOpt.value !== 'both') process.env.RT_SITE = siteOpt.value;
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
    return main([target, ...(siteOpt.value ? ['--site', siteOpt.value] : []), ...skip.rest]);
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
      const pass = takeFlag(rest, '--static').rest;
      return main([...pass, ...(siteOpt.value && siteOpt.value !== 'both' ? ['--site', siteOpt.value] : [])]);
    }
    const {main} = await import('./website/site.mjs');
    return main([hasFlag(rest, '--docs') ? 'verify-docs' : 'smoke']);
  }
  // Recount the homepage's test tiles. `--check` fails instead of writing, so CI
  // can gate the committed file the same way the codegen checks do.
  if (sub === 'test-counts') {
    const {main} = await import('./website/gen-test-counts.mjs');
    return main(rest);
  }
  if (sub === 'shell') {
    const {main} = await import('./website/site.mjs');
    return main(['shell']);
  }
  die('usage: rtx website [--site runtypes|mion|both] <dev [--agent]|build [--no-bench|--quick|--ssr|--skip-playground]|preview [--no-build]|check [--docs|--static]|test-counts [--check]|container-build|shell>');
}

// ── bench ────────────────────────────────────────────────────────────────
const BENCH_SUB = new Set(['audit', 'typecheck', 'engine-check', 'typecost', 'compiletime', 'serialization', 'smoke', 'prep', 'clean', 'capture-env', 'shell', 'transform-wire', 'fullbench', 'website-bench', 'bench-one', 'build']);
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
// `rtx bench servers …` is the OTHER benchmark family: the mion HTTP server
// benchmarks, which run in their own mion-bench image. Everything after `servers` is
// that driver's own verb list, so the two families never share an argument space.
const SERVERS_AREA = 'servers';
async function runServersBench(args) {
  const {main} = await import('./website/bench-data/mion-bench.mjs');
  return main(args);
}
async function runBench(args) {
  if (args[0] === SERVERS_AREA) return runServersBench(args.slice(1));
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
    'check-drizzle-versions': ['node', ['scripts/release/check-drizzle-versions.mjs']],
    e2e: ['node', ['scripts/release/e2e.mjs']],
    // drizzle's OWN suites, translated onto the slim packages and run against a
    // real postgres / mysql / sqlite in their three containers.
    'drizzle-e2e': ['node', ['scripts/release/drizzle-e2e.mjs']],
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
  rtx release check-drizzle-versions [--changes]   guard: @mionjs/drizzle-orm-*-core versions/peer ranges/manifests match the installed drizzle-orm (--changes also lists which are due a patch bump)
  rtx release manual-publish [--skip-build|--dry-run|--yes]   first-publish bootstrap: build + npm login + publish all 10 LIVE (resumable)
  rtx release e2e [--backend container|host-npx] [--pack]   pre-publish e2e (containerized verdaccio + feature matrix + mion consumer lanes + host smoke)
  rtx release e2e --backend npm [--registry URL] [--version V] [--no-matrix]   post-publish e2e (install the LIVE @ts-runtypes/* from npm + run the same suite)
  rtx release e2e --no-mion               skip the @mionjs/* consumer + bun lanes (runtypes matrix only)
`;

const HELP = `rtx — internal RunTypes dev/build/publish CLI  (run as: pnpm rtx <area> <command>)

core     the engine (Go resolver + TS marker/plugin)
  rtx core build [targets…]        build the binary + dev dists if stale
  rtx core smoke                   end-to-end smoke of the resolver + devtools
  rtx core test-batches [--check|--list]   the batched whole vitest suite (what test:ci runs); --check gates the batches against vitest.config.ts
  rtx core fuzz <suite> [--quick|--soak]   unit|value|types|nondata|roundtrip|size|cloning|enrich|i18n|typemod|race|sidecar|patterngen|convert|convertcli|all
  rtx core fuzz-lanes              print the soak lane list as JSON (the workflows' matrix source)
  rtx core codegen [all|constants|kind|fnhashes|typeformats|diag|builtinpurefns|pluginkeys|sidecar] [--check]   regenerate Go→TS mirrors, pure-fn table + sidecar bundle
  rtx core drizzle-manifest [--check|--pending]   refresh the drizzle proxy column manifests (--check: CI drift + coverage gate; --pending: list entries awaiting review)
  rtx core converted-suites [--keep]   convert the suite tree into the builders form, run it, remove it
  rtx core drizzle-suites [--record|--check]   fetch + sha256-verify drizzle's own integration suites at the pinned tag
  rtx core drizzle-translate [--to-types] [--keep]   translate those suites onto the slim packages (no container, no database)
  rtx core bump-tsgolint [<rev>] [--skip-tests]   move the tsgolint/typescript-go pin (default: latest release), re-patch, rebuild + test
  rtx core ensure-tsgolint [--check]   check the submodule out to tsgolint.pin.json + re-apply patches (--check verifies only)

website
  rtx website dev [--agent]        hot-reload docs server (:3000, or :3100 --agent)
  rtx website build [--no-bench]   build the docs site (WITH benchmarks; --no-bench reuses data)
                    [--quick] [--ssr] [--skip-playground]
  rtx website preview [--no-build] serve the static site locally; regenerates it first unless --no-build
  rtx website check [--docs]       serves-a-page smoke (code-import + twoslash with --docs)
  rtx website check --static       serve the BUILT site + assert every benchmark page renders
  rtx website test-counts [--check]  recount the homepage's test tiles (vitest list + go test -list)
  rtx website container-build      container-only prod build (not the full pipeline)
  rtx website shell                debug shell inside the website container

bench
  rtx bench [--one <name>|--full|--website|--build-only] [--quick]
  rtx bench <audit|typecost|compiletime|serialization|smoke>
  rtx bench typecheck              compile every competitor map in the image (totality gate)
  rtx bench servers [--quick]      mion HTTP server benchmarks (own image; see below)
  rtx bench servers <one <app>|suite <key>|sweep|build|prep|aggregate|build-image|push|pull|clean>

${RELEASE_HELP}
container  rtx container <build-image|ensure|login|push|pull|lock|clean> [website|e2e]
           (build-image/push/pull/clean act on BOTH images when no target is given)
env        rtx env [push-image|publish-npm|deploy-website|--create-env]

verify     build if stale, then lint + typecheck + format check
fmt        format (oxfmt + prettier + gofmt); --check is read-only
clean      hard clean: dists, caches, run artifacts + node_modules
           (--keep-deps keeps node_modules, --dry-run lists, --deep reinstalls after)
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
    // Hard clean by default (dists, caches, run artifacts, node_modules); --deep
    // reinstalls afterwards. --keep-deps / --dry-run pass through to clean.mjs.
    case 'clean': return hasFlag(rest, '--deep') ? proxy('pnpm', ['run', 'fresh-start']) : proxy('pnpm', ['run', 'clean', ...rest]);
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
