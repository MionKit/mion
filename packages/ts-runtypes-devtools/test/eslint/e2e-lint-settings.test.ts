// Contract guard between the lint plugin and the pre-publish e2e fixture's lint
// configs. sessionOptions() drops every `settings.runtypes` key outside
// LINT_SETTING_KEYS, and a linter has nowhere to report a config complaint, so an
// unsupported key is a SILENT no-op: both e2e configs used to set `cwd` (and one
// of them `binary`) believing they pointed the resolver at the app, while the
// resolver actually searched upward from the e2e root for a tsconfig and found
// the monorepo's own — or none at all in-container.
//
// The e2e lanes only run inside the release gate's container, so this is the pin
// that runs in the normal suite. It reads the REAL config files rather than a
// copy: a key the plugin does not consume fails here, at the layer that knows.
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {LINT_SETTING_KEYS} from '../../src/eslint/session-protocol.ts';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const E2E_ROOT = path.join(REPO_ROOT, 'container/pre-publish-e2e');

// extractRuntypesSettingKeys pulls every key named inside the `runtypes: {...}`
// settings block of a lint config written as JS, by brace matching from the key.
// (The eslint flat config is a module that imports the plugin, so it cannot just
// be imported here — loading the plugin entry top-level-awaits a worker prewarm.)
//
// The scan is FLAT, not top-level-only: the original defect injected its key
// through a spread — `...(process.env.X ? {binary: X} : {})` — which a
// top-level-key scan walks straight past. Every supported setting is a scalar
// (see LINT_SETTING_KEYS), so any `key:` anywhere in the block is a setting that
// must be supported.
function extractRuntypesSettingKeys(source: string): string[] {
  const start = source.search(/\bruntypes:\s*\{/);
  expect(start, 'no `runtypes: {` settings block found').toBeGreaterThanOrEqual(0);
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
  expect(end, 'unbalanced braces in the runtypes settings block').toBeGreaterThan(open);
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
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {settings?: {runtypes?: Record<string, unknown>}};
    const settings = config.settings?.runtypes ?? {};
    expect(Object.keys(settings).length).toBeGreaterThan(0);
    for (const key of Object.keys(settings)) expect(LINT_SETTING_KEYS).toContain(key);
    // Named relative to the e2e root — oxlint is spawned from there (lint-all.mjs).
    expect(fs.existsSync(path.join(E2E_ROOT, String(settings['tsconfig'])))).toBe(true);
  });

  it('the eslint flat config (smoke-esbuild) sets supported keys and names a real tsconfig', () => {
    const configPath = path.join(E2E_ROOT, 'apps/smoke-esbuild/eslint.config.mjs');
    const source = fs.readFileSync(configPath, 'utf8');
    for (const key of extractRuntypesSettingKeys(source)) expect(LINT_SETTING_KEYS).toContain(key);
    // It builds an absolute path from import.meta.url, so assert the target it
    // resolves to exists rather than re-deriving the expression.
    expect(fs.existsSync(path.join(E2E_ROOT, 'apps/smoke-esbuild/tsconfig.json'))).toBe(true);
    expect(source).toContain("new URL('tsconfig.json', import.meta.url)");
  });

  it('LINT_SETTING_KEYS is the sessionOptions contract', () => {
    expect([...LINT_SETTING_KEYS].sort()).toEqual(['timeoutMs', 'tsconfig']);
  });
});
