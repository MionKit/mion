# Mion Monorepo Architectural Guidelines

## Setup and Installation
- Before starting any task, always run `npm ci` to ensure dependencies are properly installed
- If installation issues occur, remove package-lock.json and run `npm ci` again
- Never commit package-lock.json changes unless intentional
- Run `npm run clean` before starting work to ensure all code is in sync between packages and fresh

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
- Uses Jest as testing framework
- Test files use `.spec.ts` suffix
- Run tests on single file: `npx jest <file-pattern>` (preferred for faster feedback)
- Run all tests in package: `npm run test`
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