/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The stored cache is writable by any script on the page, and its ids become object keys on restore.
// These tests pin that a prototype-named namespace, function name or hash never reaches
// Object.prototype, and that an entry is keyed by its own record id, not by what its payload claims.

import 'fake-indexeddb/auto';
import {describe, beforeEach, afterEach, it, expect, vi} from 'vitest';
import {flushMetadataCache, extractAndProcessMetadata, hydrateMetadataCache} from './clientMethodsMetadata.ts';
import type {ClientOptions} from '../types.ts';
import {getMetadataStore, resetMetadataStore, type MetadataRecord} from './metadataStore.ts';
import {MION_ROUTES} from '@mionjs/core';
import {resetClientCaches} from './testUtils.ts';

const options: ClientOptions = {
  baseURL: 'http://localhost:1',
  fetchOptions: {},
  basePath: '',
  suffix: '',
  validateParams: true,
  sanitizeParams: true,
  autoGenerateErrorId: false,
  serializer: 'stringifyJson',
  storageEngine: 'indexeddb',
};

const pureFn = (fnName: string) => ({fnName, namespace: 'x', paramNames: ['utl'], code: 'return () => 1'});

/** Writes straight into the store, the way another script on the page could. */
async function seed(records: Omit<MetadataRecord, 'baseURL' | 'ts'>[]): Promise<void> {
  const store = await getMetadataStore();
  await store.write(records.map((record) => ({...record, baseURL: options.baseURL, ts: Date.now()})));
}

/** Hands the client a server response carrying this metadata payload. */
function receiveFromServer(payload: unknown): void {
  extractAndProcessMetadata(MION_ROUTES.methodsMetadata, {[MION_ROUTES.methodsMetadata]: payload}, options);
}

describe('client metadata cache: prototype safety', () => {
  beforeEach(async () => {
    resetClientCaches();
    await resetMetadataStore();
  });
  afterEach(() => {
    resetClientCaches();
    delete (Object.prototype as any).polluted;
  });

  it('a __proto__ namespace in the store never writes onto Object.prototype', async () => {
    await seed([
      {kind: 'p', id: `__proto__::h1`, json: JSON.stringify(pureFn('polluted'))},
      {kind: 'p', id: `ok::h2`, json: JSON.stringify({...pureFn('fine'), fnName: '__proto__'})},
    ]);
    await hydrateMetadataCache(options);
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });

  it('a JIT entry is keyed by its record id, so a payload cannot claim another hash', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await seed([{kind: 'j', id: '__proto__', json: JSON.stringify({rtFnHash: 'polluted', code: ''})}]);
    await hydrateMetadataCache(options);
    expect(({} as any).polluted).toBeUndefined();
    warn.mockRestore();
  });

  it('a server payload with a prototype-named namespace or hash is refused before it is stored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // JSON.parse, not an object literal: `__proto__` written in a literal sets the prototype and is
    // never an own key, so only a parsed payload reproduces what actually arrives off the wire.
    const wire = `{
      "methods": {},
      "deps": {"__proto__": {"code": ""}, "constructor": {"code": ""}},
      "purFnDeps": {
        "__proto__": {"polluted": ${JSON.stringify(pureFn('polluted'))}},
        "ok": {"prototype": ${JSON.stringify(pureFn('prototype'))}, "fine": ${JSON.stringify(pureFn('fine'))}}
      }
    }`;
    receiveFromServer(JSON.parse(wire));
    await flushMetadataCache();

    const store = await getMetadataStore();
    const stored = await store.readAll(options.baseURL);
    expect(stored.map((record) => `${record.kind}:${record.id}`)).toEqual(['p:ok::fine']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
