---
type: fix
spec: guidelines
status: done
created: 2026-07-26
completed: 2026-07-26
---

# The pre-publish e2e lane could not reach its own assertions (two independent blockers)

**Status:** done
**Created:** 2026-07-26 (found while running `rtx release e2e` to verify
[docs/done/lint-settings-binary-ignored.md](lint-settings-binary-ignored.md))

Running the lane end to end for the first time in a while surfaced two unrelated defects, one of
which had the **release gate red on `main`**. Both are fixed; recorded here because neither is
visible from the normal test suite (the fixture only ever runs inside the e2e container).

## 1. `build-all.mjs` drove the CLI through the removed `gen` verb — the gate was RED

[container/pre-publish-e2e/build-all.mjs](../../container/pre-publish-e2e/build-all.mjs)'s
`ensureEnrichment()` called:

```js
cli(['gen', model, 'EnrichedUser']);
cli(['gen', '--translate', 'es', model]);
cli(['gen', '--check']);
```

`gen` was merged into `enrich` (with `--i18n` for `--translate` and `--no-emit` for `--check`) by
the enrich-surface work. The binary answers an unknown verb with usage and **exit 2**, so
`execFileSync` threw and the matrix died at the enrichment step — before the bundler builds, the
build-output assertions, and the lint transport. `release-gate.yml`'s e2e job runs this script, so
the next release would have failed there.

The rename reached the packages, the docs and the skills, but not this fixture: nothing on the host
executes it (no vitest project covers `container/`), and the container lane is only exercised at
release time.

**Fixed:** the three calls now use `enrich <file> <Type>`, `enrich --i18n es <file>` and
`enrich --no-emit`, plus the stale `gen --check` mention in the header comment.

## 2. `waitHealthy()` required systemd, so the lane died at the registry gate

[scripts/release/e2e.mjs](../../scripts/release/e2e.mjs) polled
`podman inspect --format {{.State.Health.Status}}` until it read `healthy`. That status only
advances when podman's healthcheck **timer** fires, and the timer is a transient systemd unit — so
anywhere systemd is not init (agent/dev containers, some rootless setups) the status sits at
`starting` forever. Observed: verdaccio logged `ready` and published all ten tarballs, and the lane
still died 240s later with "containerized verdaccio failed to publish the tarballs in time".

**Fixed:** the loop now also runs the SAME healthcheck synchronously
(`podman healthcheck run <container>`); exit 0 means the container's own health command passed,
which is exactly what `healthy` would have meant. The status check stays first, so nothing changes
where the timer does fire.

## Verification

Both fixes were verified by running the lane, not by inspection:

- `node scripts/rt.mjs release e2e` (unmodified) now prints
  `containerized verdaccio is healthy on 127.0.0.1:4873` and proceeds — the exact step that failed
  before.
- The full matrix passes **16/16**, all 7 bundler apps build, and both lint transports are green
  (`✔ oxlint transport (build-vite)`, `✔ eslint transport (smoke-esbuild)`), which also confirms the
  fixture config rewrite in
  [lint-settings-binary-ignored.md](lint-settings-binary-ignored.md) and that its new fatal CFG001
  assertion does not trip.
- The host-native smoke passes: the published packages install from the port-published verdaccio
  and the `@ts-runtypes/bin` → `@ts-runtypes/binary-linux-x64` optional-dep chain resolves on the
  host, exercising the `RT_BIN`-era `getExePath()`.

## Environment note (not a defect)

In an agent container the run needs one out-of-band step that does NOT belong in the repo: the
egress proxy re-terminates TLS, so verdaccio's uplink to `registry.npmjs.org` fails with
`SELF_SIGNED_CERT_IN_CHAIN` and every proxied package (unplugin, vite, …) 404s. Mounting the proxy
CA into the registry container and setting `NODE_EXTRA_CA_CERTS` clears it. On CI the container has
clean egress and needs nothing. If this ever becomes routine, the tidy version is a runtime CA
mount on `startRegistry` driven by the existing `RT_WEBSITE_CA_CERT` knob (today it is build-time
only) — worth its own spec rather than an ad-hoc flag.
