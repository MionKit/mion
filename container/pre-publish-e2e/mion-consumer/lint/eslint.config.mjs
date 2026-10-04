// Consumer installs load the published dist, never the source export condition (AGENTS.md).
// Compiler-fed rules also require the published resolver; a plain TS parser suffices.
import mion from '@mionjs/devtools/eslint';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {parser: tsParser},
    plugins: {mion},
    rules: {'mion/runtime-error': 'error'},
  },
];
