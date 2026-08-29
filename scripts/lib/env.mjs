// env.mjs — the ONE place that loads the repo-root .env and defines the env-var
// registry. loadEnv() is called once at the rt.mjs entry point (and by each leaf's
// direct-invocation footer, idempotently); REGISTRY is the single source of truth
// for every env var the project consumes. Folds the old scripts/env/registry.sh
// (shell load + rt_env_registry table) and scripts/env/load.mjs (the JS loader)
// into one module, so there is no more shell/JS load-path duplication.
//
// .env is DEV-ONLY: it is git-ignored (so it is never in a CI checkout), and we
// also skip loading it when CI is set — belt and suspenders, so a stray .env can
// never affect GitHub Actions. process.loadEnvFile does NOT override an
// already-set var, so a real inline env or CI env always wins and .env fills gaps
// only (a deliberate change from the old shell `set -a; . .env`, which overrode).

import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The Go tree lives under ts-go-runtypes/ (cmd/, internal/, third_party/, go.*).
// Every `go`/`gofmt` invocation runs with cwd: GO_ROOT so the `./cmd/...` and
// `./internal/...` package specs resolve; binary output stays under REPO_ROOT/bin.
export const GO_ROOT = join(REPO_ROOT, 'ts-go-runtypes');

// The two docs sites one Nuxt install (container/website/) builds, selected by
// RT_SITE. Mirrors SITES in container/website/site.config.ts, which is the copy the
// in-container Nuxt config reads; this one is for the host-side scripts.
export const SITES = ['runtypes', 'mion'];

let loaded = false;
// Load the repo-root .env into process.env (dev only), once. No-op when CI is set
// or .env is absent; safe to call from anywhere (rt.mjs and every leaf footer).
export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const envFile = join(REPO_ROOT, '.env');
  if (!process.env.CI && existsSync(envFile)) process.loadEnvFile(envFile);
}

// The registry: the SINGLE SOURCE OF TRUTH for every env var the project consumes
// (scripts, containers, CI, tests). env/check.mjs reports it; .env.sample mirrors
// the user-settable rows only (dev + secret). Every NEW env var MUST be added here.
//   scope  dev      = local knob with a default (set in .env to override)
//          secret   = a credential: set in .env to run the step from LOCAL, or as a
//                     GitHub repo/Environment secret when the step runs in CI
//          internal = set by the scripts themselves (container paths / plumbing);
//                     documented for reference, NEVER put in .env (setting it breaks runs)
//   task   the operation that needs it       |  '-' = optional knob (has a default)
// Runtypes-owned vars are prefixed RT_; external/standard names (GHCR_*, NPM_TOKEN,
// CLOUDFLARE_*, CI) keep their conventional spelling so the tools that read them work.
export const REGISTRY = [
  // — secrets (credentials: .env locally, GitHub secrets in CI) —
  {name: 'GHCR_PAT', scope: 'secret', task: 'push-image', desc: 'GitHub PAT for the shared images: write:packages to PUSH from local (pnpm rtx container push, via .env) AND read:packages to PULL the private images in CI - the release gate / post-publish / website-deploy pass the GitHub secret to the pull-shared-image action, because tsrt-e2e is a private package the repo GITHUB_TOKEN is denied'},
  {name: 'NPM_TOKEN', scope: 'secret', task: 'publish-npm', desc: 'npm automation/granular token, used both by the LOCAL interactive publish (scripts/release/publish.mjs, via .env) AND the CI stage-publish (publish.yml, via the GitHub secret written to ~/.npmrc)'},
  {name: 'CLOUDFLARE_API_TOKEN', scope: 'secret', task: 'deploy-website', desc: 'Cloudflare Pages: Edit token; .env for a local deploy, a GitHub secret in CI'},
  {name: 'CLOUDFLARE_ACCOUNT_ID', scope: 'secret', task: 'deploy-website', desc: 'Cloudflare account id; .env for a local deploy, a GitHub secret in CI'},

  // — deploy config (non-secret) —
  {name: 'CLOUDFLARE_PAGES_PROJECT', scope: 'dev', task: 'deploy-website', desc: 'Cloudflare Pages project name for the RUNTYPES site (default runtypes); .env for a local deploy, set in website-deploy.yml for CI'},
  {name: 'CLOUDFLARE_PAGES_PROJECT_MION', scope: 'dev', task: 'deploy-website', desc: 'Cloudflare Pages project name for the MION site (default mion); .env for a local deploy, set in website-deploy.yml for CI'},

  // — GHCR coordinates (defaults already target this repo) —
  {name: 'GHCR_OWNER', scope: 'dev', task: '-', desc: 'GHCR namespace (default mionkit)'},
  {name: 'GHCR_USER', scope: 'dev', task: '-', desc: 'GHCR login user (cosmetic; the PAT authenticates; default M-jerez)'},
  {name: 'GHCR_REGISTRY', scope: 'dev', task: '-', desc: 'GHCR registry host (default ghcr.io)'},

  // — image source toggles (opt out of the GHCR pull; build/use a local image) —
  {name: 'RT_WEBSITE_USE_LOCAL', scope: 'dev', task: '-', desc: 'Build the shared image locally instead of pulling from GHCR'},
  {name: 'RT_BENCH_USE_LOCAL', scope: 'dev', task: '-', desc: 'Build the shared image locally for benchmark runs'},

  // — docs website knobs (scripts/website/site.mjs, scripts/container/image.mjs) —
  {name: 'RT_SITE', scope: 'dev', task: '-', desc: 'Which of the two docs sites to serve/build/check: runtypes (default) or mion. One Nuxt install in container/website/ builds both; RT_SITE picks the content tree, the app.config and the public assets. Read by nuxt.config.ts + content.config.ts inside the container and by every scripts/website/ leaf; `pnpm rtx website --site <name>` sets it'},
  {name: 'RT_WEBSITE_ENGINE', scope: 'dev', task: '-', desc: 'Container engine (default podman)'},
  {name: 'RT_WEBSITE_IMAGE', scope: 'dev', task: '-', desc: 'Local image tag (default tsrt-website:dev)'},
  {name: 'RT_WEBSITE_CONTAINER', scope: 'dev', task: '-', desc: 'Container name prefix (default tsrt-website)'},
  {name: 'RT_WEBSITE_PORT', scope: 'dev', task: '-', desc: 'Dev server host port (default 3000)'},
  {name: 'RT_WEBSITE_AGENT_PORT', scope: 'dev', task: '-', desc: 'Agent-mode host port (default 3100)'},
  {name: 'RT_WEBSITE_AGENT_IDLE_SECONDS', scope: 'dev', task: '-', desc: 'Agent-mode idle self-stop seconds (default 300)'},
  {name: 'RT_WEBSITE_POLL', scope: 'dev', task: '-', desc: 'Force fs polling for watchers (default 1 on macOS, 0 on Linux)'},
  {name: 'RT_WEBSITE_REPO_CONTEXT', scope: 'dev', task: '-', desc: 'Host checkout with packages/ for code-import/twoslash (default this repo)'},
  {name: 'RT_WEBSITE_DOCDATA', scope: 'dev', task: '-', desc: 'Host dir of generated bench/test JSON the docs read (default .docdata)'},
  {name: 'RT_WEBSITE_SKIP_PLAYGROUND', scope: 'dev', task: '-', desc: 'Skip auto-building the /playground bundle on run'},
  {name: 'RT_WEBSITE_MOUNT_OPTS', scope: 'dev', task: '-', desc: 'Extra bind-mount opts, e.g. ":z" on SELinux'},
  {name: 'RT_WEBSITE_RUN_NETWORK', scope: 'dev', task: '-', desc: 'podman run network (e.g. "host" behind a proxy)'},
  {name: 'RT_WEBSITE_BUILD_NETWORK', scope: 'dev', task: '-', desc: 'podman build network (e.g. "host" behind a proxy)'},
  {name: 'RT_WEBSITE_BASE_IMAGE', scope: 'dev', task: '-', desc: 'Node base image (default node:26-bookworm); mirror for air-gapped builds'},
  {name: 'RT_WEBSITE_PNPM_VERSION', scope: 'dev', task: '-', desc: 'Override the pnpm version baked into the image'},
  {name: 'RT_WEBSITE_CA_CERT', scope: 'dev', task: '-', desc: 'File/dir of extra CA certs to trust in the image (corporate/MITM proxy). Used at BUILD time (baked) and at RUN time (mounted + NODE_EXTRA_CA_CERTS) so a PULLED image can still reach TLS endpoints, e.g. the e2e verdaccio uplink to npmjs'},
  {name: 'RT_WEBSITE_REMOTE_IMAGE', scope: 'dev', task: '-', desc: 'GHCR ref to pull (default ghcr.io/$GHCR_OWNER/tsrt-website:latest)'},
  {name: 'RT_WEBSITE_SMOKE_TIMEOUT', scope: 'dev', task: '-', desc: 'Seconds to wait for the smoke/verify server (default 90/120)'},

  // — benchmark knobs (scripts/website/bench-data/bench.mjs) —
  {name: 'RT_BENCH_ENGINE', scope: 'dev', task: '-', desc: 'Container engine (default podman)'},
  {name: 'RT_BENCH_IMAGE', scope: 'dev', task: '-', desc: 'Local image tag (default tsrt-website:dev)'},
  {name: 'RT_BENCH_CONTAINER', scope: 'dev', task: '-', desc: 'Container name prefix (default tsrt-bench)'},
  {name: 'RT_BENCH_NO_TYPIA', scope: 'dev', task: '-', desc: 'Skip the typia competitor (its native plugin build)'},
  {name: 'RT_BENCH_QUICK', scope: 'dev', task: '-', desc: 'Fast/preview benchmark numbers (noisy)'},
  {name: 'RT_BENCH_NO_TIMING', scope: 'dev', task: '-', desc: 'Correctness-only run (no timing)'},
  {name: 'RT_BENCH_TIME_MS', scope: 'dev', task: '-', desc: 'Per-cell timing window in ms (default 100)'},
  {name: 'RT_BENCH_BUN', scope: 'dev', task: '-', desc: "Set to 0 to skip the benchmarks' bun runtime lane (default: on). The lane re-runs each competitor's already-built dist/run.mjs under bun, which is what exercises the JavaScriptCore branch of rt::countEnumKeys"},
  {name: 'RT_BENCH_SKIP_GROUPS', scope: 'internal', task: '-', desc: 'Comma-separated case GROUPS recorded as not-supported instead of run, for runtime capability gaps (the bun lane sets DATETIME: bun ships no Temporal). Set by bench.mjs; listed in each result JSON as skippedGroups'},
  {name: 'RT_BENCH_CASE', scope: 'dev', task: '-', desc: 'Restrict a run to matching case names (inspection)'},
  {name: 'RT_BENCH_DUMP', scope: 'dev', task: '-', desc: 'Print typecost probe sources (debug)'},
  {name: 'RT_BENCH_SERIALIZATION_OUT', scope: 'dev', task: '-', desc: 'Serialization bench output dir (default container/website/public/bench-data)'},
  {name: 'RT_COMPILETIME_N', scope: 'dev', task: '-', desc: 'Compile-time bench repeat count (default 5)'},
  {name: 'RT_COMPILETIME_COMPETITORS', scope: 'dev', task: '-', desc: 'Libraries to measure compile time for (default "ts-runtypes typia")'},
  {name: 'RT_TRANSFORM_WIRE_N', scope: 'dev', task: '-', desc: 'Transform-wire bench per-cell repeat count (default 5)'},
  {name: 'RT_BENCH_DOCDATA', scope: 'dev', task: '-', desc: 'Host dir to publish benchmark JSON into (default .docdata)'},
  {name: 'RT_BENCH_REMOTE_IMAGE', scope: 'dev', task: '-', desc: 'GHCR ref to pull (default ghcr.io/$GHCR_OWNER/tsrt-website:latest)'},
  {name: 'RT_BENCH_MOUNT_OPTS', scope: 'dev', task: '-', desc: 'Extra bind-mount opts, e.g. ":z" on SELinux'},
  {name: 'RT_BENCH_RUN_NETWORK', scope: 'dev', task: '-', desc: 'podman run network (e.g. "host" behind a proxy)'},
  {name: 'RT_BENCH_BUILD_NETWORK', scope: 'dev', task: '-', desc: 'podman build network, forwarded to the image build'},
  {name: 'RT_BENCH_BASE_IMAGE', scope: 'dev', task: '-', desc: 'Node base image, forwarded to the image build'},
  {name: 'RT_BENCH_PNPM_VERSION', scope: 'dev', task: '-', desc: 'pnpm version, forwarded to the image build'},
  {name: 'RT_BENCH_CA_CERT', scope: 'dev', task: '-', desc: 'Extra CA certs, forwarded to the image build'},

  // — engine-branch tripwire (scripts/website/bench-data/engine-perf-check.mjs) —
  {name: 'RT_BENCH_ENGINE_ASSERT', scope: 'dev', task: '-', desc: "Set to 1 to make the engine-perf check FAIL on an inverted rt::countEnumKeys counter instead of only reporting it (website-deploy.yml sets 0 while the arm64 numbers are unmeasured). NOT the same knob as RT_BENCH_ENGINE, which picks the container engine"},
  {name: 'RT_BENCH_ENGINE_MARGIN', scope: 'dev', task: '-', desc: 'How much faster the selected counter must be before the engine-perf check calls the pick wrong (default 1.15)'},
  {name: 'RT_BENCH_ENGINE_ITERS', scope: 'dev', task: '-', desc: 'Iterations per engine-perf-check measurement (default 2000000)'},

  // — mion HTTP server benchmarks (`rtx bench servers`, scripts/website/bench-data/mion-bench.mjs).
  //   Their own image (mion-bench), so their own knobs; the RT_BENCH_* set above drives
  //   the validation benchmarks in tsrt-website and the two never share a container. —
  {name: 'MION_BENCH_ENGINE', scope: 'dev', task: '-', desc: 'Container engine for the server benchmarks (default podman)'},
  {name: 'MION_BENCH_IMAGE', scope: 'dev', task: '-', desc: 'Local image tag (default mion-bench:dev)'},
  {name: 'MION_BENCH_REMOTE_IMAGE', scope: 'dev', task: '-', desc: 'GHCR ref to pull (default ghcr.io/$GHCR_OWNER/mion-bench:latest)'},
  {name: 'MION_BENCH_USE_LOCAL', scope: 'dev', task: '-', desc: 'Build the mion-bench image locally instead of pulling it from GHCR'},
  {name: 'MION_BENCH_QUICK', scope: 'dev', task: '-', desc: 'Short load windows for a dev loop. The numbers are noisy and must never be published'},
  {name: 'MION_BENCH_DURATION', scope: 'dev', task: '-', desc: 'Seconds of measured load per lane (default 20)'},
  {name: 'MION_BENCH_WARMUP', scope: 'dev', task: '-', desc: 'Seconds of warm-up load before the measured window, so JIT warm-up never lands in the numbers (default 5)'},
  {name: 'MION_BENCH_CONNECTIONS', scope: 'dev', task: '-', desc: 'Concurrent connections autocannon opens (default 100)'},
  {name: 'MION_BENCH_PIPELINING', scope: 'dev', task: '-', desc: 'Requests pipelined per connection (default 1)'},
  {name: 'MION_BENCH_TIMEOUT', scope: 'dev', task: '-', desc: 'Seconds autocannon waits for a response before counting the request as an error (default 60)'},
  {name: 'MION_BENCH_INFLIGHT_BUDGET', scope: 'dev', task: '-', desc: 'Ceiling on request-body bytes in flight; caps connections on the big payload-sweep sizes (default 100 MiB)'},
  {name: 'MION_BENCH_PORT', scope: 'dev', task: '-', desc: 'Port the benchmarked server listens on inside the container (default 3000)'},
  {name: 'MION_BENCH_DOCDATA', scope: 'dev', task: '-', desc: 'Host dir to publish server-benchmark JSON into (default .docdata)'},
  {name: 'MION_BENCH_MOUNT_OPTS', scope: 'dev', task: '-', desc: 'Extra bind-mount opts, e.g. ":z" on SELinux'},
  {name: 'MION_BENCH_RUN_NETWORK', scope: 'dev', task: '-', desc: 'podman run network for the server benchmarks'},
  {name: 'MION_BENCH_RESULTS_DIR', scope: 'internal', task: '-', desc: 'In-container results dir for the server benchmarks (passed via -e)'},
  {name: 'MION_BENCH_HOST_CPU', scope: 'internal', task: '-', desc: 'Host CPU model captured into the server-benchmark metadata (the container cannot read it; passed via -e)'},

  // — fuzz test knobs (the harness; `rtx core fuzz <lane> [--quick|--soak]`
  //   sets them per lane from the FUZZ registry in scripts/rt.mjs) —
  {name: 'RT_FUZZ_SEED', scope: 'dev', task: '-', desc: 'Fuzz PRNG seed (default: derived from the package version + lane)'},
  {name: 'RT_FUZZ_ITER', scope: 'dev', task: '-', desc: 'convert fuzz sweep iteration count — drives BOTH convert lanes (Go sweeps default 6, the CLI twin 5)'},
  {name: 'RT_FUZZ_SOAK_MS', scope: 'dev', task: '-', desc: 'value fuzz soak duration in ms'},
  {name: 'RT_FUZZ_TYPES_SOAK_MS', scope: 'dev', task: '-', desc: 'type fuzz soak duration in ms'},
  {name: 'RT_FUZZ_SIZE_SOAK_MS', scope: 'dev', task: '-', desc: 'binary-size fuzz soak duration in ms'},
  {name: 'RT_FUZZ_ROUNDTRIP_SOAK_MS', scope: 'dev', task: '-', desc: 'round-trip fuzz soak duration in ms'},
  {name: 'RT_FUZZ_ELISION_SOAK_MS', scope: 'dev', task: '-', desc: 'elision form-equivalence fuzz soak duration in ms'},
  {name: 'RT_FUZZ_NONDATA_SOAK_MS', scope: 'dev', task: '-', desc: 'non-data type fuzz soak duration in ms'},
  {name: 'RT_FUZZ_CLONE_SOAK_MS', scope: 'dev', task: '-', desc: 'clone fuzz soak duration in ms'},
  {name: 'RT_FUZZ_ENRICH_SEQUENCES', scope: 'dev', task: '-', desc: 'enrich fuzz sequence count (default 6)'},
  {name: 'RT_FUZZ_ENRICH_MAXCMDS', scope: 'dev', task: '-', desc: 'enrich fuzz max commands per sequence (default 8)'},
  {name: 'RT_FUZZ_ENRICH_REPLAY', scope: 'dev', task: '-', desc: 're-run one failing enrich sequence verbatim (seed)'},
  {name: 'RT_FUZZ_I18N_SEQUENCES', scope: 'dev', task: '-', desc: 'i18n-sync fuzz sequence count (default 6)'},
  {name: 'RT_FUZZ_I18N_MAXCMDS', scope: 'dev', task: '-', desc: 'i18n-sync fuzz max commands per sequence (default 10)'},
  {name: 'RT_FUZZ_I18N_REPLAY', scope: 'dev', task: '-', desc: 're-run one failing i18n-sync sequence verbatim (seed)'},
  {name: 'RT_FUZZ_TYPEMOD_SEQUENCES', scope: 'dev', task: '-', desc: 'type-mod fuzz sequence count (default 6)'},
  {name: 'RT_FUZZ_TYPEMOD_MAXSTEPS', scope: 'dev', task: '-', desc: 'type-mod fuzz max steps per sequence (default 8)'},
  {name: 'RT_FUZZ_TYPEMOD_REPLAY', scope: 'dev', task: '-', desc: 're-run one failing type-mod sequence verbatim (seed)'},
  {name: 'RT_FUZZ_TYPEMOD_REPORT', scope: 'dev', task: '-', desc: 'print type-mod run/skip/flake/coverage stats'},
  {name: 'RT_FUZZ_TYPEMOD_DEBUG', scope: 'dev', task: '-', desc: 'verbose type-mod failure diagnostics'},
  {name: 'RT_FUZZ_RACE', scope: 'dev', task: '-', desc: 'enable the enrich race test (set by rt core fuzz race)'},
  {name: 'RT_FUZZ_RACE_ITERATIONS', scope: 'dev', task: '-', desc: 'enrich race iterations (default 2)'},
  {name: 'RT_FUZZ_RACE_FANOUT', scope: 'dev', task: '-', desc: 'enrich race fanout (default 6)'},

  // — resolver knobs (the ts-runtypes Go binary) —
  {name: 'RT_CACHE_DIR', scope: 'dev', task: '-', desc: 'Internal RT disk-cache override (tests/power users): path forces it on there, "" forces it off, unset follows the tsconfig incremental/composite setting'},
  {name: 'RT_BIN', scope: 'dev', task: '-', desc: "Path to the resolver binary @ts-runtypes/bin's getExePath() should use, overriding the platform package (and the in-repo dev binary) for BOTH the bundler and lint lanes. Must name an executable file or the lookup throws. Its version folds into every typeId, so an override of a different version yields caches that diverge from a normal install"},
  {name: 'RT_JS_RUNTIME', scope: 'dev', task: '-', desc: 'Path to the node/bun the resolver runs format-pattern checks on, consulted when no --js-runtime flag is passed (the bundler/lint plugins always pass their own process.execPath, so this matters for direct binary use: serve/compile by hand). Unset: the binary probes PATH for node, then bun'},

  // — build/release knobs —
  {name: 'RT_NPM_PROVENANCE', scope: 'dev', task: 'publish-npm', desc: 'Attach npm provenance on the CI stage-publish (default off). Needs a PUBLIC repo — npm refuses provenance from a private source repo; set the CI repo variable to 1 once this repo is public'},

  // — lint knobs (the ts-runtypes-devtools OXlint/ESLint plugin) —
  {name: 'RT_LINT_PRESPAWN', scope: 'dev', task: '-', desc: "Set 0 to skip the lint plugin's load-time resolver pre-spawn (small hosts)"},

  // — Next.js / Turbopack adapter knobs (@ts-runtypes/devtools/next) —
  {name: 'RT_NEXT_DEBUG', scope: 'dev', task: '-', desc: "Set 1 to trace the Next broker: owner election, buildStart, each absorbed edit batch, each stamp change. Turbopack gives the adapter no plugin log of its own, so a misbehaving dev loop is otherwise opaque"},

  // — pre-publish e2e knobs (scripts/release/e2e.mjs + the fixture) —
  {name: 'RT_E2E_BINARY', scope: 'dev', task: '-', desc: 'Override the RunTypes plugin binary for the e2e apps (host iteration; unset in-container / in CI to test the published @ts-runtypes/bin launcher). The lint lanes take no binary option, so their spawners forward it as RT_BIN'},

  // — alignment-audit knobs (scripts/website/bench-data/bench.mjs audit + the harness) —
  {name: 'RT_AUDIT_OUT_DIR', scope: 'dev', task: '-', desc: 'Audit output dir (default the results dir)'},
  {name: 'RT_AUDIT_TSX', scope: 'dev', task: '-', desc: 'Path to the tsx runner for the host-side audit collector'},

  // — mion framework knobs (MION_*) —
  {name: 'GENERATE_ROUTER_SPEC', scope: 'dev', task: '-', desc: "Set to 'true' to make @mionjs/router expose its public routes data (the router spec). Read at runtime by the router, so it keeps its unprefixed name: renaming it would break every consumer that already sets it"},
  {name: 'MION_SUPPRESS_DUAL_LOAD_WARN', scope: 'dev', task: '-', desc: 'Silence the warning @mionjs/core prints when it is loaded twice in one process (a duplicated install or a bundle that inlines a second copy)'},
  {name: 'MION_UWS_BINARY_DIR', scope: 'dev', task: '-', desc: "Directory holding a uWebSockets.js native binary (uws_<platform>_<arch>_<abi>.node) that @mionjs/uws loads INSTEAD of the fetched cache / the @mionjs/uws-* optional dependency — the escape hatch for air-gapped installs, vendored copies, or self-built binaries for an unsupported Node ABI"},

  // — internal / protocol vars: set by the scripts (container paths, plumbing). DO NOT set in .env —
  {name: 'MION_TEST_PORT', scope: 'internal', task: '-', desc: 'Port the managed mion test server listens on (set by packages/client/vitest.config.ts and by the e2e mion consumer lane, and passed to the spawned server; defaults to 8076)'},
  {name: 'MION_TEST_SERVER_AUTO_START', scope: 'internal', task: '-', desc: "Set to 'false' by the router / client vitest configs so importing the test-server module does not start a server of its own"},

  {name: 'RT_DRIZZLE_DIALECT', scope: 'internal', task: '-', desc: 'Which dialect the drizzle-e2e lane is running (pg | mysql | sqlite); read by container/drizzle-e2e/shared/run-suite.mjs, passed in via -e by scripts/release/drizzle-e2e.mjs'},
  {name: 'RT_DRIZZLE_VERSION', scope: 'internal', task: '-', desc: '@ts-runtypes/bin version the drizzle-e2e lane installs from its verdaccio (the lockstep line; it is what carries the drizzle-migrate translator into the container)'},
  {name: 'RT_DRIZZLE_PKG_VERSION', scope: 'internal', task: '-', desc: '@mionjs/drizzle-orm* version the drizzle-e2e lane installs. Its OWN drizzle-aligned line, not the lockstep one, which is why it is a separate variable'},
  {name: 'RT_DRIZZLE_ORM_VERSION', scope: 'internal', task: '-', desc: 'drizzle-orm version the drizzle-e2e lane names in its install, read from drizzle-suites.pin.json. Named explicitly because npm reads the pnpm-installed copy the image bakes as `undefined` and then fails the slim packages optional peer against it'},
  {name: 'RT_DRIZZLE_TYPE_PASS', scope: 'internal', task: '-', desc: "Whether the drizzle-e2e lane runs its type-road pass (1 = yes, the default; 0 = builders road only). Set to 0 by `pnpm rtx release drizzle-e2e --skip-types`, which halves the suite runs while iterating on the builders half"},
  {name: 'RT_DRIZZLE_REGISTRY', scope: 'internal', task: '-', desc: 'Registry the drizzle-e2e lane installs the packages under test from (the in-container verdaccio on 127.0.0.1:4873)'},
  {name: 'RT_DRIZZLE_VERDACCIO_CONFIG', scope: 'internal', task: '-', desc: "verdaccio config path inside a drizzle-e2e container, read by drizzle-serve.sh (default /etc/verdaccio/config.yaml). scripts/release/drizzle-e2e.mjs points it at the bind-mounted /drizzle-src/registry/verdaccio.yaml so a config tweak needs no image rebuild"},
  {name: 'PG_CONNECTION_STRING', scope: 'internal', task: '-', desc: "How drizzle's own pg suite reaches its database. The drizzle-e2e lane sets it to the container's own postgres, which is what makes the lane free of docker-in-docker (the suite falls back to its createDockerDB() helper only when this is unset). Drizzle-owned name, so no RT_ prefix"},
  {name: 'MYSQL_CONNECTION_STRING', scope: 'internal', task: '-', desc: "How drizzle's own mysql suite reaches its database; the mysql twin of PG_CONNECTION_STRING. Drizzle-owned name, so no RT_ prefix"},
  {name: 'SQLITE_DB_PATH', scope: 'internal', task: '-', desc: "The database FILE drizzle's own sqlite suite opens (its own default is :memory:). Drizzle-owned name, so no RT_ prefix"},

  {name: 'RT_E2E_VERSION', scope: 'internal', task: '-', desc: '@ts-runtypes/* version the e2e matrix installs (passed into the registry container via -e by scripts/release/e2e.mjs)'},
  {name: 'RT_E2E_REGISTRY', scope: 'internal', task: '-', desc: 'Registry the e2e lanes install @ts-runtypes/* and @mionjs/* from (in-container verdaccio for pre-publish; registry.npmjs.org for the post-publish npm backend; passed into the container via -e by scripts/release/e2e.mjs)'},
  {name: 'RT_E2E_MION_VERSION', scope: 'internal', task: '-', desc: '@mionjs/* version the mion consumer lanes install. Read from packages/core/package.json, NOT version.json: the two families are still on separate version lines until the merge plan\'s step 6 (passed into the container via -e by scripts/release/e2e.mjs)'},
  {name: 'RT_E2E_MION_PKGS', scope: 'internal', task: '-', desc: 'Space-separated <name>@<version> install list for the mion consumer lane: the lockstep @mionjs/* packages at RT_E2E_MION_VERSION plus the @mionjs/drizzle-orm-*-core packages at their own drizzle-aligned versions (passed into the container via -e by scripts/release/e2e.mjs)'},
  {name: 'RT_E2E_VERDACCIO_CONFIG', scope: 'internal', task: '-', desc: "verdaccio config path inside the e2e registry container, read by e2e-serve.sh (default /etc/verdaccio/config.yaml). scripts/container/image.mjs sets it to /e2e-src/registry/verdaccio.yaml so the repo's config (with the '@ts-runtypes/*' local-only rule) overrides the one baked into the pulled image without a republish"},
  {name: 'RT_AUDIT_ALIGNMENT', scope: 'internal', task: '-', desc: 'Bench mode flag: emit alignment records instead of timing (set by rt bench audit)'},
  {name: 'RT_REPO_ROOT', scope: 'internal', task: '-', desc: 'In-container repo-context mount point (passed via -e)'},
  {name: 'RT_DOCDATA', scope: 'internal', task: '-', desc: 'In-container docdata mount point (passed via -e)'},
  {name: 'RT_AGENT', scope: 'internal', task: '-', desc: 'Agent-mode flag inside the container (passed via -e)'},
  {name: 'RT_AGENT_HEARTBEAT', scope: 'internal', task: '-', desc: 'Agent heartbeat file path inside the container (passed via -e)'},
  {name: 'RT_AGENT_IDLE_SECONDS', scope: 'internal', task: '-', desc: 'Agent idle window inside the container (passed via -e)'},
  {name: 'RT_BENCH_RESULTS_DIR', scope: 'internal', task: '-', desc: 'In-container benchmark results dir (passed via -e)'},
  {name: 'RT_BENCH_HOST_CPU', scope: 'internal', task: '-', desc: 'Host CPU model captured into env.json (passed via -e)'},
  {name: 'RT_BENCH_REPO_ROOT', scope: 'internal', task: '-', desc: 'Serialization-bench repo root (passed via -e)'},
  {name: 'RT_BENCH_VITE_ROOT', scope: 'internal', task: '-', desc: 'Serialization-bench vite root (passed via -e)'},
  {name: 'RT_BENCH_PACKAGE_ROOT', scope: 'internal', task: '-', desc: 'Serialization-bench marker package root (passed via -e)'},
  {name: 'RT_BENCH_RT_OUTDIR', scope: 'internal', task: '-', desc: 'Serialization-bench resolver output dir (passed via -e)'},
  {name: 'RT_BENCH_BIN', scope: 'internal', task: '-', desc: 'Serialization-bench resolver binary path (passed via -e)'},
  {name: 'RT_BENCH_PLUGIN_ENTRY', scope: 'internal', task: '-', desc: 'Serialization-bench vite plugin entry (passed via -e)'},
  {name: 'RT_EXTRACT_BIN', scope: 'internal', task: '-', desc: 'Serialization-bench fn-body extractor path (passed via -e)'},
  {name: 'RT_BENCH_OUT_DIR', scope: 'internal', task: '-', desc: 'Serialization-bench output dir (passed via -e)'},
  {name: 'RT_BENCH_SSR_NOEXTERNAL', scope: 'internal', task: '-', desc: 'Serialization-bench vite ssr.noExternal list (passed via -e)'},
  {name: 'RT_BENCH_CACHE_DIR', scope: 'internal', task: '-', desc: "Serialization-bench resolver cache dir / false (passed via -e; forwarded to the binary's RT_CACHE_DIR)"},
];
