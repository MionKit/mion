// ESLint v9 flat config wiring the mion lint transport from the PUBLISHED package.
//
// This is the one thing a workspace test cannot cover: CLAUDE.md records that
// @mionjs/devtools is consumed COMPILED — the `./eslint` entry is loaded through
// node, which never sees the `source` export condition, so what runs is the
// package's `build/` output. Here that output arrives inside a tarball verdaccio
// served, which is as close to a consumer as this gets.
//
// The `mion/*` rules are compiler-fed: the plugin resolves the published
// resolver binary itself (@mionjs/bin-compiler) and runs it over the project
// tsconfig from process.cwd(), so this lane also proves the resolver path works
// for a real consumer install. The parser stays a plain TS one — the rules take
// their type information from the resolver, not from the ESLint parser.
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
