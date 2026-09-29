// ESLint v9 flat config wiring the mion lint transport from the PUBLISHED package.
//
// This is the one thing a workspace test cannot cover: CLAUDE.md records that
// @mionjs/devtools is consumed COMPILED — the `./eslint` entry is loaded through
// node, which never sees the `source` export condition, so what runs is the
// package's `dist/` output. Here that output arrives inside a tarball verdaccio
// served, which is as close to a consumer as this gets.
//
// The `mion/*` rules are compiler-fed, so this lane also proves the published resolver runs for a consumer install.
// The parser stays plain TS: the rules take type information from the resolver.
import mion from '@mionjs/devtools/eslint';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {parser: tsParser},
    plugins: {mion},
    rules: {'mion/error': 'error'},
  },
];
