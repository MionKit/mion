/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {mionVitePlugin} from './mionVitePlugin.ts';

// mion supports only the emit modes that ship a code body. @ts-runtypes' third mode, 'functions',
// omits `code` and ships a live closure instead — fine for a single process, fatal for mion, whose
// client story is serializing compiled fns as strings and rebuilding them in the browser. A
// 'functions' build would produce clients that throw on first validate, so it is rejected at config
// time rather than at runtime in someone else's browser. This guarantee is what lets MionTypeFn
// (packages/core/src/types/general.types.ts) type `code` as required.

describe('mionVitePlugin emitMode', () => {
  it("rejects emitMode 'functions' at config time", () => {
    expect(() => mionVitePlugin({runTypes: {emitMode: 'functions' as never}})).toThrow(/emitMode: 'functions' is not supported/);
  });

  it("accepts 'code' and 'both'", () => {
    expect(() => mionVitePlugin({runTypes: {emitMode: 'code'}})).not.toThrow();
    expect(() => mionVitePlugin({runTypes: {emitMode: 'both'}})).not.toThrow();
  });

  it('accepts an omitted emitMode (defaults to code)', () => {
    expect(() => mionVitePlugin({})).not.toThrow();
  });
});
