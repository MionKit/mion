---
type: feature
spec: full-plan
status: done
created: 2026-08-25
---

# uWebSockets.js platform adapter (@mionjs/platform-uws) with npm-mirrored binaries

**Shipped 2026-08-25** on `claude/uwebsockets-platform-wrapper-0627ev`, as planned with small
divergences, recorded inline below: the loader spec lives in `packages/uws/test/` (plain-JS package,
no src/); `packages/uws/tsconfig.json` exists so eslint's type-aware service covers the package; two
registration points the plan missed surfaced during the gate and are handled
(`container/pre-publish-e2e/registry/e2e-serve.sh` publish glob, and the twoslash mounts in
`container/website/server/api/twoslash.post.ts` — pinned by repo-contracts.test.ts); the
pooled-buffer verification PASSED under concurrent large responses, so pooling stays armed by
default (the contingency was not needed); the middleware-mode tests live inside uwsHttp.spec.ts;
quick numbers ran with autocannon: ~3.2x platform-node on a hello route, ~3.7x on a validated
route (see Benchmarks).

## Problem

uWebSockets.js is one of the fastest HTTP servers for Node but is not on npm (upstream installs via
`npm install uNetworking/uWebSockets.js#vX.Y.Z`; the author refuses the registry). This workspace
hard-bans git specifiers (`allowNonRegistryProtocols: false` in pnpm-workspace.yaml, plus
ignoreScripts / frozenLockfile / exact pinning), and mion consumers need a plain
`npm install @mionjs/platform-uws` story.

Settled decision: publish our own npm mirror of the prebuilt `.node` addons using the exact
ts-runtypes-bin strategy — per-platform payload packages gated by `os`/`cpu` manifest fields,
injected as `optionalDependencies` into the published shim only, assembled at release time by
script, NO binaries in git, dev binaries fetched on demand.

uWS ground truth (pin these facts in code comments): tag **v20.69.0**; a version tag's tree is
`uws.js` (CJS loader) + `ESM_wrapper.mjs` + `index.d.ts` + LICENSE (Apache-2.0, **no scripts
field — no postinstall**) + 15 `.node` files: {linux,darwin}×{x64,arm64} + win32-x64, × Node ABIs
{127,137,147} = Node 22/24/26 only; glibc only; raw V8 addon (not N-API), so every new Node major
needs a new upstream tag. ~12–13 MB per file. Upstream loader:
`require('./uws_' + process.platform + '_' + process.arch + '_' + process.versions.modules + '.node')`.
Apache-2.0 permits binary redistribution with the LICENSE retained.

## Plan

### 1. Package topology

Two committed packages + five release-time-staged payload packages:

- **`packages/uws` → `@mionjs/uws`** (the shim; models `packages/ts-runtypes-bin`): plain-JS
  package (no vite build) with `lib/index.js` (ESM, `createRequire` to load the `.node`) and a
  hand-written **minimal** `lib/index.d.ts` (`App`, `SSLApp`, `AppOptions`, `TemplatedApp`,
  `HttpRequest`, `HttpResponse`, `us_listen_socket`, `us_listen_socket_close`). Manifest:
  `"optionalDependencies": {}` + explanatory comment field (mirror
  packages/ts-runtypes-bin/package.json:35-36), a `"uwsTag"` pin field (see step 2), and
  `"engines": {"node": ">=22 <23 || >=24 <25 || >=26 <27"}` (hyper-express style, converts a
  runtime crash into an install-time warning). Loader resolution order mirrors `getExePath()`
  (packages/ts-runtypes-bin/lib/index.js): (a) env override `MION_UWS_BINARY_DIR` (fail loudly on
  a bad path); (b) dev fallback `packages/uws/.uws-cache/<tag>/uws_<platform>_<arch>_<abi>.node`;
  (c) installed tree via `import.meta.resolve('@mionjs/uws-<platform>-<arch>/package.json')`.
  Errors name the 5 supported platforms, the supported Node majors (22/24/26), and the fix
  (reinstall without `--no-optional` / run the dev fetch / set the env var). Internals take an
  injectable `{platform, arch, abi}` so error paths are unit-testable. The loader is
  reimplemented (~30 lines) rather than vendoring upstream `uws.js`/`index.d.ts`: committed
  hand-written types keep typecheck offline-safe, we only need App/SSLApp, and drift is bounded
  by the single pinned tag.
- **`packages/platform-uws` → `@mionjs/platform-uws`** (the adapter): cloned from
  `packages/platform-node`'s shape (four-condition exports, files list, scripts, vite/vitest/
  tsconfig pair); deps `@mionjs/core`, `@mionjs/router`, `@mionjs/uws`, all `workspace:*`.
- **`@mionjs/uws-{linux-x64,linux-arm64,darwin-x64,darwin-arm64,win32-x64}`**: staged under
  `dist-binaries/` only, never in `packages/`. Each ships `lib/` with that platform's 3 ABI
  `.node` files (~40 MB), the **upstream Apache-2.0 LICENSE** (fetched, not ours), a generated
  README ("npm mirror of uNetworking/uWebSockets.js at <tag>; never install directly"), and a
  manifest with `os`/`cpu`/`files`/`license: 'Apache-2.0'`/`uwsTag` — modeled on
  scripts/release/build-binaries.mjs:114-135.

Why a separate shim instead of the adapter owning the optionalDependencies: the adapter keeps the
exact package.json shape of every other platform adapter (packed from `packages/`, listed in
packaged-sources publicPackages, built by vite, ships TS source), while the release-time manifest
injection, native resolution, and Apache-2.0 payload concerns live in one leaf that mirrors
ts-runtypes-bin one-to-one — and a future WebSocket feature or direct uWS consumer can use
`@mionjs/uws` alone.

### 2. Pinned version + integrity-checked fetch

- The pin lives in `packages/uws/package.json` as `"uwsTag": "v20.69.0"`. It is NOT the package
  version: scripts/release/bump-version.mjs rewrites every `packages/*/package.json` `version` to
  the mion lockstep and touches nothing else, so the pin survives bumps.
- Committed checksum manifest `packages/uws/uws-checksums.json`: per-file sha256 for all 15
  `.node` files + LICENSE at the pinned tag. Fetches go to
  `https://raw.githubusercontent.com/uNetworking/uWebSockets.js/<tag>/<file>` (no GitHub API);
  every download is verified against the manifest before use (aligns with the workspace's
  supply-chain posture). A `--record` mode regenerates the manifest when bumping the tag — the
  one trust-on-first-use moment; note it in the script header.
- New shared lib `scripts/lib/fetch-uws.mjs`: `ensureUwsBinaries({all})` — dev mode fetches only
  the host's current-ABI file (~13 MB) into `packages/uws/.uws-cache/<tag>/` (gitignored);
  release mode fetches all 15 + LICENSE. Idempotent (hash-check cached files, skip when
  present). Offline: clear error naming the URL, the cache path, and the `MION_UWS_BINARY_DIR`
  escape hatch. `MION_UWS_BINARY_DIR` is a new `dev`-scope var: register it in
  scripts/lib/env.mjs's REGISTRY and `.env.sample`.
- Dev trigger: a new `uws` target in `scripts/core/build.mjs`, included in `all` (root `pretest`
  already runs it), so `pnpm test` self-heals; plus a prefetch step in
  `scripts/setup-claude-web.sh` next to the Go-binary step so web containers warm the cache.
- New `scripts/release/build-uws-binaries.mjs`: fetches all 15, stages the five payload packages
  + the `@mionjs/uws` shim (copied like build-binaries.mjs's stageLauncher, with
  `optionalDependencies` filled exact-equal to the mion lockstep version) into `dist-binaries/`.
  Called from build-binaries.mjs's main() so all existing callers (publish.mjs, manual-publish,
  e2e.mjs, `rtx release binaries`) get it for free; publish-order.json gets the six names,
  payloads first. scripts/release/pack.mjs needs zero changes: it packs publish-order entries
  from `dist-binaries/` and auto-skips staged names in the workspace scan.

### 3. Publish integration + sequencing

- **This PR:** full build + pack + verdaccio e2e must work — payload tarballs are packed on the
  host, so the e2e container needs no GitHub access; only the host-side fetch needs egress to
  raw.githubusercontent.com. Add `@mionjs/platform-uws` and `@mionjs/uws` to
  `MION_CONSUMER_PACKAGES` (scripts/release/e2e.mjs:53-65). CI runs Node 26 (ABI 147), so the
  linux-x64 payload loads.
- **npm publish: deferred to merge-6.** publish-tarballs.mjs's `PUBLISHED_PREFIX = 'ts-runtypes-'`
  (line 72) filters all `@mionjs/*` out; do NOT extend it here. Annotate
  docs/todos/merge-6-unify-release-train-and-ci.md: the unified train must publish
  `@mionjs/uws-*` payloads before `@mionjs/uws` (publish-order.json already encodes it), and the
  publish job needs egress to raw.githubusercontent.com.
- Payload/shim package versions are the mion lockstep (currently 0.8.10; guard in e2e.mjs
  readMionVersion); the uWS tag is metadata only.

### 4. Adapter design (`packages/platform-uws`)

Files: `index.ts` (3-line barrel), `src/uwsHttp.ts`, `src/types.ts`, `src/constants.ts`,
`src/headers.ts`, specs. Public API: `resetUwsHttpOpts()`, `setUwsHttpOpts(options?)` (name
matches the `/^set[A-Za-z]*Opts$/` discovery in
packages/devtools/src/vite-plugin/middlewareMode.ts:183), `startUwsServer(options?)` →
`{app, listenSocket, close()}`, `uwsRequestHandler(res, req)` exported for testing (NOT a
recognized middleware handler shape — middlewareMode.ts:33-34; see Out of scope).

`UwsHttpOptions` (fenced with `// type-uws-http-options-start/-end` markers for website
code-import): `port`, `ssl?: AppOptions` (when set, use `SSLApp` — parity with platform-node's
https-via-options), `defaultResponseHeaders`, `maxBodySize` (256000 default),
`binary: BinaryOptionsPatch`.

Request flow (mirror platform-node/src/mionHttp.ts:108-245 with uWS mechanics):

- `app.any('/*', handler)`. **Synchronously** in the handler (uWS's HttpRequest dies after it
  returns): read `req.getUrl()`, `req.getQuery()`, headers via `req.forEach` into a record →
  `headersFromRecord(record, true)` (uWS already lower-cases). Register
  `res.onAborted(() => aborted = true)` before anything async.
- The rawReq passed to `dispatchRoute` (8-arg, packages/router/src/dispatch.ts:27) is a captured
  snapshot `{url, query, headers}`, never the native HttpRequest (use-after-scope footgun);
  document this platform difference. rawResp = the uWS `res`.
- Body (revised during review): `res.collectBody(maxBodySize, handler)` — uWS assembles the whole
  body natively (riding onDataV2) and calls back once, with null when the body exceeds maxBodySize
  (→ RpcError 'request-payload-too-large' fatal reply). collectBody has two paths: a single-read
  body is a zero-copy window DETACHED when the handler returns (the adapter copies it — one small
  memcpy), while a multi-read body (> 512 KiB, uSockets' LIBUS_RECV_BUFFER_LENGTH) is assembled in
  C++ and ownership-transferred to JS — used with NO copy, guarded by a runtime detachment
  tripwire. Then:
  content-type `application/octet-stream` → binary framing (SerializerModes.binary), else
  string; `decodeQueryBody` for base64url GET bodies; dispatch; fatal errors via
  `getRouterFatalErrorResponse` (packages/router/src/lib/dispatchError.ts:14).
- Response headers: uWS headers are write-only and must precede the body → a new buffering
  MionHeaders impl in `src/headers.ts` (lowercase-keyed record seeded with `server: '@mionjs'` +
  defaults), flushed at reply time.
- `reply()`: if aborted, release any pooled binary buffer and return. Else
  `res.cork(() => { res.writeStatus(...); flush headers EXCEPT content-length (uWS writes its
  own from end()); res.end(body) })`. Binary mode: `res.end(binSerializer.getBufferView())` then
  release the pooled buffer immediately (bun-style) — premised on uWS's end() copying
  synchronously even under backpressure. **The verification test below is mandatory**;
  contingency (NOT needed — the verification passed, pooling stays armed): if pool stats showed
  retained views, default `pool: {enabled: false}` for this platform.
- `startUwsServer`: `App()` / `SSLApp(options.ssl)`, `.listen(port, cb)`, reject on failed
  listen; `setPlatformConfig` after listen; SIGINT/SIGTERM → `us_listen_socket_close` + exit,
  suppressed under `NODE_ENV === 'test'` (match mionHttp.ts).

Registration checklist: root tsconfig.json references; root vitest.config.ts projects
(platform-uws + uws); root package.json `test:ci` batch, `lint:eslint` glob, `lint-staged` glob;
CLAUDE.md platform list (line ~50); e2e.mjs `MION_CONSUMER_PACKAGES`;
container/pre-publish-e2e/mion-consumer/src/tests/packaged-sources.spec.ts publicPackages
(`@mionjs/platform-uws` only — the shim ships plain JS without a source condition).

## Tests

- `packages/platform-uws/src/uwsHttp.spec.ts` — port **8091** (8075-8090 are taken by other
  suites): mirror mionHttp.spec.ts — real server + real fetch, per-serializer-mode initRouter,
  headers, 404, maxBodySize → 413, query-body GET, abort mid-request.
- `packages/platform-uws/src/uwsHttp.binary.spec.ts` — port **8092**: vitest port of
  platform-bun/src/bunHttp.binary.test.ts (binary round-trip with Dates) PLUS the pooled-buffer
  verification: `getBufferPoolStats()` shows all buffers returned after a burst of concurrent
  binary responses, including payloads large enough to force backpressure (slow reader).
- `packages/uws/test/loader.spec.ts` — resolution error paths with injected
  `{platform, arch, abi}`: unsupported platform names the five supported; unsupported ABI names
  Node 22/24/26 + the fix; a bad `MION_UWS_BINARY_DIR` throws (never silently falls through).
- Hermeticity: root pretest covers the fetch via the build.mjs `uws` target; the fetch is a
  no-op when `.uws-cache/` is warm.
- `rtx release e2e` green: verdaccio install of `@mionjs/platform-uws` pulls the right payload
  via optionalDependencies with no GitHub access inside the container.

## Docs

- Website: `container/website/sites/mion/content/07.platforms/07.uwebsockets.md` (after vercel):
  quickstart, plain `npm install @mionjs/platform-uws` story, code-import of the
  `type-uws-http-options` markers, the Node 22/24/26-only + glibc-only caveat, and a note that
  the binaries are our npm mirror of uNetworking/uWebSockets.js (Apache-2.0).
- `content/index.md` platforms card + `content/01.introduction/03.manual-install.md` code-group
  tab, with the Node-version caveat.
- Examples: `packages/examples/src/uws/` mirroring the node/bun example set; add the dependency,
  tsconfig reference, and vite externals entry; check-code-imports green.
- READMEs stay thin per policy; the payload README is generated.

## Fuzzing

No new fuzz lane: the adapter is thin I/O glue over dispatchRoute, whose parsing/dispatch surface
the router fuzzers already cover; the only adapter-local parsing (path/query split) is identical
to platform-node's.

## Benchmarks

The mion benchmarks repo is not merged yet (merge-8). Quick manual numbers ran with autocannon
(100 connections, 10s, POST, no repo dep added), platform-node vs platform-uws serving identical
mion routes from source on the same machine: hello route ~8.4k vs ~27.2k req/s (11 ms vs 3 ms
median latency, ~3.2x); validated createUser object route ~6.9k vs ~25.7k req/s (14 ms vs 3 ms
median, ~3.7x). Paste these into the PR description. Annotated
docs/todos/merge-8-fold-mion-benchmarks-into-container.md with one line: the imported benchmark
harness must include a platform-uws lane.

## Out of scope

- WebSocket support itself (mion is HTTP RPC today; uWS's ws API is a future feature that would
  ride on `@mionjs/uws`).
- Middleware mode: uWS owns its listen socket and cannot mount into vite's node http server, and
  the handler matches neither of the devtools' recognized handler shapes.
  `setUwsHttpOpts({asMiddleware: true})` throws with that explanation.
- musl/Alpine and win32-arm64 (upstream ships no binaries); Bun/Deno/Electron.
- Actually publishing any `@mionjs/*` package to npm (merge-6) and benchmark-site integration
  (merge-8).

## Done when

- [x] `packages/uws` shim: loader + minimal `.d.ts` + empty optionalDependencies + `uwsTag` pin +
      engines guard; loader.spec green.
- [x] `packages/uws/uws-checksums.json` committed; `scripts/lib/fetch-uws.mjs` fetches and
      sha256-verifies into the gitignored `.uws-cache/`; clear offline error; `--record` mode.
- [x] build.mjs `uws` target in `all`; setup-claude-web.sh prefetch; `.gitignore` entry;
      `MION_UWS_BINARY_DIR` in the env registry + `.env.sample`.
- [x] `scripts/release/build-uws-binaries.mjs` stages 5 payloads + filled shim into
      `dist-binaries/`; wired into build-binaries.mjs; publish-order includes all six,
      payloads first; pack.mjs packs them unchanged.
- [x] Adapter lands with corked replies, native collectBody assembly (one copy), onAborted guard, buffered
      headers, snapshot rawReq, mid-stream 413; specs green on ports 8091/8092; pooled-buffer
      behavior verified and the decision commented.
- [x] Every registration point updated; `pnpm test`, `pnpm run lint`, `rtx release e2e` green.
- [x] Website page + index card + manual-install tab + examples; check-code-imports green.
- [x] merge-6 and merge-8 todos annotated (publish sequencing + egress; benchmark lane).
- [x] Manual oha numbers pasted into the PR description.
