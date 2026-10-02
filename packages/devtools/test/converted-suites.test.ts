// The per-PR half of scripts/core/converted-suites.mjs: --refusals-only must still run both refusal checks and skip only the test run.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {hasBinary} from './helpers/inline.ts';

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe.runIf(hasBinary())('converted-suites --refusals-only', () => {
  it('checks the refusals, skips the converted test run and removes the tree', {timeout: 120_000}, () => {
    const result = spawnSync('node', ['scripts/core/converted-suites.mjs', '--refusals-only'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/-> builders: rewrote \d+ file\(s\), \d+ refusal\(s\)/);
    expect(result.stdout + result.stderr).not.toContain('Test Files');
    expect(existsSync(path.join(REPO_ROOT, 'packages/run-types/test/converted-builders'))).toBe(false);
  });
});
