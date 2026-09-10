/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {resolveRtBinary} from './mionVitePlugin.ts';

// mion reads NO binary env var of its own: MION_BIN is the single override, honoured by
// @mionjs/bin-compiler's getExePath(), and it covers the ESLint lane too. A mion-side variable
// never could, because the two lanes run in separate processes.

const ENV_KEYS = ['MION_BIN', 'RT_BIN'] as const;

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

  it('does NOT read RT_BIN itself either — getExePath() owns the fallback', () => {
    process.env.RT_BIN = '/from/rt-bin';
    expect(resolveRtBinary()).toBeUndefined();
  });
});
