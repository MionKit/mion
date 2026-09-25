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
import {
  flushMetadataCache,
  forgetFetchedMetadata,
  installMethodRows,
  resetMetadataCacheState,
} from '../../src/lib/clientMethodsMetadata.ts';
import {MemoryMetadataStore, resetMetadataStore, setMetadataStoreForTesting} from '../../src/lib/metadataStore.ts';
import {getMethod, isBundledMethod, resetBundledMethods, setBundledMethod} from '../../src/lib/methods.ts';
import {resetRoutesCache} from '@mionjs/core';
import type {MethodWithOptions, MethodWithOptsAndJitFns} from '@mionjs/core';
import type {ClientOptions} from '../../src/types.ts';
import {methodRow} from './testUtils.ts';
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
    verifyMethodRows({baseURL: 'http://one'} as ClientOptions, ['users/get'], {methods: {}, deps: {}, purFnDeps: {}});
    expect(unverifiedIds('http://one', ['users/get'])).toEqual([]);
    expect(unverifiedIds('http://two', ['users/get'])).toEqual(['users/get']);
  });
});

describe('a row the server no longer agrees with', () => {
  const options = {baseURL: 'http://one', storageEngine: 'memory'} as ClientOptions;
  let store: MemoryMetadataStore;
  const row = (syncId: string) => methodRow('sum', syncId, syncId, 'r');
  const storedSyncIds = async () =>
    (await store.readAll(options.baseURL))
      .filter((record) => record.kind === 'm')
      .map((record) => JSON.parse(record.json).syncId);

  beforeEach(async () => {
    resetApiBuildVersion();
    resetApiVersionRecovery();
    resetRoutesCache();
    resetBundledMethods();
    resetMetadataCacheState();
    await resetMetadataStore();
    store = new MemoryMetadataStore();
    setMetadataStoreForTesting(store);
  });

  it('is refreshed and saved when it was fetched, and nothing is reported', async () => {
    installMethodRows({methods: {sum: row('old')}, deps: {}, purFnDeps: {}}, options);
    verifyMethodRows(options, ['sum'], {methods: {sum: row('new')}, deps: {}, purFnDeps: {}});
    expect(getMethod('sum')?.syncId).toBe('new');
    await flushMetadataCache();
    expect(await storedSyncIds()).toEqual(['new']);
    expect(takeApiVersionError()).toBeUndefined();
  });

  it('is kept and reported when it was bundled: the code calling it was built against it', () => {
    setBundledMethod('sum', row('old') as MethodWithOptsAndJitFns);
    verifyMethodRows(options, ['sum'], {methods: {sum: row('new')}, deps: {}, purFnDeps: {}});
    expect(isBundledMethod('sum')).toBe(true);
    expect(getMethod('sum')?.syncId).toBe('old');
    expect(takeApiVersionError()?.publicMessage).toContain('"sum"');
  });

  it('is forgotten from memory and the store when fetched, and left alone when bundled', async () => {
    installMethodRows({methods: {sum: row('old')}, deps: {}, purFnDeps: {}}, options);
    await flushMetadataCache();
    await forgetFetchedMetadata(['sum'], options);
    expect(getMethod('sum')).toBeUndefined();
    expect(await storedSyncIds()).toEqual([]);

    setBundledMethod('sum', row('built') as MethodWithOptsAndJitFns);
    await forgetFetchedMetadata(['sum'], options);
    expect(getMethod('sum')?.syncId).toBe('built');
  });

  it('never comes back from a write still queued when it is forgotten', async () => {
    installMethodRows({methods: {sum: row('old')}, deps: {}, purFnDeps: {}}, options);
    await forgetFetchedMetadata(['sum'], options);
    await flushMetadataCache();
    expect(await storedSyncIds()).toEqual([]);
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
