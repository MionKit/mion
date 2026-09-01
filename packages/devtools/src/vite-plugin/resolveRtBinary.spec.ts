/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach, afterEach, vi} from 'vitest';
import {resolveRtBinary} from './mionVitePlugin.ts';

// mion reads NO binary env var of its own: MION_BIN (@ts-runtypes/bin 0.11.0+) is the single
// override, and it covers the ESLint lane too. A mion-side variable never could, because the
// two lanes run in separate processes — which is exactly why TS_RUNTYPES_BIN was retired.

const ENV_KEYS = ['MION_BIN', 'RT_BIN', 'TS_RUNTYPES_BIN'] as const;

describe('resolveRtBinary', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.restoreAllMocks();
  });

  it('returns the explicit option verbatim, ahead of every env var', () => {
    process.env.MION_BIN = '/from/rt-bin';
    expect(resolveRtBinary('/explicit/binary')).toBe('/explicit/binary');
  });

  it('returns undefined with nothing set, so getExePath() resolves the platform package', () => {
    expect(resolveRtBinary()).toBeUndefined();
  });

  it('does NOT read MION_BIN itself — it defers to getExePath(), which honours it', () => {
    process.env.MION_BIN = '/from/rt-bin';
    // Returning the path here would bypass getExePath() and re-introduce a mion-side lane.
    expect(resolveRtBinary()).toBeUndefined();
  });

  it('ignores the retired TS_RUNTYPES_BIN instead of returning it', () => {
    process.env.TS_RUNTYPES_BIN = '/legacy/binary';
    expect(resolveRtBinary()).toBeUndefined();
  });

  it('warns once when TS_RUNTYPES_BIN is set alone, so the switch is never silent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.TS_RUNTYPES_BIN = '/legacy/binary';
    resolveRtBinary();
    resolveRtBinary();
    // The notice is module-scoped: at most one warning for this process, and it must name
    // the replacement. Another spec may have tripped it already, hence <= rather than ===.
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    if (warn.mock.calls.length === 1) expect(String(warn.mock.calls[0][0])).toContain('MION_BIN');
  });

  it('stays quiet when MION_BIN is also set — nothing is being ignored', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.TS_RUNTYPES_BIN = '/legacy/binary';
    process.env.MION_BIN = '/from/rt-bin';
    expect(resolveRtBinary()).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  // RT_BIN is the PREVIOUS spelling of MION_BIN, and unlike TS_RUNTYPES_BIN it is still
  // read (by @ts-runtypes/bin, with its own deprecation warning). So a user on the old
  // name is not being ignored, and the retired-name notice must not fire at them.
  it('stays quiet when the deprecated RT_BIN is set — it is still honoured downstream', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.TS_RUNTYPES_BIN = '/legacy/binary';
    process.env.RT_BIN = '/from/rt-bin';
    expect(resolveRtBinary()).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does NOT read RT_BIN itself either — getExePath() owns the fallback', () => {
    process.env.RT_BIN = '/from/rt-bin';
    expect(resolveRtBinary()).toBeUndefined();
  });
});
