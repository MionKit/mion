// The MION_ / RT_ env fallback. The RT_ family moved to MION_ with the package
// namespace, and the vars a CONSUMER sets (their shell profile, CI job, .env)
// must keep working across that rename rather than going quietly unread.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {readEnvCompat} from '../src/core/envCompat.ts';

const CURRENT = 'MION_LINT_PRESPAWN';
const LEGACY = 'RT_LINT_PRESPAWN';

describe('readEnvCompat', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {[CURRENT]: process.env[CURRENT], [LEGACY]: process.env[LEGACY]};
    delete process.env[CURRENT];
    delete process.env[LEGACY];
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it('returns undefined when neither name is set', () => {
    expect(readEnvCompat(CURRENT)).toBeUndefined();
  });

  it('reads the current name', () => {
    process.env[CURRENT] = '0';
    expect(readEnvCompat(CURRENT)).toBe('0');
  });

  it('falls back to the legacy RT_ name', () => {
    process.env[LEGACY] = '0';
    expect(readEnvCompat(CURRENT)).toBe('0');
  });

  it('lets the current name win when both are set', () => {
    process.env[CURRENT] = '1';
    process.env[LEGACY] = '0';
    expect(readEnvCompat(CURRENT)).toBe('1');
  });

  // An empty current value is a deliberate choice for the vars that read one
  // (MION_CACHE_DIR="" forces the cache OFF), so it must not fall through to a
  // stale legacy value and silently turn the cache back on.
  it('treats an empty current value as set, not as a fall-through', () => {
    process.env[CURRENT] = '';
    process.env[LEGACY] = '0';
    expect(readEnvCompat(CURRENT)).toBe('');
  });

  // The one-warning-per-name set is module-scoped and never reset, so each warning
  // case needs a name no other case has already spent.
  function freshPair(suffix: string): [string, string] {
    const current = `MION_ENVCOMPAT_${suffix}`;
    const legacy = `RT_ENVCOMPAT_${suffix}`;
    saved[current] = process.env[current];
    saved[legacy] = process.env[legacy];
    return [current, legacy];
  }

  it('warns when the legacy name answered, naming both spellings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [current, legacy] = freshPair('WARNS');
    process.env[legacy] = '0';
    readEnvCompat(current);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain(legacy);
    expect(message).toContain(current);
  });

  it('warns once per legacy name, not once per read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [current, legacy] = freshPair('ONCE');
    process.env[legacy] = '0';
    readEnvCompat(current);
    readEnvCompat(current);
    readEnvCompat(current);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the current name answered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [current, legacy] = freshPair('QUIET');
    process.env[current] = '0';
    process.env[legacy] = '0';
    readEnvCompat(current);
    expect(warn).not.toHaveBeenCalled();
  });

  it('has no legacy twin for a name that is not MION_-prefixed', () => {
    process.env['RT_SOMETHING_ELSE'] = 'x';
    expect(readEnvCompat('SOMETHING_ELSE')).toBeUndefined();
    delete process.env['RT_SOMETHING_ELSE'];
  });
});
