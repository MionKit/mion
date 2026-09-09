/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The hard rule these tests exist for: mion never triggers a browser prompt. Some browsers show a
// permission bar when a page asks to keep its storage, and there is no way to know in advance which
// will, so the automatic path asks only where the permission is already granted and the call cannot
// prompt. An app that wants more asks for itself.

import {describe, beforeEach, afterEach, it, expect, vi} from 'vitest';
import {requestPersistenceWhenSilent, requestPersistentStorage} from './persistentStorage.ts';

const originalNavigator = globalThis.navigator;

function installNavigator(options: {persisted?: boolean; persist?: any; permission?: any}): {persist: any} {
  const persist = options.persist ?? vi.fn().mockResolvedValue(true);
  const navigatorStub: any = {
    storage: {persist, persisted: vi.fn().mockResolvedValue(options.persisted ?? false)},
  };
  if (options.permission !== undefined) navigatorStub.permissions = {query: options.permission};
  Object.defineProperty(globalThis, 'navigator', {value: navigatorStub, configurable: true});
  return {persist};
}

describe('persistent storage, asked for only where it cannot prompt', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {value: originalNavigator, configurable: true});
  });

  it('asks when the browser has already granted the permission', async () => {
    const {persist} = installNavigator({permission: vi.fn().mockResolvedValue({state: 'granted'})});
    await expect(requestPersistenceWhenSilent()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it.each(['prompt', 'denied'])('never asks while the permission reads %s', async (state) => {
    const {persist} = installNavigator({permission: vi.fn().mockResolvedValue({state})});
    await expect(requestPersistenceWhenSilent()).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it('never asks where the browser has no permissions api', async () => {
    const {persist} = installNavigator({});
    await expect(requestPersistenceWhenSilent()).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it('never asks when the browser refuses to answer about that permission', async () => {
    const {persist} = installNavigator({permission: vi.fn().mockRejectedValue(new TypeError('unknown permission'))});
    await expect(requestPersistenceWhenSilent()).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not ask again once the storage is already kept', async () => {
    const permission = vi.fn().mockResolvedValue({state: 'granted'});
    const {persist} = installNavigator({persisted: true, permission});
    await expect(requestPersistenceWhenSilent()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(permission).not.toHaveBeenCalled();
  });

  it('does nothing at all on a runtime with no storage manager', async () => {
    Object.defineProperty(globalThis, 'navigator', {value: {}, configurable: true});
    await expect(requestPersistenceWhenSilent()).resolves.toBe(false);
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('the app asking for itself goes straight to the browser, permission state and all', async () => {
    const permission = vi.fn().mockResolvedValue({state: 'prompt'});
    const {persist} = installNavigator({permission});
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
    expect(permission).not.toHaveBeenCalled();
  });
});
