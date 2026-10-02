/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, it, expect, afterEach} from 'vitest';
import {getHostRequestHandler, handOverToHost, hostOwnsSocket, resetRouter, setHostOwnsSocket} from '../src/router.ts';

// A dev host sets the flag before loading the entry; every adapter reads it instead of an option the host must name.
describe('the dev-host flag', () => {
  afterEach(() => setHostOwnsSocket(false));

  it('is off until a host sets it', () => {
    expect(hostOwnsSocket()).toBe(false);
    expect(getHostRequestHandler()).toBeUndefined();
  });

  it('keeps the handler an adapter hands over, and tells it not to listen', () => {
    const fetch = () => new Response('ok');
    setHostOwnsSocket(true);
    expect(handOverToHost({fetch})).toBe(true);
    expect(getHostRequestHandler()).toEqual({fetch});
  });

  it('keeps nothing and lets the adapter listen when no host owns the socket', () => {
    expect(handOverToHost({fetch: () => new Response('ok')})).toBe(false);
    expect(getHostRequestHandler()).toBeUndefined();
  });

  it('survives resetRouter, which a dev host calls before reloading the entry', () => {
    setHostOwnsSocket(true);
    resetRouter();
    expect(hostOwnsSocket()).toBe(true);
  });

  it('drops the handler when the host lets the socket go', () => {
    setHostOwnsSocket(true);
    handOverToHost({node: () => undefined});
    setHostOwnsSocket(false);
    expect(getHostRequestHandler()).toBeUndefined();
  });
});
