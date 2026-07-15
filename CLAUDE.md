# Mion Monorepo Architectural Guidelines

## Package Manager: pnpm

This monorepo uses **pnpm 11+** (not npm). Do **not** run `npm install` — it will not respect `pnpm-workspace.yaml` and will not honor the security policies.

**pnpm 11 split**: only auth/registry settings are read from `.npmrc`; all pnpm-specific settings live in `pnpm-workspace.yaml`. Putting a pnpm setting in `.npmrc` is silently ignored.

Security posture (see `pnpm-workspace.yaml`):

- `frozenLockfile: true` — prefers exact-lockfile installs (CI uses `pnpm install --frozen-lockfile` to fail loudly on drift)
- `minimumReleaseAge: 43200` (30 days) — refuses to _resolve_ package versions younger than 30 days. Lockfile-frozen entries are not re-checked; this fires only on fresh resolution (pnpm add / pnpm update / fresh resolve)
- `ignoreScripts: true` — blocks all preinstall/install/postinstall scripts from dependencies. Per-package allowlist via `allowBuilds: { pkg: true }` (replaces deprecated `onlyBuiltDependencies`)
- `allowNonRegistryProtocols: false` — refuses git/github/file/http specifiers (workspace:\* is exempt)
- `savePrefix: ''` — `pnpm add` writes exact versions, never `^` or `~`
- `strictPeerDependencies: true` — peer-dep mismatches fail the install instead of warning
- All `dependencies` and `devDependencies` across the monorepo are exact-pinned. `peerDependencies` of publishable libs (`@mionjs/devtools`, `@mionjs/platform-bun`, `@mionjs/run-types`) stay as caret ranges so consumers can dedupe.

Updating dependencies:

- `pnpm update <pkg> --latest` to bump a single package — `minimumReleaseAge` will reject versions <30 days old at this point. Either wait, pin to the latest mature version explicitly, or (last resort) add the package to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`.
- `rm pnpm-lock.yaml && pnpm install` to fully resolve from scratch — same age policy applies. If pnpm's local metadata cache is missing the `time` field for some packages and reports `[ERR_PNPM_MISSING_TIME]`, nuke `~/Library/Caches/pnpm/v11/metadata*` and retry to force a clean refetch.

## Monorepo Structure

- Uses **pnpm workspaces** for monorepo management (see `pnpm-workspace.yaml`)
- Internal cross-package deps use the `workspace:*` protocol — pnpm rewrites it to the concrete `version` from each sibling's `package.json` on `pnpm pack`/`pnpm publish`
- Each package is independent and can be worked on separately
- Packages located under `/packages/` directory:
  - `run-types`: Core type system and JIT compilation
  - `formats`: String/data format validation and serialization
  - `router`: HTTP routing and request handling
  - `core`: Shared utilities and types
  - `http`: HTTP server implementation
  - `client`: Client-side utilities
  - `codegen`: AOT (Ahead-of-Time) code generation
  - `platform-aws`, `platform-gcloud`, `platform-bun`, `platform-node`, `platform-vercel`: Platform-specific adapters
  - `cli`: Command-line interface (not yet implemented)
  - `devtools`: Vite plugin, ESLint plugin, and dev tooling for mion
- Run commands in specific package: `pnpm --filter @mionjs/<packageName> run <command>`
- Or navigate to package directory and run commands locally
- all devDependencies should be installed root level not in the packages

## Testing

- Uses Vitest as testing framework with [projects/workspace](https://vitest.dev/guide/projects) configured in root `vitest.config.ts`
- Test files use `.spec.ts` suffix
- Each package has its own `vitest.config.ts` with a `test.name` matching the package directory name
- Run a single test file from root: `pnpm exec vitest run <file-path-or-pattern>`
- Run all tests in a specific project: `pnpm exec vitest run --project <name>` (e.g. `--project router`)
- Run all tests across all packages: `pnpm run test`
- Available project names: `core`, `run-types`, `type-formats`, `router`, `client`, `platform-aws`, `platform-gcloud`, `platform-node`, `platform-vercel`, `devtools`, `drizze`
- `test-publish` package is excluded from the workspace (it tests built artifacts, run separately)
- Never run `pnpm run build` during development (only for publishing)

## Publishing Modules

- Dual module output: CommonJS and ESM
- Output directories: `./dist/cjs/` and `./dist/esm/`
- Entry files in formats package are generated during build, not part of source
- Package exports configured for both formats in package.json
- **Before publishing, always run the pre-publish verification script:** `bash scripts/pre-publish-test.sh`
  This script performs a full end-to-end check: imitating full build process and then run also test nd build in consumer project..
- This scripts must be run before any publish to npm

## Code Style

- No 'I' prefix for interfaces or 'T' prefix for type parameters
- Use 'RunType' with capital 'T' for class names (not 'Runtype')
- Prefer type casting over type assertions
- Maintain consistent formatting with existing codebase
- Don't use @param and @returns comments in JSDoc
- prefer one liner comments for functions ie: /** does this and that **/
- prefer one line if statements ie: `if (condition) doSomething();`

## Development Workflow

- Never run `pnpm run build` during development (only for publishing)
- Run `pnpm run clean` before starting work
- Use `pnpm run test` to run tests
- before committing, run `pnpm run lint` and `pnpm run format`, to ensure code style and formatting are correct (fix any errors before committing)
- always try to use pnpm scripts from packages instead of `pnpm exec <command>` if there is a script available.

## ⚠️ Devtools Rebuild Requirement

- The `@mionjs/devtools` package exports point to built output (`./build/`), not source. Other packages (client, test-server, router, etc.) import the **built** vite plugin and eslint rules via `@mionjs/devtools/vite-plugin` and `@mionjs/devtools/eslint`.
- After modifying any devtools source files, you MUST rebuild before running tests in other packages: `pnpm --filter @mionjs/devtools run build`
- Devtools' own tests (`pnpm exec vitest run --project devtools`) import source directly and do NOT need a rebuild
- Client, test-server, and any package using `mionVitePlugin` require the rebuilt output
- Use `pnpm --filter @mionjs/devtools run dev` for watch mode during active development

## Code examples

- There is a special package called `examples` that contains code examples that should compile

## ⚠️⚠️⚠️ TYPE IMPORTS !!CRITICAL!! ⚠️⚠️⚠️

NEVER USE `import type` FOR TYPES THAT NEED RUNTIME REFLECTION!

- The type compiler needs the actual import statement to preserve type metadata.
- Using `import type` strips the metadata and causes silent failures.
- This applies to: : Any type imports used for run-types, type-formats, or any other types that need type reflection
- If tests fail silently with (type metadata not found), CHECK YOUR IMPORTS FIRST

```ts
// ❌ WRONG - This breaks reflection!
import type {TypeFormatParams, Brand} from '@mionjs/core';

// ✅ CORRECT - Use regular import for types that need reflection
import {TypeFormatParams, Brand} from '@mionjs/core';
```

## Migration docs & follow-up tracking (`migration-docs/`)

The run-types → `@ts-runtypes/*` migration is recorded under [`migration-docs/`](migration-docs/):
the top-level narrative docs (README, the numbered `01`–`05`, `04-progress-log.md`) are the
history + current-architecture reference, and discrete follow-up ISSUES are tracked as one spec
file per issue under [`migration-docs/todos/`](migration-docs/todos/) and, once implemented,
[`migration-docs/done/`](migration-docs/done/) (mirrors the `docs/todos` → `docs/done` flow in
the sibling `ts-run-types` repo). Each spec is `# Title` + `**Status:**` + `**Created:**` +
evidence + a concrete fix plan.

- **Found a defect or gap outside your current task's scope? Tell the user AND file it.** Any
  latent bug, doc-vs-code drift, or adopted-with-a-caveat compromise discovered along the way
  gets BOTH: (1) surfaced in your reply (what it is, where it came from, whether it predates your
  change — bisect if cheap), and (2) recorded as a spec file under
  [`migration-docs/todos/`](migration-docs/todos/) with evidence + a fix plan, so it survives the
  session. Never let an out-of-scope finding live only in chat, and never silently widen your task
  to fix it without asking.
- **If a change implements a [`migration-docs/todos/`](migration-docs/todos/) spec, `git mv` it
  into [`migration-docs/done/`](migration-docs/done/) and update it to match what shipped** (set
  `Status: done`, note the commit/PR). Use a `partially/` note if only part shipped.

## Documentation Website

- Located in `./website` directory
- Framework: Nuxt 4 with Docus v5 theme
- Syntax: MDC (Markdown Components) - use Vue components directly in markdown
- Styling: Tailwind CSS classesy
- code examples can be imported using code-import component
