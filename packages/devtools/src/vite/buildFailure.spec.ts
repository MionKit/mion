/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {build, createLogger} from 'vite';
import {resolve, dirname} from 'path';
import {fileURLToPath} from 'url';
import {mionVitePlugin} from './mionVitePlugin.ts';
import type {MionRunTypesOptions} from './mionVitePlugin.ts';

// The pattern-checking diagnostics exist to make a build fail CLOSED rather than ship a type whose
// validator or mock generator is wrong. patternSidecar.spec.ts covers the success path; this file
// covers the failure path, which cannot be expressed as an ordinary spec — a build that halts takes
// the test run down with it. So each case runs its own vite build over a fixture in a subprocess-ish
// isolation and asserts on the DIAGNOSTIC CODE, not on message text (upstream headlines interpolate
// values and will drift).
//
// The fixtures live in packages/devtools/test-fixtures/, which is excluded from this package's
// tsconfig on purpose: they hold deliberately broken types, and if the resolver scanned them as
// part of the devtools program then devtools' own test run would fail with the very diagnostics
// they exist to provoke.

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../test-fixtures');

type BuildOutcome = {ok: boolean; codes: string[]; messages: string[]; error: string};

/** Runs one fixture through a real vite build with the mion plugin and reports what came out,
 *  instead of throwing. Diagnostics reach us as plugin WARNINGS (upstream's `ctx.warn`); the thrown
 *  error is only the generic "build halted" summary and carries no code, so the logger is where the
 *  evidence actually is. */
async function buildFixture(name: string, runTypes: Partial<MionRunTypesOptions> = {}): Promise<BuildOutcome> {
  const dir = resolve(FIXTURES, name);
  const messages: string[] = [];
  const logger = createLogger('silent');
  logger.warn = logger.warnOnce = logger.error = (msg: string) => void messages.push(String(msg));

  let ok = true;
  let error = '';
  try {
    await build({
      root: dir,
      logLevel: 'silent',
      customLogger: logger,
      configFile: false,
      build: {write: false, lib: {entry: resolve(dir, 'index.ts'), formats: ['es']}, minify: false},
      plugins: [mionVitePlugin({runTypes: {tsConfig: resolve(dir, 'tsconfig.json'), ...runTypes}}) as never],
    });
  } catch (e) {
    ok = false;
    error = String((e as Error)?.message ?? e);
  }
  const codes = [...new Set(messages.join('\n').match(/FMT\d{3}/g) ?? [])];
  return {ok, codes, messages, error};
}

describe('build halts on pattern diagnostics', () => {
  // Positive control FIRST: without it, "the build failed" proves nothing — a typo in a fixture
  // would fail the same way and every negative case below would pass for the wrong reason.
  it('builds a well-formed fixture cleanly', async () => {
    const result = await buildFixture('ok');
    expect(result.codes).toEqual([]);
    expect(result.ok).toBe(true);
  }, 60_000);

  it('FMT003: a mockSample that violates a sibling constraint', async () => {
    // 'b' is 1 UTF-16 code unit against minLength 5 — a "valid" sample its own validator rejects.
    const result = await buildFixture('fmt003');
    expect(result.codes).toContain('FMT003');
    expect(result.ok).toBe(false);
  }, 60_000);

  it('FMT005: a pattern the sample generator cannot handle', async () => {
    // Lookarounds, which FMT005 names as the usual case, and no declared samples to fall back on.
    const result = await buildFixture('fmt005');
    expect(result.codes).toContain('FMT005');
    expect(result.ok).toBe(false);
  }, 60_000);

  it('FMT005: generation disabled via patternSampleCount: 0', async () => {
    // Same diagnostic reached the other way, and the counterpart to patternSidecar.spec.ts's
    // "pool has exactly N entries": this proves the passthrough is live in the DISABLING
    // direction too, on a pattern that generates fine at any non-zero count.
    const result = await buildFixture('ok', {patternSampleCount: 0});
    expect(result.codes).toContain('FMT005');
    expect(result.ok).toBe(false);
  }, 60_000);

  it('FMT008: a pattern that can be made to backtrack exponentially', async () => {
    // `(\w+\s?)*` splits a run of word characters more than one way per turn, so an input
    // that almost matches hangs the validator. Static check, no JS engine involved, which is
    // why it fires on every host and the sample time budget does not.
    const result = await buildFixture('fmt008');
    expect(result.codes).toContain('FMT008');
    expect(result.ok).toBe(false);
  }, 60_000);

  it('FMT008: unsafePattern opts the same pattern back in', async () => {
    // The escape hatch, for the pattern the check reads wrongly. Same fixture otherwise, so a
    // green build here proves the opt-out is what changed the verdict.
    const result = await buildFixture('fmt008-optout');
    expect(result.codes).toEqual([]);
    expect(result.ok).toBe(true);
  }, 60_000);

  it('FMT006: two sites sharing a cache entry with different mockSamples', async () => {
    // mockSamples are excluded from the structural id, so these intern as one entry — and one
    // entry carries one pool, making the survivor depend on scan order.
    const result = await buildFixture('fmt006');
    expect(result.codes).toContain('FMT006');
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
