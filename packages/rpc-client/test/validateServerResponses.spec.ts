/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {initClient} from './lib/fetchingClient.ts';
import {HeadersSubset} from '@mionjs/core';
import {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';

const baseURL = TEST_SERVER_BASE_URL;
const someUser = {name: 'John', surname: 'Doe'};

function authedClient(options: {validateServerResponses?: boolean} = {}) {
  const client = initClient<TestServerApi>({baseURL, ...options});
  client.middlewares.auth.onRequest((auth) => auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})));
  return client;
}

describe('validateServerResponses', () => {
  it('is off by default, so a wrong answer reaches the caller', async () => {
    const {routes} = authedClient();
    const [result, routeError, undeclared] = await routes.wrongAnswer(someUser).call();
    expect(result).toEqual({name: 'John', surname: 42});
    expect(routeError).toBeUndefined();
    expect(undeclared).toBeUndefined();
  });

  it('lets an answer that matches the return type through', async () => {
    const {routes} = authedClient({validateServerResponses: true});
    const [result, routeError, undeclared] = await routes.createProduct({id: 'p1', name: 'Pen', price: 2}).call();
    expect(routeError).toBeUndefined();
    expect(undeclared).toBeUndefined();
    expect(result).toMatchObject({id: 'p1', name: 'Pen', price: 2});
  });

  it('drops a wrong answer and reports it in the undeclared slot', async () => {
    const {routes} = authedClient({validateServerResponses: true});
    const [result, routeError, undeclared] = await routes.wrongAnswer(someUser).call();
    expect(result).toBeUndefined();
    expect(routeError).toBeUndefined();
    expect(undeclared?.type).toBe('response-validation-error');
    expect(undeclared?.publicMessage).toBe(`Invalid response from Route or Middleware 'wrongAnswer', validation failed.`);
    expect((undeclared?.errorData as any)?.typeErrors?.length).toBeGreaterThan(0);
  });
});
