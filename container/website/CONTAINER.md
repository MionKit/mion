# Docs website — containerized (podman) workflow

The docs site is a Nuxt + Docus app that pulls in hundreds of npm transitive
dependencies. To keep that supply-chain attack surface **off the host
machine**, the site only ever runs inside a [podman](https://podman.io)
container. There is intentionally no supported way to `pnpm install` or run it
directly on your laptop.

## The isolation boundary

The image is **deps-only**: it bakes the third-party `node_modules` plus the
package-manager manifests **and nothing first-party**. Everything else — the
website source *and* its Nuxt/TS/ESLint config — is bind-mounted at run time.

| Lives **inside the image** (deps only)                       | Lives **on the host** (bind-mounted at run time)                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `_deps/package.json`, `_deps/pnpm-lock.yaml`                 | `app/`, `sites/`, `content/`, `public/`, `server/`, `scripts/`, `tests/` |
| `_deps/pnpm-workspace.yaml`, `_deps/.npmrc`                  | `nuxt.config.ts`, `content.config.ts`, `tsconfig.json`, `eslint.config.mjs` |
| **`node_modules/`** (installed in the image only)            | (config + source are the source-of-truth on the host)            |

- The package-manager files live in **`container/website/_deps/`**, not at the website
  root — so there is no `package.json` to accidentally `pnpm install` against on
  the host. The Containerfile `COPY`s them from `_deps/` into the image.
- `node_modules` is materialized by `pnpm install` **inside** the image
  ([`Containerfile`](./Containerfile)), so no dependency install script ever
  executes on the host. The pnpm supply-chain policy (`ignoreScripts` +
  `allowBuilds` allowlist, `frozenLockfile`, `minimumReleaseAge`) is enforced
  at image-build time from [`_deps/pnpm-workspace.yaml`](./_deps/pnpm-workspace.yaml).
- The **source + config** are bind-mounted from the host, so editing docs,
  components or config hot-reloads without rebuilding the image. Because no
  first-party file is baked, the image is invalidated only when a dependency
  manifest changes.
- The repo root's `pnpm-workspace.yaml` lists only `packages/*`, so a top-level
  `pnpm install` never touches the website — its dependency graph and lockfile
  are fully separate.

## Usage

All commands run from the **repo root**. Running the site is
[`scripts/website/site.mjs`](../scripts/website/site.mjs); the image lifecycle is
[`scripts/container/image.mjs`](../scripts/container/image.mjs):

```bash
# --- run the site (site.mjs) ---
pnpm miondevx website dev            # dev server with hot reload -> http://localhost:3000
pnpm miondevx website dev --agent    # agent server, self-stops when idle -> http://localhost:3100
pnpm miondevx website build          # production build + static prerender -> container/website/.output
pnpm miondevx website preview        # serve the prerendered site locally (regenerates first)
pnpm miondevx website check          # verify the RunTypes repo context (packages/) is built
pnpm miondevx website check --docs   # check code-import + twoslash render (curl/grep)
pnpm miondevx website check --static # serve the BUILT site + assert every benchmark page renders
pnpm miondevx website shell          # debug shell inside the container
# --- image lifecycle (image.mjs) ---
pnpm miondevx container build-image   # build the image locally (maintainer)
pnpm miondevx container lock          # regenerate _deps/pnpm-lock.yaml in-container (after a dep bump)
pnpm miondevx container login         # log in to GHCR (needs a PAT; see SETUP.md)
pnpm miondevx container push          # build + push the multi-arch image to GHCR
pnpm miondevx container pull          # pull the published image and tag it locally
pnpm miondevx container clean         # remove the image + cache volumes
```

The images are published to GHCR, so **`website:dev` (and the other run commands)
pull the latest published image first** — a cheap no-op when your local copy is
already current — then run, falling back to a local build when the registry is
unreachable. Set `MION_WEBSITE_USE_LOCAL=1` to skip the pull and build/use a local
image (offline, or to test a dep bump before pushing).

### Environment overrides

| Variable             | Default          | Purpose                                              |
| -------------------- | ---------------- | ---------------------------------------------------- |
| `MION_WEBSITE_PORT`       | `3000`           | Host port for the dev server.                        |
| `MION_WEBSITE_POLL=1`     | off              | Filesystem polling for watchers (macOS / VM mounts). |
| `MION_WEBSITE_ENGINE`     | `podman`         | Container engine.                                    |
| `MION_WEBSITE_IMAGE`      | `tsrt-website:dev` | Image tag.                                          |
| `MION_WEBSITE_MOUNT_OPTS` | empty            | Extra bind-mount opts, e.g. `:z` on SELinux hosts.   |
| `MION_WEBSITE_USE_LOCAL`  | off              | Skip the GHCR pull; build/use a local image.         |
| `MION_WEBSITE_REMOTE_IMAGE` | `ghcr.io/mionkit/tsrt-website:latest` | Published image ref to pull.        |
| `MION_WEBSITE_REPO_CONTEXT` | this repo (else a sibling `../mion`) | Checkout containing `packages/`, mounted read-only for code-import/twoslash. |
| `MION_WEBSITE_DOCDATA`    | `<repo>/.docdata` | Generated benchmark/test result JSON, mounted read-only at `/app/.docdata`. |

### Documenting first-party code (repo context)

The `<code-import>` and `::twoslash-code` mechanisms read first-party source +
built `.d.ts` from `packages/`, plus a short named allowlist of third-party packages
(`TWOSLASH_EXTERNAL_DEPS` in `site.mjs`, today just `drizzle-orm`) mounted one dir at a
time — never the whole `node_modules`. `site.mjs` mounts the checkout that contains them
**read-only** and points the resolvers at it via `MION_REPO_ROOT` — this repo by
default, so the indirection stays merge-agnostic (a sibling checkout still works
via `MION_WEBSITE_REPO_CONTEXT`). Only `packages/` is exposed, and every
`path=` read is confined to `packages/` (`server/utils/repo-root.ts`). Run
`pnpm miondevx website check` to confirm the context is built and `pnpm miondevx website check --docs`
to check both mechanisms render.

On **macOS** (podman runs in a Linux VM), inotify events don't always cross the
VM mount boundary — run with polling:

```bash
MION_WEBSITE_POLL=1 pnpm miondevx website dev
```

## Behind a corporate / MITM egress proxy

If outbound traffic is intercepted by a proxy with a custom CA (common in
corporate networks and some sandboxes), the in-container `pnpm install` and any
runtime fetches will fail TLS verification. Point the build at the proxy CA and
use host networking:

```bash
# MION_WEBSITE_CA_CERT may be a single .crt file or a directory of .crt files.
MION_WEBSITE_CA_CERT=/usr/local/share/ca-certificates \
MION_WEBSITE_BUILD_NETWORK=host \
  pnpm miondevx container build-image

MION_WEBSITE_RUN_NETWORK=host pnpm miondevx website dev
```

The certs are copied into `container/website/.cacerts/` (git-ignored) and trusted via
`update-ca-certificates` inside the image; `NODE_EXTRA_CA_CERTS` is set so Node
honors them too. With no proxy these vars are unset and everything uses the
default network and CA bundle.

## Why podman (not Docker Desktop)

Podman is daemonless and rootless, needs no Docker Desktop license, and runs the
same on Linux and on macOS (`podman machine`). The whole setup is plain
`podman build` + `podman run` driven by one shell script — no compose tooling or
extra framework to install.

## Notes

- The image's Node base is `node:26-bookworm`, which unflags the global
  `Temporal` API (the runtime the published library targets). Node 26 dropped the
  bundled corepack shim, so the image installs the repo-pinned pnpm globally (the
  `PNPM_VERSION` build-arg). Override the base with `MION_WEBSITE_BASE_IMAGE`.
- This is the **single shared image**: it also bakes the benchmark dependencies
  under `/bench` (`/bench/competitors/<name>` + `/bench/typecost`), which
  `scripts/website/bench-data/bench.mjs` runs against. So one image builds the whole site,
  benchmark data included. See [SETUP.md](../SETUP.md) and
  [container/benchmarks/README.md](../benchmarks/README.md).
- Nuxt's generated caches (`.nuxt`, `.data`, `node_modules/.cache`) live in
  named podman volumes, so the host source tree is never written to and restarts
  stay fast. `pnpm miondevx container clean` drops all of them.
