---
type: fix
spec: full-plan
status: ready
created: 2026-11-08
---

# Clear the 404 open Dependabot alerts

## Problem

GitHub lists 404 open Dependabot alerts on `main` (16 critical, 126 high, 204 moderate, 58 low).
There is no `.github/dependabot.yml`: they come from GitHub's default scan of every manifest. Snapshot
(2026-11-08, `gh api --paginate 'repos/MionKit/mion/dependabot/alerts?state=open&per_page=100'`):

| Area | Alerts | Critical | Installed how |
|---|---|---|---|
| `container/website/_deps` (+ `benchmarks/_deps` in the same image) | 243 + 33 | 7 | frozen lockfile in the `tsrt-website` image |
| root workspace (`pnpm-lock.yaml`, `package.json`, `packages/*`, `tools/*`) | 83 | 3 | frozen root lockfile |
| `container/pre-publish-e2e/{_deps,_deps-mion,host-smoke}` | 37 | 6 | no lockfile: fresh resolve at image build; host-smoke = host `npm install` |
| `container/mion-bench/_deps/*` | 9 | 0 | no lockfile: fresh resolve in the `mion-bench` image |
| `container/drizzle-e2e/*/_deps` | 4 | 0 | no lockfile: fresh resolve in each drizzle image |

Real exposure is small: the site deploys as static files (`website-deploy.yml` uploads `.output/public`),
every container is a CI or local test box. The only path into users' installs is
`@mionjs/platform-gcloud`, which ships `@google-cloud/functions-framework@3.5.1` as a runtime
dependency and with it express 4 (`proxy-addr` critical, `body-parser`, `qs`, `uuid`).

## Decisions already made

- Do it all now. Fix versions younger than the 30-day `minimumReleaseAge` go in as **exact-version**
  entries in that install's `minimumReleaseAgeExclude` (`'nuxt@4.6.3'`, not `'nuxt'`), so the guard still
  holds for every later release. Verify pnpm 11.8 accepts the `name@version` form first; if not, use the bare
  name with a one-line comment naming the version it was added for. Every exclude entry AND every `overrides`
  entry this work adds carries the same greppable comment: `# security fix (Dependabot), added <YYYY-MM-DD>`,
  so a later cleanup finds and removes all of them.
- Always the LOWEST version that clears every alert on that package, never "latest".
- Benchmark competitors move vite 5.4.21 → 8.1.6 (same as the workspace). Benchmark numbers get rerun.
- `@mionjs/platform-gcloud` stops shipping the functions framework as a runtime dependency (step 2).

## Plan

One PR, one commit per area, in this order. Cutoff for "old enough" = 30 days before the day you run it.

### 1. Root workspace (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`)

Direct bumps (exact pins, `savePrefix: ''`):

| Package | From → to | Clears |
|---|---|---|
| `vite` (root `package.json:105`, `packages/devtools/package.json:122`, `packages/private-go-be-sidecar/package.json:14`, `tools/code-card/package.json:25`) | 8.0.16 → 8.1.6 | vite, launch-editor, postcss |
| `vitest` (`package.json:107`) + every `@vitest/*` | 4.1.8 → 4.1.12 | vitest, `@vitest/mocker` (code injection fix is 4.1.12 only), tinypool |
| `vue` (`package.json:108`, `tools/code-card/package.json:26`) | 3.5.40 → 3.5.43 | `@vue/server-renderer`, source-map-js |
| `miniflare` (`package.json:96`) | 3.20250718.3 → 4.x | undici 5, ws 8.18, `@fastify/busboy` (all come only through miniflare 3) |
| `commitizen` (`package.json:88`) | 4.3.1 → 4.3.2 | lodash; check `tmp` 0.0.33 is gone |

miniflare 4 is a major: run the `platform-cloudflare` tests, adapt the harness if its API moved.

Then refresh in-range transitives (`pnpm update <name> --depth Infinity` or the lockfile entry removed and
re-resolved, never a blind full `pnpm update`): brace-expansion (1.1.21 / 2.1.7 / 5.0.12), fast-uri 3.1.9,
js-yaml 4.3.2, postcss 8.5.23, source-map-js 1.2.2, tinypool 2.1.2, ws 8.21.0.

Still vulnerable after that → a root `overrides` entry scoped to the bad range (`'tmp@<0.2.6': '0.2.6'`),
one comment line each. `minimatch` (9.x / 10.x from typescript-eslint, fix only in 11.0.1): try a scoped override;
if a parent breaks, dismiss instead (step 7).

### 2. `@mionjs/platform-gcloud`

- `packages/platform-gcloud/src/googleCF.ts:24`: `import {Request, Response} from 'express'` is type-only:
  make it `import type`, so the built JS never imports express.
- `packages/platform-gcloud/package.json:57`: move `@google-cloud/functions-framework` out of `dependencies`.
  It becomes a **peerDependency** with a range (`>=3.5.1 <6`): the user's function already runs on it.
  Workspace copy for the tests goes to the root `devDependencies` at 5.0.5 (express 5: body-parser 2,
  qs 6.16, proxy-addr 2.0.8). Run `packages/platform-gcloud/test/*.spec.ts`; fix any express 5 type drift.
- Check the published `.d.ts` still resolves `express` types for a consumer that installed the framework
  (pack it, install next to framework 5.0.5 in a scratch dir, `tsc --noEmit`).
- `packages/AGENTS.md` "FIVE peerDeps stay ranges" becomes SIX: add the gcloud one with its reason.

### 3. Website image (`container/website/_deps`)

Exact pins in `container/website/_deps/package.json`, lockfile `container/website/_deps/pnpm-lock.yaml`,
policy `container/website/_deps/pnpm-workspace.yaml` (no `overrides` today).

- Bump the direct parents first, lowest fixing version: `nuxt` 4.4.2 → 4.6.3 (also clears
  `@nuxt/nitro-server`, `@nuxt/vite-builder`, vite 7.3.7, devalue, seroval, `@vue/server-renderer`),
  `@nuxt/ui` 4.6.1 → ≥4.8.1, `mermaid` 11.14.0 → 11.16.1, `docus` 5.9.0 → the first release whose
  `@nuxtjs/mcp-toolkit` pulls `@modelcontextprotocol/sdk` ≥1.32.0 (that sdk drags hono, `@hono/node-server`,
  express, body-parser, ip-address). Check `@nuxt/devtools` lands ≥3.3.1 and simple-git ≥4.0.1.
- Re-lock inside the container: `pnpm miondevx container lock`.
- Re-read the open website alerts against the new lockfile. Left-overs → scoped `overrides` in the website
  `pnpm-workspace.yaml` (tar, shell-quote, node-forge, sharp, svgo, dompurify, katex, prosemirror-view,
  `@tiptap/core`, nanoid, socket.io-parser, `@intlify/*` + vue-i18n 11.4.14, zod 4.6.6, …), re-lock again.
- Verify: `MION_WEBSITE_USE_LOCAL=1 pnpm miondevx website check`, then the site in the browser
  (playground, a mermaid diagram, search). Site rules: `container/website/AGENTS.md`.

### 4. Benchmark competitors (same `tsrt-website` image)

`container/benchmarks/_deps/competitors/{zod,typebox,ajv,mion}/package.json`: vite 5.4.21 → 8.1.6;
zod competitor 4.6.5 → 4.6.6. vite 8 bundles with Rolldown: check each competitor's vite config still builds,
then rerun the validation bench (warn the maintainer first, with an end time; they share the Mac) and compare
round spread before and after. Numbers that move get their page updated.

### 5. Other images

- `container/pre-publish-e2e/_deps/package.json:20`: next 16.2.11 → 16.4.1; `:8` esbuild 0.28.0 → 0.28.1.
- `container/pre-publish-e2e/_deps-mion/package.json:7-8`: vite 8.1.6, vitest 4.1.12.
- `container/pre-publish-e2e/host-smoke/package.json:10-11`: vite 5.4.10 → 8.1.6, vitest 2.1.9 → 4.1.12.
  Not a deliberate floor test (its description: pinned so a workspace bump can't silently diverge).
  Installed by host npm (`scripts/release/e2e.mjs:268`), no age gate there.
- `container/mion-bench/_deps/{express,hapi,hono,http-node}/package.json`: zod 4.6.5 → 4.6.6;
  `mion/package.json:9`: vite 8.1.6.
- `container/drizzle-e2e/{pg,mysql,sqlite,cloudflare}/_deps/package.json`: vitest 4.1.10 → 4.1.12.
- Young versions → exact entries in that install's `minimumReleaseAgeExclude`
  (`benchmarks/_deps`, `mion-bench/_deps`, `pre-publish-e2e/_deps`, `_deps-mion`, `drizzle-e2e/shared/_deps-common`).

### 6. Rebuild + push all seven images

Every `_deps` change moves `org.mionkit.deps-hash` (`scripts/container/image.mjs:312-352`).
`pnpm miondevx container login`, then `pnpm miondevx container push` (both arches, see `container/AGENTS.md`).
Then run each lane once on the pushed images: `pnpm miondevx website check`, `pnpm miondevx release e2e`,
`pnpm miondevx release drizzle-e2e`, `pnpm miondevx bench servers` (bench heads-up first).

### 7. Dismiss what has no fix (ask the maintainer before each dismissal)

`gh api -X PATCH repos/MionKit/mion/dependabot/alerts/<n> -f state=dismissed -f dismissed_reason=<r> -f dismissed_comment=<why>`

- `uuid` < 11.1.1 (alert 423): cloudevents pins `uuid ^8` even at its latest major; the bug needs v3/v5/v6
  with a `buf` argument. Confirm cloudevents only calls v4 → `vulnerable_code_not_used`.
- `deepmerge` (website, no patched version): build-time only, static site → `not_used` / `tolerable_risk`.
- dompurify / node-forge advisories with no patched version: leave open, note them in the PR.
- `minimatch` if the override broke a parent: dev-only lint tooling, patterns are our own → `tolerable_risk`.

## Could be skipped (lowest real risk first to cut)

If time runs short, cut from the bottom of this list, top stays:

1. Must: platform-gcloud (reaches users), root workspace (every dev + CI), website packages shipped to the
   browser (mermaid, dompurify, katex, prosemirror / tiptap, vue).
2. Should: website build-time tools (nuxt, vite, devtools, MCP sdk, hono, express, simple-git, tar, sharp).
   Static output, so only reachable while building, but the devtools RCE hits anyone running `nuxt dev`.
3. Could: pre-publish e2e, drizzle e2e, mion-bench: throwaway CI boxes, no outside input.
4. Could: benchmark competitors: `vite build` only, never the dev server most vite alerts are about.

## Tests

No new tests: no repo code changes beyond the gcloud import. Coverage = the existing suites:
`pnpm run lint`, `pnpm test` (bootstrapped host), `platform-gcloud` + `platform-cloudflare` suites
specifically, CI lanes for every touched area (`.agents/docs/pr-ready.md` for labels), each image lane from step 6.

## Docs

- `packages/AGENTS.md`: the peerDeps list grows to six (step 2).
- `container/website/content/01.rpc/06.platforms/04.google-cloud-functions.md:12` and
  `container/website/content/01.rpc/01.introduction/03.manual-install.md:38`: install line adds
  `@google-cloud/functions-framework` (now a peer).
- Benchmark pages only if the numbers moved (step 4).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Out of scope

- A `.github/dependabot.yml` for automatic update PRs: separate decision.
- Upgrading anything that has no open alert, or past the lowest fixing version.
- Moving the container installs to committed lockfiles.

## Done when

- `gh api 'repos/MionKit/mion/dependabot/alerts?state=open'` lists only the alerts dismissed or left open
  in step 7, each with its reason in the PR description.
- All seven images pushed, every lane green on them, CI green on the PR.
- Every `minimumReleaseAgeExclude` entry added is exact-version and commented.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.
