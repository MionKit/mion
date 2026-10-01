/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, afterEach} from 'vitest';
import {MION_ROUTES, RpcError} from '@mionjs/core';
import type {MethodWithOptsAndJitFns} from '@mionjs/core';
import {
  addThrownError,
  createClientResponse,
  deleteResponseValue,
  getResponseValue,
  hasResponseValue,
  nestResponseBody,
  setResponseValue,
} from '../../src/lib/clientResponse.ts';
import {deserializeResponseBody} from '../../src/lib/serializer.ts';
import {resetBundledMethods, setBundledMethod} from '../../src/lib/methods.ts';
import {DEFAULT_CLIENT_OPTIONS} from '../../src/constants.ts';

describe('client response', () => {
  it('nests ids by group and keeps every entry, the route one included', () => {
    const response = createClientResponse();
    const thrown = nestResponseBody(response, {'products/list': [1, 2], 'products/pagination': {total: 9}, auth: null});
    expect(response).toEqual({products: {list: [1, 2], pagination: {total: 9}}, auth: null});
    expect(thrown).toEqual({});
  });

  it('moves a validation error from the thrown record to its own path and leaves the rest by id', () => {
    const response = createClientResponse();
    const validation = new RpcError({type: 'validation-error', publicMessage: 'bad params'});
    const crash = new RpcError({type: 'db-down', publicMessage: 'boom'});
    const thrown = nestResponseBody(response, {
      [MION_ROUTES.thrownErrors]: {'users/session': validation, 'users/get': crash},
    });
    expect(getResponseValue(response, 'users/session')).toBe(validation);
    expect(hasResponseValue(response, 'users/get')).toBe(false);
    expect(thrown).toEqual({'users/get': crash});
    // the record itself never reaches the response: the dispatch flattens what is left
    expect(MION_ROUTES.thrownErrors in response).toBe(false);
  });

  it('reads, writes and deletes by id', () => {
    const response = createClientResponse();
    setResponseValue(response, 'a/b/c', 1);
    expect(getResponseValue(response, 'a/b/c')).toBe(1);
    expect(hasResponseValue(response, 'a/b/missing')).toBe(false);
    expect(getResponseValue(response, 'x/y')).toBeUndefined();
    deleteResponseValue(response, 'a/b/c');
    expect(hasResponseValue(response, 'a/b/c')).toBe(false);
    deleteResponseValue(response, 'x/y');
  });

  it('keeps every thrown error, in order', () => {
    const response = createClientResponse();
    const first = new RpcError({type: 'first', publicMessage: 'first'});
    const second = new RpcError({type: 'second', publicMessage: 'second'});
    addThrownError(response, first);
    addThrownError(response, second);
    expect(response['@thrownErrors']).toEqual([first, second]);
  });
});

describe('an answer the client cannot decode', () => {
  afterEach(() => resetBundledMethods());

  it('is untyped: thrown by id, never left as the method value', async () => {
    const method = {
      id: 'stamp',
      hasReturnData: true,
      returnJitFns: {
        json: {
          decode: {
            isNoop: false,
            fn: () => {
              throw new Error('not a stamp');
            },
          },
        },
      },
    } as unknown as MethodWithOptsAndJitFns;
    setBundledMethod('stamp', method);
    const httpResponse = new Response(JSON.stringify({stamp: {when: 'never'}}), {
      headers: {'content-type': 'application/json'},
    });

    const body = await deserializeResponseBody(httpResponse, DEFAULT_CLIENT_OPTIONS);

    expect('stamp' in body).toBe(false);
    const thrown = body[MION_ROUTES.thrownErrors]?.stamp;
    expect(thrown?.type).toBe('deserialization-error');
    expect(thrown?.publicMessage).toContain('not a stamp');
  });
});
