// ESLint v9 flat config wiring the mion lint transport from the PUBLISHED package.
//
// This is the one thing a workspace test cannot cover: CLAUDE.md records that
// @mionjs/devtools is consumed COMPILED — the `./eslint` entry is loaded through
// node, which never sees the `source` export condition, so what runs is the
// package's `build/` output. Here that output arrives inside a tarball verdaccio
// served, which is as close to a consumer as this gets.
//
// The rules are purely syntactic (they read the @mionjs/router import list), so no
// type-aware parser project is needed — a plain TS parser is enough.
//
// The entry's DEFAULT export is the `runtypes/*` plugin; mion's own `@mionjs/*`
// rules ride the named `mionPlugin` export (and `configs.recommended` registers both).
import {mionPlugin} from '@mionjs/devtools/eslint';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {parser: tsParser},
    plugins: {'@mionjs': mionPlugin},
    rules: {
      '@mionjs/strong-typed-routes': 'error',
    },
  },
];
