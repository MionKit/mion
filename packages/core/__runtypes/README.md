# RunTypes output

This folder is managed by RunTypes (the `genDir` option, set in tsconfig
or on the bundler plugin). Everything under it follows convention:

- `types/` — modules generated on every build. Not committed; do not edit.
- `enriched/` — committed enrichment files: `friendly/` (labels and
  messages), `mock/` (sample data), `i18n/<locale>/` (translations).
