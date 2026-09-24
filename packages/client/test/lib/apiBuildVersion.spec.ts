/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {
  setApiBuildVersion,
  noteServerApiVersion,
  hasApiVersionMismatch,
  resetApiBuildVersion,
} from '../../src/lib/apiBuildVersion.ts';
import {unverifiedIds, verifyMethodRows, resetApiVersionRecovery} from '../../src/lib/apiVersionRecovery.ts';

describe('a version mismatch belongs to the server that answered', () => {
  beforeEach(() => {
    resetApiBuildVersion();
    resetApiVersionRecovery();
    setApiBuildVersion('build-a');
  });

  it('marks only the server whose version differs', () => {
    expect(noteServerApiVersion('http://one', 'build-b')).toBe(true);
    expect(noteServerApiVersion('http://two', 'build-a')).toBe(false);
    expect(hasApiVersionMismatch('http://one')).toBe(true);
    expect(hasApiVersionMismatch('http://two')).toBe(false);
  });

  it('confirms a route per server', () => {
    verifyMethodRows('http://one', ['users/get'], {methods: {}, deps: {}, purFnDeps: {}});
    expect(unverifiedIds('http://one', ['users/get'])).toEqual([]);
    expect(unverifiedIds('http://two', ['users/get'])).toEqual(['users/get']);
  });
});
