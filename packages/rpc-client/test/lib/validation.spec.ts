/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {initClient} from './fetchingClient.ts';
import {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../../globalSetup.ts';

// R17 — the client's local pre-validation on a `mutateStrict` route: the strategy rides the methods metadata, so the
// client rebuilds the SAME validator the server compiled. `clone` and `compact` would rebuild the params from the
// declared type instead, dropping the extra key before anything could report it.

describe('client local pre-validation on a mutateStrict route (R17)', () => {
  const baseURL = TEST_SERVER_BASE_URL;
  type MyApi = TestServerApi;
  const validUser = {name: 'John', surname: 'Doe'};

  it('accepts a payload with exactly the declared keys (no local errors)', async () => {
    const {routes} = initClient<MyApi>({baseURL});
    const errors = await routes.createUserStrict(validUser).typeErrors();
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBe(0);
  });

  it('rejects a payload carrying an unknown/extra property locally (before the request goes out)', async () => {
    const {routes} = initClient<MyApi>({baseURL});
    const withExtra = {...validUser, injected: 'nope'} as unknown as typeof validUser;
    const errors = await routes.createUserStrict(withExtra).typeErrors();
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('still catches plain type errors on strict routes', async () => {
    const {routes} = initClient<MyApi>({baseURL});
    const wrongType = {name: 123, surname: 'Doe'} as unknown as typeof validUser;
    const errors = await routes.createUserStrict(wrongType).typeErrors();
    expect(errors.length).toBeGreaterThan(0);
  });
});
