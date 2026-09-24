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
  takeApiVersionError,
} from '../../src/lib/apiBuildVersion.ts';
import {installMethodRows} from '../../src/lib/clientMethodsMetadata.ts';
import {getMethod} from '../../src/lib/methods.ts';
import {resetRoutesCache} from '@mionjs/core';
import type {MethodWithOptions} from '@mionjs/core';
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

describe('a stale fetched row', () => {
  beforeEach(() => {
    resetApiBuildVersion();
    resetApiVersionRecovery();
    resetRoutesCache();
  });

  it('is replaced by the server row once the server says it changed', () => {
    const row = (paramsJitHash: string) =>
      ({
        id: 'sum',
        type: 1,
        paramsJitHash,
        returnJitHash: 'r',
        pointer: ['sum'],
        nestLevel: 0,
        isAsync: false,
        hasReturnData: true,
        options: {},
      }) as unknown as MethodWithOptions;
    installMethodRows({methods: {sum: row('old')}, deps: {}, purFnDeps: {}});
    verifyMethodRows('http://one', ['sum'], {methods: {sum: row('new')}, deps: {}, purFnDeps: {}});
    expect(getMethod('sum')?.paramsJitHash).toBe('new');
    expect(takeApiVersionError()?.type).toBe('api-version-mismatch');
  });
});
