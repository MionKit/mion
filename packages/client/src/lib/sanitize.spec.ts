/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {initClient} from '../client.ts';
import {TestServerApi} from '@mionjs/test-server';
import {HeadersSubset} from '@mionjs/core';
import {TEST_SERVER_BASE_URL} from '../../globalSetup.ts';

// The sanitize lane on the client. `sanitizeEmail` in the test server is declared with
// {sanitizeParams: true} over a Transform<Email, {trim: true; lowercase: true}> param; `rawEmail`
// carries the same type but never asks for the transform. The resolved flag rides the methods
// metadata, so the client can apply the same compiled transform locally BEFORE its own
// pre-validation and before the value goes on the wire.

describe('client sanitizeParams', () => {
  const baseURL = TEST_SERVER_BASE_URL;
  type MyApi = TestServerApi;
  const RAW = ' John@Example.COM ';
  const CLEAN = 'john@example.com';
  // the test server's auth headersFn guards every route, so prefill it before a call()
  const withAuth = (client: ReturnType<typeof initClient<MyApi>>) => {
    client.middleFns.auth(new HeadersSubset({Authorization: 'SANITIZE-TOKEN'})).prefill();
    return client;
  };

  it('sanitizes locally before validation and sends the clean value', async () => {
    const {routes} = withAuth(initClient<MyApi>({baseURL}));
    const subRequest = routes.sanitizeEmail(RAW);
    // the padded value would fail the email pattern without the local transform
    const errors = await subRequest.typeErrors();
    expect(errors.length).toBe(0);
    expect(subRequest.params[0]).toBe(CLEAN);
    const [response, error] = await subRequest.call();
    expect(error).toBeUndefined();
    expect(response).toBe(CLEAN);
  });

  it('runs the transform once per params array, however many times the request is prepared', async () => {
    const {routes} = initClient<MyApi>({baseURL});
    const subRequest = routes.sanitizeEmail(RAW);
    await subRequest.typeErrors();
    const afterFirst = subRequest.params;
    await subRequest.typeErrors();
    expect(subRequest.params).toBe(afterFirst);
    expect(subRequest.params[0]).toBe(CLEAN);
  });

  it('with the client option off the server still sanitizes, only the local copy stays raw', async () => {
    const {routes} = withAuth(initClient<MyApi>({baseURL, sanitizeParams: false, validateParams: false}));
    const subRequest = routes.sanitizeEmail(RAW);
    const [response, error] = await subRequest.call();
    expect(error).toBeUndefined();
    expect(response).toBe(CLEAN);
    expect(subRequest.params[0]).toBe(RAW);
  });

  it('a route the server did not register with sanitizeParams is left raw on both ends', async () => {
    const {routes} = withAuth(initClient<MyApi>({baseURL}));
    const mixed = 'John@Example.COM';
    const subRequest = routes.rawEmail(mixed);
    const errors = await subRequest.typeErrors();
    expect(errors.length).toBe(0);
    expect(subRequest.params[0]).toBe(mixed);
    const [response, error] = await subRequest.call();
    expect(error).toBeUndefined();
    expect(response).toBe(mixed);
  });

  it('wrong-shaped input reaches validation as a type error, the transform never throws', async () => {
    const {routes} = initClient<MyApi>({baseURL});
    const errors = await routes.sanitizeEmail(42 as unknown as string).typeErrors();
    expect(errors.length).toBeGreaterThan(0);
  });
});
