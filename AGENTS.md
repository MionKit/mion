# Mion Monorepo Architectural Guidelines

## Monorepo Structure
- Uses npm workspaces for monorepo management (see workspaces in package.json)
- Each package is independent and can be worked on separately
- Packages located under `/packages/` directory:
  - `run-types`: Core type system and JIT compilation
  - `formats`: String/data format validation and serialization
  - `router`: HTTP routing and request handling
  - `core`: Shared utilities and types
  - `http`: HTTP server implementation
  - `client`: Client-side utilities
  - `codegen`: AOT (Ahead-of-Time) code generation
  - `aws`, `gcloud`, `serverless`, `bun`: Platform-specific adapters
  - `cli`: Command-line interface (not yet implemented)
  - `eslint-plugin`: ESLint plugin for mion
- Run commands in specific package: `npm run <command> -w @mionkit/<packageName>`
- Or navigate to package directory and run commands locally
- all devDependencies should be installed root level not in the packages

## Testing
- Uses Vitest as testing framework with [projects/workspace](https://vitest.dev/guide/projects) configured in root `vitest.config.ts`
- Test files use `.spec.ts` suffix
- Each package has its own `vitest.config.ts` with a `test.name` matching the package directory name
- Run a single test file from root: `npx vitest run <file-path-or-pattern>`
- Run all tests in a specific project: `npx vitest run --project <name>` (e.g. `--project router`)
- Run all tests across all packages: `npm run test`
- Available project names: `core`, `run-types`, `type-formats`, `router`, `client`, `aws`, `gcloud`, `node`, `devtools`, `drizze`
- `test-publish` package is excluded from the workspace (it tests built artifacts, run separately)
- Never run `npm run build` during development (only for publishing)

## Publishing Modules
- Dual module output: CommonJS and ESM
- Output directories: `./dist/cjs/` and `./dist/esm/`
- Entry files in formats package are generated during build, not part of source
- Package exports configured for both formats in package.json

## Code Style
- No 'I' prefix for interfaces or 'T' prefix for type parameters
- Use 'RunType' with capital 'T' for class names (not 'Runtype')
- Prefer type casting over type assertions
- Maintain consistent formatting with existing codebase
- Don't use @param and @returns comments in JSDoc
- prefer one liner comments for functions ie: /** does this and that **/
- prefer one line if statements ie: `if (condition) doSomething();`

## Development Workflow
- Never run `npm run build` during development (only for publishing)
- Run `npm run clean` before starting work
- Use `npm run test` to run tests
- before committing, run `npm run lint` and `npm run format`, to ensure code style and formatting are correct (fix any errors before committing)
- commit often after small changes

## Code examples
- There is a special package called `examples` that contains code examples that should compile

## Documentation Website
- Located in `./website` directory
- Framework: Nuxt 4 with Docus v5 theme
- Syntax: MDC (Markdown Components) - use Vue components directly in markdown
- Styling: Tailwind CSS classesy
- code examples can be imported using code-import component

## ⚠️⚠️⚠️ CRITICAL: TYPE IMPORTS ⚠️⚠️⚠️

**NEVER USE `import type` FOR TYPES THAT NEED RUNTIME REFLECTION!**

Deepkit's type compiler needs the actual import statement to preserve type metadata.
Using `import type` strips the metadata and causes silent failures.

```ts
// ❌ WRONG - This breaks reflection!
import type {TypeFormatParams, Brand} from '@mionkit/core';

// ✅ CORRECT - Use regular import for types that need reflection
import {TypeFormatParams, Brand} from '@mionkit/core';
```

This applies to:
- Any type imports used for run-types, type-formats, or any other types that need type reflection

**If tests fail silently with (type metadata not found), CHECK YOUR IMPORTS FIRST!**

---