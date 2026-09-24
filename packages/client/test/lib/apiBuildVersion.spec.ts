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
import {unverifiedIds, verifyMethodRows, resetApiVersionRecovery, rowsAgree} from '../../src/lib/apiVersionRecovery.ts';

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
        syncId: `s-${paramsJitHash}`,
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

describe('rowsAgree', () => {
  const row = {
    type: 1,
    id: 'users/get',
    isAsync: false,
    hasReturnData: true,
    paramsJitHash: 'p',
    returnJitHash: 'r',
    syncId: 'abc1234',
    pointer: ['users', 'get'],
    nestLevel: 1,
    options: {parser: {params: 'clone', return: 'clone'}, isMutation: false},
  } as unknown as MethodWithOptions;

  it('decides on the sync id alone: any other field may differ', () => {
    const other = {...row, isAsync: true, paramNames: ['id'], options: {isMutation: true}} as unknown as MethodWithOptions;
    expect(rowsAgree(row, other)).toBe(true);
  });

  it('tells apart a different sync id, and a row or id missing on either end', () => {
    expect(rowsAgree(row, {...row, syncId: 'xyz9876'})).toBe(false);
    expect(rowsAgree(row, undefined)).toBe(false);
    expect(rowsAgree({...row, syncId: undefined}, {...row, syncId: undefined})).toBe(false);
  });
});
