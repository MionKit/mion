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
  {name: 'CLOUDFLARE_PAGES_PROJECT', scope: 'dev', task: 'deploy-website', desc: 'Cloudflare Pages project name (default runtypes); .env for a local deploy, set in website-deploy.yml for CI'},

  // — GHCR coordinates (defaults already target this repo) —
  {name: 'GHCR_OWNER', scope: 'dev', task: '-', desc: 'GHCR namespace (default mionkit)'},
  {name: 'GHCR_USER', scope: 'dev', task: '-', desc: 'GHCR login user (cosmetic; the PAT authenticates; default M-jerez)'},
  {name: 'GHCR_REGISTRY', scope: 'dev', task: '-', desc: 'GHCR registry host (default ghcr.io)'},

  // — image source toggles (opt out of the GHCR pull; build/use a local image) —
  {name: 'RT_WEBSITE_USE_LOCAL', scope: 'dev', task: '-', desc: 'Build the shared image locally instead of pulling from GHCR'},
  {name: 'RT_BENCH_USE_LOCAL', scope: 'dev', task: '-', desc: 'Build the shared image locally for benchmark runs'},

  // — docs website knobs (scripts/website/site.mjs, scripts/container/image.mjs) —
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
  {name: 'RT_WEBSITE_CA_CERT', scope: 'dev', task: '-', desc: 'File/dir of extra CA certs to trust in the image (corporate/MITM proxy)'},
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

  // — fuzz test knobs (package.json fuzz scripts + the harness) —
  {name: 'RT_FUZZ_SEED', scope: 'dev', task: '-', desc: 'Fuzz PRNG seed (per-suite default)'},
  {name: 'RT_FUZZ_SOAK_MS', scope: 'dev', task: '-', desc: 'value fuzz soak duration in ms'},
  {name: 'RT_FUZZ_TYPES_SOAK_MS', scope: 'dev', task: '-', desc: 'type fuzz soak duration in ms'},
  {name: 'RT_FUZZ_SIZE_SOAK_MS', scope: 'dev', task: '-', desc: 'binary-size fuzz soak duration in ms'},
  {name: 'RT_FUZZ_ROUNDTRIP_SOAK_MS', scope: 'dev', task: '-', desc: 'round-trip fuzz soak duration in ms'},
  {name: 'RT_FUZZ_NONDATA_SOAK_MS', scope: 'dev', task: '-', desc: 'non-data type fuzz soak duration in ms'},
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

  // — build/release knobs —
  {name: 'RT_NPM_PROVENANCE', scope: 'dev', task: 'publish-npm', desc: 'Attach npm provenance on the CI stage-publish (default off). Needs a PUBLIC repo — npm refuses provenance from a private source repo; set the CI repo variable to 1 once this repo is public'},

  // — lint knobs (the ts-runtypes-devtools OXlint/ESLint plugin) —
  {name: 'RT_LINT_PRESPAWN', scope: 'dev', task: '-', desc: "Set 0 to skip the lint plugin's load-time resolver pre-spawn (small hosts)"},

  // — pre-publish e2e knobs (scripts/release/e2e.mjs + the fixture) —
  {name: 'RT_E2E_BINARY', scope: 'dev', task: '-', desc: 'Override the RunTypes plugin binary for the e2e apps (host iteration; unset in-container / in CI to test the published @ts-runtypes/bin launcher). The lint lanes take no binary option, so their spawners forward it as RT_BIN'},

  // — alignment-audit knobs (scripts/website/bench-data/bench.mjs audit + the harness) —
  {name: 'RT_AUDIT_OUT_DIR', scope: 'dev', task: '-', desc: 'Audit output dir (default the results dir)'},
  {name: 'RT_AUDIT_TSX', scope: 'dev', task: '-', desc: 'Path to the tsx runner for the host-side audit collector'},

  // — internal / protocol vars: set by the scripts (container paths, plumbing). DO NOT set in .env —
  {name: 'RT_E2E_VERSION', scope: 'internal', task: '-', desc: '@ts-runtypes/* version the e2e matrix installs (passed into the registry container via -e by scripts/release/e2e.mjs)'},
  {name: 'RT_E2E_REGISTRY', scope: 'internal', task: '-', desc: 'Registry the e2e matrix installs @ts-runtypes/* from (in-container verdaccio for pre-publish; registry.npmjs.org for the post-publish npm backend; passed into the container via -e by scripts/release/e2e.mjs)'},
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
