// ESLint v9+ flat config wiring the RunTypes lint transport (the SAME module that
// serves oxlint, here as an ESLint plugin). The transport, not the diagnostic
// catalog, is under test: linting the caveat must surface an RT diagnostic.
//
// No `files` restriction so the config applies to whatever file eslint is told to
// lint (the lint-transport test targets src/caveat.ts explicitly).
//
// settings.runtypes.tsconfig points the resolver at THIS app's tsconfig: the
// linters run from the e2e root, so without it the resolver would search upward
// from there and adopt some other project's config (or none). `tsconfig` and
// `timeoutMs` are the only settings the plugin reads — the binary and the working
// directory are resolved transparently, so passing them here would be a silent
// no-op. In-container the binary comes from the published @ts-runtypes/bin
// launcher (exactly what the e2e proves); for host runs the spawner forwards
// MION_E2E_BINARY to the launcher's MION_BIN env var (see ../../lint-all.mjs).
import {fileURLToPath} from 'node:url';
import runtypes from '@mionjs/devtools/eslint';
import tsParser from '@typescript-eslint/parser';

const appTsconfig = fileURLToPath(new URL('tsconfig.json', import.meta.url));

export default [
  {
    // `**/*.ts` both opts ESLint into linting TypeScript and matches the target
    // regardless of the cwd the linter runs from. A TS parser is the standard
    // ESLint-on-TypeScript requirement (espree can't parse `interface`).
    files: ['**/*.ts'],
    languageOptions: {parser: tsParser},
    plugins: {runtypes},
    settings: {
      runtypes: {
        tsconfig: appTsconfig,
      },
    },
    rules: {
      'runtypes/error': 'error',
      'runtypes/warn': 'warn',
      'runtypes/info': 'off',
    },
  },
];
