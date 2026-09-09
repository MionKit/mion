/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import 'fake-indexeddb/auto';
import {vi, describe, beforeEach, afterEach, it, expect} from 'vitest';
import {fetchRemoteMethodsMetadata} from './fetchRemoteMethodsMetadata.ts';
import {ClientOptions} from '../types.ts';
import {routesCache} from '@mionjs/core';
import {TEST_SERVER_BASE_URL} from '../../globalSetup.ts';
import {resetClientCaches} from './testUtils.ts';
import {getMetadataStore, resetMetadataStore} from './metadataStore.ts';
import {flushMetadataCache} from './clientMethodsMetadata.ts';

describe('fetchRemoteMethodsMetadata', () => {
  const baseURL = TEST_SERVER_BASE_URL;

  let options: ClientOptions;

  beforeEach(async () => {
    options = {
      baseURL,
      fetchOptions: {},
      basePath: '',
      suffix: '',
      validateParams: true,
      autoGenerateErrorId: false,
      sanitizeParams: true,
      serializer: 'stringifyJson',
      storageEngine: 'indexeddb',
    };

    resetClientCaches();
    await resetMetadataStore();
  });

  afterEach(() => {
    resetClientCaches();
  });

  it('should fetch and restore JIT functions from real server', async () => {
    // Fetch metadata for a real route from test server
    await fetchRemoteMethodsMetadata(['sayHello'], options);

    // Verify method metadata was stored in routesCache
    expect(routesCache.hasMetadata('sayHello')).toBe(true);

    const methodMeta = routesCache.getMetadata('sayHello');
    expect(methodMeta).toBeDefined();
    expect(methodMeta?.id).toBe('sayHello');

    // Verify JIT functions are available via getMethodJitFns
    const methodWithJitFns = routesCache.getMethodJitFns('sayHello');
    expect(methodWithJitFns).toBeDefined();
    expect(methodWithJitFns!.paramsJitFns).toBeDefined();
    expect(methodWithJitFns!.paramsJitFns.isType).toBeDefined();

    // Verify JIT functions have the expected structure
    const isValidUser = methodWithJitFns!.paramsJitFns.isType;
    expect(typeof isValidUser).toBe('object');
    expect(isValidUser).toHaveProperty('fn');
    expect(typeof isValidUser.fn).toBe('function');
  });

  it('should handle multiple routes with different validation types', async () => {
    // Fetch metadata for multiple routes from test server with different validation types
    await fetchRemoteMethodsMetadata(['sayHello', 'calculateAge', 'createProduct'], options);

    // Verify all methods were fetched
    expect(routesCache.hasMetadata('sayHello')).toBe(true);
    expect(routesCache.hasMetadata('calculateAge')).toBe(true);
    expect(routesCache.hasMetadata('createProduct')).toBe(true);

    // Test sayHello validation - parameters must be passed as array
    const sayHelloJit = routesCache.getMethodJitFns('sayHello')!;
    const user = {name: 'John', surname: 'Doe'};
    expect(sayHelloJit.paramsJitFns.isType.fn([user])).toBe(true);

    // Test calculateAge validation - parameters must be passed as array
    const calculateAgeJit = routesCache.getMethodJitFns('calculateAge')!;
    expect(calculateAgeJit.paramsJitFns.isType.fn([1990])).toBe(true);
    expect(calculateAgeJit.paramsJitFns.isType.fn(['1990'])).toBe(false);

    // Test createProduct validation - parameters must be passed as array
    const createProductJit = routesCache.getMethodJitFns('createProduct')!;
    const product = {id: '123', name: 'Test Product', price: 99.99};
    expect(createProductJit.paramsJitFns.isType.fn([product])).toBe(true);
    expect(createProductJit.paramsJitFns.isType.fn([{invalid: 'object'}])).toBe(false);
  });

  it('restores everything on a cold page, without asking the server again', async () => {
    // First call - fetch from server
    await fetchRemoteMethodsMetadata(['sayHello'], options);
    expect(routesCache.hasMetadata('sayHello')).toBe(true);

    // the write is deferred off the response path on purpose
    await flushMetadataCache();
    const store = await getMetadataStore();
    expect((await store.readAll(baseURL)).some((record) => record.kind === 'm' && record.id === 'sayHello')).toBe(true);

    // Clear the in-memory caches to simulate a page reload, keeping what is stored
    resetClientCaches();

    const originalFetch = global.fetch;
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    try {
      await fetchRemoteMethodsMetadata(['sayHello'], options);

      // nothing went out: the stored copy answered
      expect(mockFetch).not.toHaveBeenCalled();
      expect(routesCache.hasMetadata('sayHello')).toBe(true);

      // and the compiled functions rebuilt from it
      const methodWithJitFns = routesCache.getMethodJitFns('sayHello');
      expect(methodWithJitFns).toBeDefined();
      expect(methodWithJitFns!.paramsJitFns.isType.fn([{name: 'John', surname: 'Doe'}])).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('stores the method metadata as one record per method', async () => {
    await fetchRemoteMethodsMetadata(['sayHello'], options);
    expect(routesCache.getMetadata('sayHello')).toBeDefined();
    await flushMetadataCache();

    const store = await getMetadataStore();
    const record = (await store.readAll(baseURL)).find((entry) => entry.kind === 'm' && entry.id === 'sayHello');
    expect(record).toBeTruthy();

    const parsed = JSON.parse(record!.json);
    expect(parsed.id).toBe('sayHello');
    expect(parsed.paramsCount).toBeDefined();
    // param NAMES survive the wire round-trip, so a client can name the parameter that failed
    expect(parsed.paramNames).toBeDefined();
  });

  it('should throw for non-existent routes', async () => {
    await expect(fetchRemoteMethodsMetadata(['nonExistentRoute'], options)).rejects.toThrow(
      'Error fetching validation and serialization metadata'
    );
    expect(routesCache.hasMetadata('nonExistentRoute')).toBe(false);
  });

  it('should not fetch if method already exists locally', async () => {
    // First fetch
    await fetchRemoteMethodsMetadata(['sayHello'], options);

    // Verify method exists in routesCache
    expect(routesCache.hasMetadata('sayHello')).toBe(true);

    // Mock fetch to track calls (we can do this for this specific test)
    const originalFetch = global.fetch;
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    try {
      // Second fetch - should not make HTTP request
      await fetchRemoteMethodsMetadata(['sayHello'], options);

      // Verify fetch was not called
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      // Restore original fetch
      global.fetch = originalFetch;
    }
  });
});
