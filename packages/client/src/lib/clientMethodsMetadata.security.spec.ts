/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// localStorage is writable by any script on the page, and its keys become object keys on restore.
// These tests pin that a prototype-named namespace, function name or hash never reaches
// Object.prototype, and that an entry is keyed by its own storage key, not by what its payload claims.

import {describe, beforeEach, afterEach, it, expect, vi} from 'vitest';
import {restoreAllDependencies, storeDependencies} from './clientMethodsMetadata.ts';
import type {ClientOptions} from '../types.ts';
import {getStorage} from './storage.ts';
import {STORAGE_KEY} from '../constants.ts';
import {resetClientCaches} from './testUtils.ts';

const options: ClientOptions = {
  baseURL: 'http://localhost:1',
  fetchOptions: {},
  basePath: '',
  suffix: '',
  validateParams: true,
  autoGenerateErrorId: false,
  serializer: 'stringifyJson',
};

const pureFn = (fnName: string) => ({fnName, namespace: 'x', paramNames: ['utl'], code: 'return () => 1'});

describe('client metadata cache: prototype safety', () => {
  beforeEach(() => getStorage().clear());
  afterEach(() => {
    resetClientCaches();
    delete (Object.prototype as any).polluted;
  });

  it('a __proto__ namespace in storage never writes onto Object.prototype', () => {
    getStorage().setItem(`${STORAGE_KEY}:pure-fn:__proto__:h1:${options.baseURL}`, JSON.stringify(pureFn('polluted')));
    getStorage().setItem(
      `${STORAGE_KEY}:pure-fn:ok:h2:${options.baseURL}`,
      JSON.stringify({...pureFn('fine'), fnName: '__proto__'})
    );
    restoreAllDependencies(options);
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });

  it('a JIT entry is keyed by its storage key, so a payload cannot claim another hash', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getStorage().setItem(`${STORAGE_KEY}:jit-fn:__proto__:${options.baseURL}`, JSON.stringify({rtFnHash: 'polluted', code: ''}));
    restoreAllDependencies(options);
    expect(({} as any).polluted).toBeUndefined();
    warn.mockRestore();
  });

  it('a server payload with a prototype-named namespace or hash is refused at store time', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storeDependencies(
      {__proto__: {code: ''} as any, constructor: {code: ''} as any},
      {
        __proto__: {polluted: pureFn('polluted') as any},
        ok: {prototype: pureFn('prototype') as any, fine: pureFn('fine') as any},
      } as any,
      options
    );
    const keys = Array.from({length: getStorage().length}, (_, i) => getStorage().key(i));
    expect(keys).toEqual([`${STORAGE_KEY}:pure-fn:ok:fine:${options.baseURL}`]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
