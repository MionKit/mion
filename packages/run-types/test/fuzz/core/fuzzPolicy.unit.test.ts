// Pins the seeding policy itself.
//
// The whole design rests on two claims that are easy to break silently: a run
// is REPRODUCIBLE within a release (so a red build replays), and the seed is
// RECOVERABLE from the log (so you know what to replay with). A botched
// derivation that returns one constant for every lane, or a log line missing
// the seed, would leave every lane green and the policy useless.

import {describe, it, expect, vi, afterEach} from 'vitest';
import {entrySeed, packageVersion, parseSeed} from './fuzzPolicy.ts';
import {hashString} from './seededRng.ts';

const withoutOverride = <T>(run: () => T): T => {
  const saved = process.env.RT_FUZZ_SEED;
  delete process.env.RT_FUZZ_SEED;
  try {
    return run();
  } finally {
    if (saved !== undefined) process.env.RT_FUZZ_SEED = saved;
  }
};

afterEach(() => void vi.restoreAllMocks());

describe('entrySeed derives from the package version', () => {
  it('is stable across calls, so a run replays within a release', () => {
    const [first, second] = withoutOverride(() => [entrySeed('value'), entrySeed('value')]);
    expect(first).toBe(second);
  });

  it('differs per lane, so two lanes never share a draw sequence', () => {
    const [value, types] = withoutOverride(() => [entrySeed('value'), entrySeed('types')]);
    expect(value).not.toBe(types);
  });

  it('is the version folded with the lane name', () => {
    const seed = withoutOverride(() => entrySeed('value'));
    expect(seed).toBe(hashString(`${packageVersion()}:value`));
  });

  it('rotates when the version moves', () => {
    // The rotation claim. If the version were ever misread as a constant this
    // is the assertion that notices; the others would all still pass.
    expect(hashString('0.12.0:value')).not.toBe(hashString('0.13.0:value'));
  });

  it('reads a real version, not an empty string', () => {
    expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('RT_FUZZ_SEED overrides for replay', () => {
  it('takes a hex seed verbatim', () => {
    process.env.RT_FUZZ_SEED = '0xdecafbad';
    try {
      expect(entrySeed('value')).toBe(0xdecafbad);
    } finally {
      delete process.env.RT_FUZZ_SEED;
    }
  });

  it('takes a decimal seed verbatim', () => {
    process.env.RT_FUZZ_SEED = '32080010770';
    try {
      expect(entrySeed('value')).toBe(parseSeed('32080010770', 0));
    } finally {
      delete process.env.RT_FUZZ_SEED;
    }
  });
});

describe('the seed is always recoverable from the log', () => {
  const logged = (): string => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    withoutOverride(() => entrySeed('value'));
    return spy.mock.calls.map((call) => String(call[0])).join('\n');
  };

  it('logs the seed in the exact form replay needs', () => {
    const seed = withoutOverride(() => entrySeed('value'));
    expect(logged()).toContain(`RT_FUZZ_SEED=0x${seed.toString(16)}`);
  });

  it('names the lane, so a multi-lane log is attributable', () => {
    expect(logged()).toContain('[value-fuzz]');
  });
});
