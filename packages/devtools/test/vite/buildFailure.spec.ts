/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {rmSync} from 'node:fs';
import {build, createLogger} from 'vite';
import {resolve, dirname} from 'path';
import {fileURLToPath} from 'url';
import {mionVitePlugin} from '../../src/vite/mionVitePlugin.ts';
import type {MionRunTypesOptions} from '../../src/vite/mionVitePlugin.ts';
import {writeMarkerPackage} from '../helpers/inline.ts';

// The pattern-checking diagnostics exist to make a build fail CLOSED rather than ship a type whose
// validator or mock generator is wrong. This file covers the failure path, which cannot be expressed
// as an ordinary spec — a build that halts takes the test run down with it. So each case runs its own vite build over a fixture in a subprocess-ish
// isolation and asserts on the DIAGNOSTIC CODE, not on message text (upstream headlines interpolate
// values and will drift).
//
// The fixtures live in packages/devtools/test-fixtures/, which is excluded from this package's
// tsconfig on purpose: they hold deliberately broken types, and if the resolver scanned them as
// part of the devtools program then devtools' own test run would fail with the very diagnostics
// they exist to provoke.

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../test-fixtures');

type BuildOutcome = {ok: boolean; codes: string[]; messages: string[]; error: string; loc?: {file: string; line: number}};

/** Diagnostics arrive as plugin WARNINGS; the thrown error carries the first one's `loc`, which vite's overlay reads. */
async function buildFixture(name: string, runTypes: Partial<MionRunTypesOptions> = {}): Promise<BuildOutcome> {
  const dir = resolve(FIXTURES, name);
  const messages: string[] = [];
  const logger = createLogger('silent');
  logger.warn = logger.warnOnce = logger.error = (msg: string) => void messages.push(String(msg));

  let ok = true;
  let error = '';
  let loc: BuildOutcome['loc'];
  try {
    await build({
      root: dir,
      logLevel: 'silent',
      customLogger: logger,
      configFile: false,
      build: {
        write: false,
        lib: {entry: resolve(dir, 'index.ts'), formats: ['es']},
        minify: false,
        // The marker package is installed as types only; its runtime is never bundled here.
        rollupOptions: {external: [/^@mionjs\/run-types/]},
      },
      plugins: [mionVitePlugin({tsConfig: resolve(dir, 'tsconfig.json'), runTypes}) as never],
    });
  } catch (e) {
    ok = false;
    error = String((e as Error)?.message ?? e);
    // Vite 8 wraps each plugin error in the build's `errors` list.
    const thrown = e as {loc?: BuildOutcome['loc']; errors?: {loc?: BuildOutcome['loc']}[]};
    loc = thrown.loc ?? thrown.errors?.[0]?.loc;
  }
  // Only the name in a grouped `error name (n)` header or a `file(l,c): error name:` line: fixture folders share names.
  const codes = [
    ...new Set(
      [...messages.join('\n').matchAll(/(?:error|warning|info) (format-[a-z0-9-]+)(?::| \(\d+\))/g)].map((match) => match[1])
    ),
  ];
  return {ok, codes, messages, error, loc};
}

describe('build halts on pattern diagnostics', () => {
  // devtools does not depend on run-types, so the fixtures get the built marker package installed by hand.
  beforeAll(() => writeMarkerPackage(FIXTURES));
  afterAll(() => rmSync(resolve(FIXTURES, 'node_modules'), {recursive: true, force: true}));

  // Positive control FIRST: without it, "the build failed" proves nothing — a typo in a fixture
  // would fail the same way and every negative case below would pass for the wrong reason.
  it('builds a well-formed fixture cleanly', async () => {
    const result = await buildFixture('ok');
    expect(result.codes).toEqual([]);
    expect(result.ok).toBe(true);
  }, 60_000);

  it('format-sample-out-of-bounds: a mockSample that violates a sibling constraint', async () => {
    // 'b' is 1 UTF-16 code unit against minLength 5 — a "valid" sample its own validator rejects.
    const result = await buildFixture('format-sample-out-of-bounds');
    expect(result.codes).toContain('format-sample-out-of-bounds');
    expect(result.ok).toBe(false);
    // The code and place are what the vite overlay shows.
    expect(result.error).toMatch(/build stopped on 1 mion error\. First: .*\): error format-sample-out-of-bounds:/);
    expect(result.loc).toMatchObject({file: resolve(FIXTURES, 'format-sample-out-of-bounds/index.ts'), line: expect.any(Number)});
  }, 60_000);

  it('format-sample-generation-failed: a pattern the sample generator cannot handle', async () => {
    // Lookarounds, which format-sample-generation-failed names as the usual case, and no declared samples to fall back on.
    const result = await buildFixture('format-sample-generation-failed');
    expect(result.codes).toContain('format-sample-generation-failed');
    expect(result.ok).toBe(false);
  }, 60_000);

  it('format-sample-generation-failed: generation disabled via patternSampleCount: 0', async () => {
    // Counterpart to pattern-sample-count.test.ts: the passthrough also disables, on a pattern fine at any count > 0.
    const result = await buildFixture('ok', {patternSampleCount: 0});
    expect(result.codes).toContain('format-sample-generation-failed');
    expect(result.ok).toBe(false);
  }, 60_000);

  it('format-pattern-unsafe: a pattern that can be made to backtrack exponentially', async () => {
    // `(\w+\s?)*` splits a run of word characters more than one way per turn, so an input
    // that almost matches hangs the validator. Static check, no JS engine involved, which is
    // why it fires on every host and the sample time budget does not.
    const result = await buildFixture('format-pattern-unsafe');
    expect(result.codes).toContain('format-pattern-unsafe');
    expect(result.ok).toBe(false);
  }, 60_000);

  it('format-pattern-unsafe: unsafePattern opts the same pattern back in', async () => {
    // The escape hatch, for the pattern the check reads wrongly. Same fixture otherwise, so a
    // green build here proves the opt-out is what changed the verdict.
    const result = await buildFixture('format-pattern-unsafe-optout');
    expect(result.codes).toEqual([]);
    expect(result.ok).toBe(true);
  }, 60_000);

  it('format-sample-conflict: two sites sharing a cache entry with different mockSamples', async () => {
    // mockSamples are excluded from the structural id, so these intern as one entry — and one
    // entry carries one pool, making the survivor depend on scan order.
    const result = await buildFixture('format-sample-conflict');
    expect(result.codes).toContain('format-sample-conflict');
    expect(result.ok).toBe(false);
  }, 60_000);

  it('patternSampleRetries is validated by the resolver', async () => {
    // retries drives a redraw loop inside the sample generator, for a regex that parses but
    // whose draws keep failing the surrounding constraints. That loop is third-party internal
    // behaviour upstream does not test itself, so it is not mion's to assert on. What mion
    // owns is that the option is FORWARDED — so that is what this pins.
    //
    // The resolver rejects anything below 1, but complains on its own stderr rather than
    // through vite's logger, so the assertion rides on the contrast: same fixture, only the
    // option differs. A mis-wired passthrough would let 0 sail through and both halves build.
    const rejected = await buildFixture('ok', {patternSampleRetries: 0});
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toMatch(/resolver/i);

    const accepted = await buildFixture('ok', {patternSampleRetries: 1});
    expect(accepted.codes).toEqual([]);
    expect(accepted.ok).toBe(true);
  }, 60_000);
});
