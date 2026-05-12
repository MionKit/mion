# Mion Monorepo Architectural Guidelines

## Package Manager: pnpm

This monorepo uses **pnpm** (not npm). Do **not** run `npm install` — it will not respect `pnpm-workspace.yaml` and will not honor the security policies in `.npmrc`.

Security posture (see `.npmrc`):
- `frozen-lockfile=true` — installs must match `pnpm-lock.yaml` exactly
- `minimum-release-age=43200` (30 days) — refuses to install package versions younger than 30 days
- `ignore-scripts=true` — blocks all preinstall/install/postinstall scripts from dependencies
- `allow-non-registry-protocols=false` — refuses git/github/file/http specifiers (workspace:* is exempt)
- `save-exact=true` — `pnpm add` writes exact versions, never `^` or `~`
- Versions can only be updated via explicit `pnpm update <pkg>` or by deleting the lockfile

Updating dependencies:
- `pnpm update <pkg> --latest` to bump a single package
- `rm pnpm-lock.yaml && pnpm install` to fully resolve from scratch (will respect minimum release age)

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

## ⚠️⚠️⚠️ TYPE IMPORTS !!CRITICAL!!  ⚠️⚠️⚠️
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

## Documentation Website
- Located in `./website` directory
- Framework: Nuxt 4 with Docus v5 theme
- Syntax: MDC (Markdown Components) - use Vue components directly in markdown
- Styling: Tailwind CSS classesy
- code examples can be imported using code-import component
