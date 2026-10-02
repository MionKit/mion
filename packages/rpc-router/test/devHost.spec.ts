/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, it, expect, afterEach} from 'vitest';
import {getHostRequestHandler, hostOwnsSocket, resetRouter, setHostOwnsSocket, setHostRequestHandler} from '../src/router.ts';

// The dev-host flag: a host that owns the socket (the mion vite plugin) sets it before loading the
// server entry, and every platform adapter the entry starts reads it instead of an option the host
// would have to name.
describe('the dev-host flag', () => {
  afterEach(() => setHostOwnsSocket(false));

  it('is off until a host sets it', () => {
    expect(hostOwnsSocket()).toBe(false);
    expect(getHostRequestHandler()).toBeUndefined();
  });

  it('keeps the handler an adapter hands over', () => {
    const fetch = () => new Response('ok');
    setHostOwnsSocket(true);
    setHostRequestHandler({fetch});
    expect(hostOwnsSocket()).toBe(true);
    expect(getHostRequestHandler()).toEqual({fetch});
  });

  it('survives resetRouter, which a dev host calls before reloading the entry', () => {
    setHostOwnsSocket(true);
    resetRouter();
    expect(hostOwnsSocket()).toBe(true);
  });

  it('drops the handler when the host lets the socket go', () => {
    setHostOwnsSocket(true);
    setHostRequestHandler({node: () => undefined});
    setHostOwnsSocket(false);
    expect(getHostRequestHandler()).toBeUndefined();
  });
});
