// Maps a repo-relative file path onto its shard name. The shard is part of every row
// key (`token@kind@area`), which is what lets several people mark different shards in
// parallel without ever contending over the same decision, and lets the same spelling be
// marked differently in the Go tree than on the website.
//
// Order matters: the first match wins, so the narrow prefixes sit above the broad ones.

export const SHARDS = [
  '01-vocabulary',
  '02-ts-core',
  '03-ts-devtools',
  '04-mion-packages',
  '05-go',
  '06-scripts-ci',
  '07-containers',
  '08-docs-website',
  '09-frozen',
];

// docs/done is the historical record. It is frozen wholesale rather than rewritten, so it
// gets its own shard and its rows never carry a rename.
const FROZEN = 'docs/done/';

export function areaOf(file) {
  if (file.startsWith(FROZEN)) return '09-frozen';

  if (file.startsWith('packages/ts-runtypes/')) return '02-ts-core';
  if (/^packages\/ts-runtypes-(devtools|bin|go-be-sidecar)\//.test(file)) return '03-ts-devtools';
  if (file.startsWith('packages/')) return '04-mion-packages';

  if (file.startsWith('ts-go-runtypes/')) return '05-go';

  // The website carries prose and MDC content, judged very differently from the container
  // build files next to it, so it splits off before the generic container prefix.
  if (file.startsWith('container/website/')) return '08-docs-website';
  if (file.startsWith('container/')) return '07-containers';

  if (file.startsWith('scripts/') || file.startsWith('.github/')) return '06-scripts-ci';

  if (file.startsWith('docs/')) return '08-docs-website';
  if (/^(README|SETUP|CLAUDE|CHANGELOG)\.md$/.test(file)) return '08-docs-website';

  // Root config (package.json, tsconfig.json, .oxlintrc.json, vitest.config.ts, ...).
  return '06-scripts-ci';
}
