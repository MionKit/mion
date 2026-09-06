// ESLint v9 flat config wiring the mion lint transport from the PUBLISHED package.
//
// This is the one thing a workspace test cannot cover: CLAUDE.md records that
// @mionjs/devtools is consumed COMPILED — the `./eslint` entry is loaded through
// node, which never sees the `source` export condition, so what runs is the
// package's `build/` output. Here that output arrives inside a tarball verdaccio
// served, which is as close to a consumer as this gets.
//
// The `@mionjs/*` rules are compiler-fed: the plugin resolves the published
// resolver binary itself (@mionjs/bin-compiler) and runs it over the project
// tsconfig from process.cwd(), so this lane also proves the resolver path works
// for a real consumer install. The parser stays a plain TS one — the rules take
// their type information from the resolver, not from the ESLint parser.
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
      '@mionjs/no-throw-in-handlers': 'error',
      '@mionjs/returned-error-type': 'error',
    },
  },
];
