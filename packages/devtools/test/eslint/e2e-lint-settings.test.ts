// An unsupported `settings.mion` key does nothing, so a typo in an e2e config would silently lint the wrong project.
// The e2e lanes run only in the release container, so this pins the REAL config files in the normal suite.
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {LINT_SETTING_KEYS} from '../../src/lint/session-protocol.ts';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const E2E_ROOT = path.join(REPO_ROOT, 'container/pre-publish-e2e');

// extractMionSettingKeys brace-matches because importing the flat config would load the plugin and its worker prewarm.
// The scan is FLAT so a key inside a spread still counts; every setting is a scalar, so any `key:` in the block counts.
function extractMionSettingKeys(source: string): string[] {
  const start = source.search(/\bmion:\s*\{/);
  expect(start, 'no `mion: {` settings block found').toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  expect(end, 'unbalanced braces in the mion settings block').toBeGreaterThan(open);
  const body = source
    .slice(open + 1, end)
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  return [...body.matchAll(/(?:^|[{,(\s])([A-Za-z_$][\w$]*)\s*:/g)].map((match) => match[1]!);
}

describe('pre-publish e2e lint configs — only settings the plugin actually reads', () => {
  it('the oxlint config (build-vite) sets supported keys and names a real tsconfig', () => {
    const configPath = path.join(E2E_ROOT, 'apps/build-vite/oxlintrc.e2e.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {settings?: {mion?: Record<string, unknown>}};
    const settings = config.settings?.mion ?? {};
    expect(Object.keys(settings).length).toBeGreaterThan(0);
    for (const key of Object.keys(settings)) expect(LINT_SETTING_KEYS).toContain(key);
    // Named relative to the e2e root — oxlint is spawned from there (lint-all.mjs).
    expect(fs.existsSync(path.join(E2E_ROOT, String(settings['tsconfig'])))).toBe(true);
  });

  it('the eslint flat config (smoke-esbuild) sets supported keys and names a real tsconfig', () => {
    const configPath = path.join(E2E_ROOT, 'apps/smoke-esbuild/eslint.config.mjs');
    const source = fs.readFileSync(configPath, 'utf8');
    for (const key of extractMionSettingKeys(source)) expect(LINT_SETTING_KEYS).toContain(key);
    // It builds an absolute path from import.meta.url, so assert the target it
    // resolves to exists rather than re-deriving the expression.
    expect(fs.existsSync(path.join(E2E_ROOT, 'apps/smoke-esbuild/tsconfig.json'))).toBe(true);
    expect(source).toContain("new URL('tsconfig.json', import.meta.url)");
  });

  it('LINT_SETTING_KEYS is the sessionOptions contract', () => {
    // `markers` mirrors the tsconfig key of the same name. The resolver reads
    // the tsconfig itself, so this exists only so the JS-side text pre-filter
    // knows which import specifiers count as marker imports — without it, a
    // project whose markers come from its own package would have those files
    // skipped before the resolver ever saw them.
    expect([...LINT_SETTING_KEYS].sort()).toEqual(['binary', 'markers', 'timeoutMs', 'tsconfig']);
  });
});
