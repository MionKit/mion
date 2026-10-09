# Containers

Supplementary apps with heavy, unrelated deps (Nuxt/Docus, competitor validators like zod/typebox/ajv/typia,
verdaccio + multi-bundler toolchains). Read before any container, bench, website or e2e command.

- Run **only inside podman images**: never installed on the host, never mixed into the workspace lockfile.
- More: [SETUP.md → Containerized apps](../SETUP.md#containerized-apps-docs-website--benchmarks).

## Images

- SEVEN images, all owned by [image.mjs](../scripts/container/image.mjs), published to GHCR under `ghcr.io/mionkit/`:
  `pnpm miondevx container <cmd> [website|e2e|mion-bench|drizzle-pg|drizzle-mysql|drizzle-sqlite|drizzle-cloudflare]`.
- `pnpm miondevx container push`, no target → builds + pushes ALL SEVEN.
- Shared podman/GHCR helpers: [engine.mjs](../scripts/lib/engine.mjs).
- Pulling is the DEFAULT. `ensureImage` builds only when `MION_*_USE_LOCAL` is set, or the image's
  `org.mionkit.deps-hash` no longer matches the tree.
- Drifted hash = a `_deps` manifest or the Containerfile changed → rebuild is correct, not something to work around.
  Build it, verify it, push it so the next run pulls it.

## ⚠️ Containers DO run, build and push here

Claude cloud sessions, CI, any host with podman. NEVER conclude "containers can't run / be built / be pushed here".

- Pull or push needs `GHCR_PAT`, `GHCR_OWNER`, `GHCR_USER`, `GHCR_REGISTRY` in env or `.env`
  ([SETUP.md → GHCR](../SETUP.md#publishing--consuming-the-image-via-ghcr)). Missing → run falls back to a local build.
- The four `GHCR_*` vars are already exported here: check `printenv`. Missing `.env` ≠ missing credential.
- Run `pnpm miondevx container login` ONCE before the first container / bench / website command
  (`podman login` with `GHCR_PAT`). Run path pulls but never logs in: skip it → `unauthorized` + needless local build.
- Running = logging in + pulling. Building + pushing = the knobs below, made for a sandboxed or proxied host.
  Both are shared by every image target, `MION_WEBSITE_`-prefixed name included.
- Docker Hub blocked (`podman pull node:26-trixie` → `403 Forbidden` from `production.cloudfront.docker.com`)?
  That is the base image, NOT GHCR. Use a pull-through mirror:
  `MION_WEBSITE_BASE_IMAGE=mirror.gcr.io/library/node:26-trixie`. Same config digest, same image; build AND push.
- Downloads inside the build fail (`curl` exit 7, `apt-get` cannot connect)? Egress proxy listens on `127.0.0.1`,
  unreachable from a build netns → `MION_WEBSITE_BUILD_NETWORK=host`.
- arm64 half of a push dies early (`exit status 255` on an innocuous step like `update-ca-certificates`)?
  `container push` always builds `linux/amd64,linux/arm64`. An x86 box with no emulator fails on the first arm64
  binary. Register one, once per boot:
  ```bash
  mount | grep -q binfmt_misc || mount -t binfmt_misc binfmt_misc /proc/sys/fs/binfmt_misc
  podman run --rm --privileged mirror.gcr.io/tonistiigi/binfmt --install arm64
  podman run --rm --platform linux/arm64 mirror.gcr.io/library/node:26-trixie uname -m   # must print aarch64
  ```
- ⚠️ The mount line is load-bearing, the installer will NOT tell you: on a microVM `/proc/sys/fs/binfmt_misc` exists
  but nothing is mounted. `--install` writes a plain dir, prints a healthy `"emulators": ["qemu-aarch64"]`, changes
  nothing. `uname -m` check is how you find out. Without it the next symptom is `exec format error`.
- NEVER "fix" a failing arm64 half by pushing an amd64-only manifest: the maintainer works on arm64.

Whole line from a cold sandbox:

```bash
pnpm miondevx container login
podman run --rm --privileged mirror.gcr.io/tonistiigi/binfmt --install arm64
MION_WEBSITE_BASE_IMAGE=mirror.gcr.io/library/node:26-trixie MION_WEBSITE_BUILD_NETWORK=host \
  pnpm miondevx container push mion-bench
```

## `tsrt-website` ← [website/](website/) + [benchmarks/](benchmarks/)

- Run: `pnpm miondevx website …`, `pnpm miondevx bench …`. Site rules: [website/AGENTS.md](website/AGENTS.md).
- Nuxt/Docus docs at `/app`. Per-competitor validation benchmark deps at `/bench`,
  each competitor its own isolated pnpm project under `_deps/`.
- `website-deploy.yml` deploys it to mion.pages.dev, plus a redirect-only upload to the old runtypes.pages.dev project.

## `tsrt-e2e` ← [pre-publish-e2e/](pre-publish-e2e/)

- Run: `pnpm miondevx release e2e`. Own image so smoke / benchmark / website-build lanes never pull heavy toolchains.
- Verdaccio + multi-bundler builder toolchains at `/e2e`. mion consumer toolchain at `/e2e-mion`
  (separate root: matrix pins rolldown-vite + TypeScript 5, a mion consumer runs plain vite 8 + TypeScript 6).
- ONE gate covers BOTH families: same verdaccio serves `RunTypes/*` and `@mionjs/*`,
  so a packed `@mionjs/core` resolves its exact sibling `@mionjs/run-types`.

## `mion-drizzle-pg|mysql|sqlite|cloudflare` ← [drizzle-e2e/](drizzle-e2e/)

- Run: `pnpm miondevx release drizzle-e2e`. ONLY proof a `toDrizzle()` table works against a real database.
- FOUR images, FIVE lanes: `pg` / `mysql` / `sqlite` = dialects. `cloudflare` image serves BOTH storage-driver
  lanes (`d1`, `durable`): drivers, not dialects.
- Each lane: translate drizzle's OWN suites with `mion drizzle-migrate`, again onto the type road with
  `mion convert --to type` ([drizzle-orm/AGENTS.md](../packages/drizzle-orm/AGENTS.md)).
  Run all three trees (control, builders, types) against three databases, typecheck them,
  cross both reports against the manifests.
- Type-road tree runs through the devtools build transform: only place a `tableFromType<T>()` marker resolves.
- Base = the DATABASE image (`postgres:17-trixie`, `mysql:8.4`, `node:26-trixie` for sqlite), Node from the official
  tarball: drizzle's suites want real postgres + real MySQL, Debian ships MariaDB.
- NO docker-in-docker: drizzle's runners prefer `PG_CONNECTION_STRING` / `MYSQL_CONNECTION_STRING` /
  `SQLITE_DB_PATH` over their own docker helper.
- Host half, no container, no database: `pnpm miondevx core drizzle-translate [--to-types]`.

## `mion-bench` ← [mion-bench/](mion-bench/)

- Run: `pnpm miondevx bench servers`. One isolated pnpm project per app under `_deps/`.
- mion HTTP **server** benchmarks: mion on platform-node / platform-uws / platform-bun vs express, fastify, hapi,
  hono, elysia, a bare node server.
- `node:26-trixie` base, not bookworm: the uWebSockets.js addon links against `GLIBC_2.38`.
- Lanes built in-container by vite + `@mionjs/devtools` against the bind-mounted workspace → numbers describe the
  current tree.
- Every lane must answer correctly AND reject an invalid payload before it is measured!
