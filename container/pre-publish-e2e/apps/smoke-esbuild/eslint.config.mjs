// Tests the lint TRANSPORT, not the catalog. settings.mion.tsconfig is needed because the linters run from the e2e
// root, where the resolver would adopt another project's config (or none). `mion/info` shows the caveat's skipped
// member, an Info hidden by default. Host runs forward MION_E2E_BINARY to MION_BIN (see ../../lint-all.mjs).
import {fileURLToPath} from 'node:url';
import mion from '@mionjs/devtools/eslint';
import tsParser from '@typescript-eslint/parser';

const appTsconfig = fileURLToPath(new URL('tsconfig.json', import.meta.url));

export default [
  {
    // `**/*.ts` both opts ESLint into linting TypeScript and matches the target
    // regardless of the cwd the linter runs from. A TS parser is the standard
    // ESLint-on-TypeScript requirement (espree can't parse `interface`).
    files: ['**/*.ts'],
    languageOptions: {parser: tsParser},
    plugins: {mion},
    settings: {
      mion: {
        tsconfig: appTsconfig,
      },
    },
    // Real rule names matter: an unknown one prints "Definition for rule 'mion/x' was not found", which says "mion".
    rules: {...mion.configs.recommended.rules, 'mion/info': 'warn'},
  },
];
