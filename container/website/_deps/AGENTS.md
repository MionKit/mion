# Website dependencies

The docs site's own pnpm project, baked into the image at build time. Read before any website dependency change.

- Own `pnpm-lock.yaml`: NOT part of the monorepo root workspace.
- `_deps/` holds the dep set + policy: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`.
- `pnpm-workspace.yaml` = full security policy: exact pins (`savePrefix: ''`), 30-day `minimumReleaseAge`,
  `allowNonRegistryProtocols: false`.
- Install: `pnpm install --frozen-lockfile`.
- Lockfile holds some young transitives (Nuxt + Docus bring hundreds of weekly-released UnJS deps).
  Age policy applies to FUTURE bumps, not entries already locked.

## Build-script allowlist

- pnpm 11 blocks every dependency `install` / `postinstall` script by default.
- Allowlist: `pnpm-workspace.yaml` → `allowBuilds:` (object form `{ pkgName: true|false }`).
  Array-form `onlyBuiltDependencies:` is silently ignored by pnpm 11.
- Only `better-sqlite3: true` (`@nuxt/content` loads its native SQLite binding).
- `false`, tested as not needed for `nuxt dev` / `nuxt generate`: `@parcel/watcher`, `esbuild`, `sharp`,
  `unrs-resolver`, `vue-demi` (binaries ship as platform optional deps, or a JS fallback runs).
- ⚠️ A `false` row holds only for the VERSION locked. `sharp: false` needs sharp >= 0.33 (binary in
  `@img/sharp-<platform>` optional deps); sharp 0.32 fetched it in an install script, no JS fallback.
- Symptom of a mismatch: every `/_ipx/` picture answers 500, prerender silently ships broken pictures
  (Nuxt loads the project's `@nuxt/image`, not Docus').
- `_deps/package.json` pins the same `@nuxt/image` Docus resolves. `repo-contracts.test.ts` keeps them equal and
  rejects any sharp < 0.33 in the lockfile.
- `scripts/website/check-static.mjs` fails a build whose pages reference a picture that did not ship.
- Before flipping any row to `true`: verify the failure without it. Every addition is an explicit trust decision.
