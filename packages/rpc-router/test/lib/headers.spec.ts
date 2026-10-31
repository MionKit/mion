/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from '../../src/router.ts';
import {dispatchRoute} from '../../src/dispatch.ts';
import {
  headersFromRecord,
  FetchResponseHeaders,
  RecordResponseHeaders,
  getDefaultHeaders,
  getDefaultFetchHeaders,
  releaseHeaders,
  replyFetch,
} from '../../src/lib/headers.ts';
import {JSON_CONTENT_TYPE} from '../../src/constants.ts';
import type {MionHeaders, MionResponse} from '../../src/types/context.ts';
import {HeadersSubset, RpcError, StatusCodes} from '@mionjs/core';
import {createValidateFn, createGetValidationErrorsFn} from '@mionjs/run-types';

const mion = createMionRouter();

type RawRequest = {
  headers: MionHeaders;
  body: string;
};

describe('Request and Response Headers', () => {
  const getDefaultRequest = (path: string, params?: any, rawHeaders: Record<string, string> = {}): RawRequest => ({
    headers: headersFromRecord(rawHeaders),
    body: JSON.stringify({[path]: params}),
  });

  beforeEach(() => resetRouter());

  describe('can compile jit functions for headers', () => {
    it('should compile isType function for headers - only required', () => {
      const isType = createValidateFn<HeadersSubset<'Authorization'>>();
      expect(isType(new HeadersSubset({Authorization: 'Bearer 1234'}))).toEqual(true);
      expect(isType(new HeadersSubset({} as any))).toEqual(false);
      expect(isType(3)).toEqual(false);
      // mion validates classes structurally: a bare header map misses the .headers wrapper
      expect(isType({Authorization: 'Bearer 1234'})).toEqual(false);
    });

    it('should compile isType function for headers - only optional', () => {
      const isType = createValidateFn<HeadersSubset<never, 'X-User-Id'>>();
      expect(isType(new HeadersSubset({}))).toEqual(true);
      expect(isType(new HeadersSubset({'X-User-Id': 'user-123'}))).toEqual(true);
      expect(isType(3)).toEqual(false);
    });

    it('should compile isType function for headers - both required and optional', () => {
      const isType = createValidateFn<HeadersSubset<'Authorization', 'X-User-Id'>>();
      expect(isType(new HeadersSubset({Authorization: 'Bearer 1234'}))).toEqual(true);
      expect(isType(new HeadersSubset({Authorization: 'Bearer 1234', 'X-User-Id': 'user-1234'}))).toEqual(true);
      expect(isType(new HeadersSubset({'X-User-Id': 'user-1234'} as any))).toEqual(false);
      expect(isType(3)).toEqual(false);
      expect(isType({Authorization: 'Bearer 1234'})).toEqual(false);
    });

    it('should compile typeErrors function for headers', () => {
      const typeErrors = createGetValidationErrorsFn<HeadersSubset<'Authorization', 'X-User-Id'>>();
      expect(typeErrors(new HeadersSubset({Authorization: 'Bearer 1234'}))).toEqual([]);
      expect(typeErrors(new HeadersSubset({Authorization: 'Bearer 1234', 'X-User-Id': 'user-1234'}))).toEqual([]);
      const missingRequired = typeErrors(new HeadersSubset({'X-User-Id': 'user-1234'} as any));
      expect(missingRequired.length).toBeGreaterThan(0);
      expect(missingRequired[0].path).toEqual(['headers', 'Authorization']);
      const notAnObject = typeErrors(3);
      expect(notAnObject.length).toBeGreaterThan(0);
      expect(notAnObject[0].path).toEqual([]);
    });
  });

  describe('Reading headers in headersMiddleware', () => {
    it('should extract and pass single header value to headersMiddleware', async () => {
      const shared = {auth: {token: null as any}};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        auth: mion.headersMiddleware((ctx, h: HeadersSubset<'Authorization'>): void => {
          const token = h.headers.Authorization;
          ctx.shared.auth.token = token;
        }),
        getUser: mion.route((ctx): string => `Token: ${ctx.shared.auth.token}`),
      });

      const request = getDefaultRequest('getUser', [], {Authorization: 'bearer-token-123'});

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.body.getUser).toEqual('Token: bearer-token-123');
    });

    it('should handle case-insensitive header names', async () => {
      const shared = {auth: {token: null as any}};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        auth: mion.headersMiddleware((ctx, h: HeadersSubset<'Authorization'>): void => {
          const token = h.headers.Authorization;
          ctx.shared.auth.token = token;
        }),
        getUser: mion.route((ctx): string => `Token: ${ctx.shared.auth.token}`),
      });

      // Use mixed case header name
      const request = getDefaultRequest('getUser', [], {AuThoriZatioN: 'mixed-case-token'});

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.body.getUser).toEqual('Token: mixed-case-token');
    });

    it('should return validation error when required header is missing', async () => {
      const shared = {auth: {token: null as any}};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        auth: mion.headersMiddleware((ctx, h: HeadersSubset<'Authorization'>): void => {
          const token = h.headers.Authorization;
          ctx.shared.auth.token = token;
        }),
        getUser: mion.route((ctx): string => 'user'),
      });

      // No Authorization header provided
      const request = getDefaultRequest('getUser', []);

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeTruthy();
      const error = response.body['@thrownErrors']?.auth;
      // the body holds the error's wire shape, not the live instance
      expect(error).toEqual({
        'mion@isΣrrθr': true,
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'validation-error',
        publicMessage: `Invalid params in 'auth', validation failed.`,
        errorData: expect.anything(),
      });
    });

    it('should error on empty header values', async () => {
      const shared = {auth: {token: null as any}};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        auth: mion.headersMiddleware((ctx, h: HeadersSubset<'Authorization'>): void => {
          const token = h.headers.Authorization;
          ctx.shared.auth.token = token;
        }),
        getUser: mion.route((ctx): string => `Token: ${ctx.shared.auth.token || 'empty'}`),
      });

      // Empty Authorization header
      const request = getDefaultRequest('getUser', [], {Authorization: ''});

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      // Empty string should fail validation
      expect(response.hasErrors).toBeTruthy();
    });

    it('should not error on empty header values when optional', async () => {
      const shared = {auth: {token: null as any}};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        auth: mion.headersMiddleware((ctx, h: HeadersSubset<never, 'Authorization'>): void => {
          const token = h.headers.Authorization;
          ctx.shared.auth.token = token;
        }),
        getUser: mion.route((ctx): string => `Token: ${ctx.shared.auth.token || 'empty'}`),
      });

      // Empty Authorization header
      const request = getDefaultRequest('getUser', [], {});

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.body.getUser).toEqual('Token: empty');
    });
  });

  describe('Setting headers from middleware return values', () => {
    it('should set single header from middleware return value', async () => {
      const shared = {data: 'test'};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        setHeadersMiddleware: mion.middleware((ctx): HeadersSubset<'x-custom'> => {
          return new HeadersSubset({'x-custom': 'custom-value'});
        }),
        testRoute: mion.route((): string => 'ok'),
      });

      const request = getDefaultRequest('testRoute', []);

      const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.headers.get('x-custom')).toEqual('custom-value');
    });

    it('should set multiple headers from middleware return value', async () => {
      const shared = {data: 'test'};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        setHeadersMiddleware: mion.middleware((ctx): HeadersSubset<'x-custom' | 'x-token' | 'x-version'> => {
          return new HeadersSubset({
            'x-custom': 'custom-value',
            'x-token': 'token-value',
            'x-version': 'v1.0',
          });
        }),
        testRoute: mion.route((): string => 'ok'),
      });

      const request = getDefaultRequest('testRoute', []);

      const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.headers.get('x-custom')).toEqual('custom-value');
      expect(response.headers.get('x-token')).toEqual('token-value');
      expect(response.headers.get('x-version')).toEqual('v1.0');
    });

    it('should handle case-insensitive header names in response', async () => {
      const shared = {data: 'test'};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        setHeadersMiddleware: mion.middleware((ctx): HeadersSubset<'X-Custom'> => {
          return new HeadersSubset({'X-Custom': 'custom-value'});
        }),
        testRoute: mion.route((): string => 'ok'),
      });

      const request = getDefaultRequest('testRoute', []);

      const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      // Headers should be stored in lowercase
      expect(response.headers.get('x-custom')).toEqual('custom-value');
      expect(response.headers.get('X-CUSTOM')).toEqual('custom-value');
    });

    it('should skip undefined header values', async () => {
      const shared = {data: 'test'};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        setHeadersMiddleware: mion.middleware((ctx): HeadersSubset<'x-custom', 'x-token'> => {
          return new HeadersSubset({'x-custom': 'custom-value'});
        }),
        testRoute: mion.route((): string => 'ok'),
      });

      const request = getDefaultRequest('testRoute', []);

      const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.headers.get('x-custom')).toEqual('custom-value');
      expect(response.headers.get('x-token')).toBeUndefined();
    });
  });

  describe('Setting headers from route return values', () => {
    it('should set single header from route return value', async () => {
      const shared = {data: 'test'};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        getUser: mion.route((ctx): HeadersSubset<'x-user-id'> => {
          return new HeadersSubset({'x-user-id': 'user-123'});
        }),
      });

      const request = getDefaultRequest('getUser', []);

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.headers.get('x-user-id')).toEqual('user-123');
    });

    it('should set multiple headers from route return value', async () => {
      const shared = {data: 'test'};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        getUser: mion.route((ctx): HeadersSubset<'x-user-id' | 'x-user-role' | 'x-timestamp'> => {
          return new HeadersSubset({
            'x-user-id': 'user-123',
            'x-user-role': 'admin',
            'x-timestamp': '1234567890',
          });
        }),
      });

      const request = getDefaultRequest('getUser', []);

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.headers.get('x-user-id')).toEqual('user-123');
      expect(response.headers.get('x-user-role')).toEqual('admin');
      expect(response.headers.get('x-timestamp')).toEqual('1234567890');
    });

    it('should handler return headers when headers type is n and union', async () => {
      const shared = {data: 'test'};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        getUser: mion.route((ctx): HeadersSubset<'x-user-id'> | RpcError<'x-some-error'> => {
          return new HeadersSubset({'x-user-id': 'user-123'});
        }),
      });

      const request = getDefaultRequest('getUser', []);

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.headers.get('x-user-id')).toEqual('user-123');
    });
  });

  describe('Multiple headers', () => {
    it('should read and set multiple headers simultaneously', async () => {
      const shared = {auth: {token: null as any, userId: null as any}};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        auth: mion.headersMiddleware((ctx, h: HeadersSubset<'Authorization' | 'X-User-Id'>): HeadersSubset<'x-auth-status'> => {
          const token = h.headers.Authorization;
          const userId = h.headers['X-User-Id'];
          ctx.shared.auth.token = token;
          ctx.shared.auth.userId = userId;
          return new HeadersSubset({'x-auth-status': 'authenticated'});
        }),
        getUser: mion.route((ctx): string => `User ${ctx.shared.auth.userId} with token ${ctx.shared.auth.token}`),
      });

      const request = getDefaultRequest('getUser', [], {
        Authorization: 'bearer-token-123',
        'X-User-Id': 'user-456',
      });

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.body.getUser).toEqual('User user-456 with token bearer-token-123');
      expect(response.headers.get('x-auth-status')).toEqual('authenticated');
    });

    it('should handle multiple headers with different cases', async () => {
      const shared = {auth: {token: null as any, userId: null as any}};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        auth: mion.headersMiddleware((ctx, h: HeadersSubset<'Authorization' | 'X-User-Id'>): void => {
          const token = h.headers.Authorization;
          const userId = h.headers['X-User-Id'];
          ctx.shared.auth.token = token;
          ctx.shared.auth.userId = userId;
        }),
        getUser: mion.route((ctx): string => `User ${ctx.shared.auth.userId}`),
      });

      // Use different case variations
      const request = getDefaultRequest('getUser', [], {
        authorization: 'bearer-token-123',
        'x-user-id': 'user-456',
      });

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.body.getUser).toEqual('User user-456');
    });

    it('should fail validation when one of multiple required headers is missing', async () => {
      const shared = {auth: {token: null as any, userId: null as any}};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        auth: mion.headersMiddleware((ctx, h: HeadersSubset<'Authorization' | 'X-User-Id'>): void => {
          const token = h.headers.Authorization;
          const userId = h.headers['X-User-Id'];
          ctx.shared.auth.token = token;
          ctx.shared.auth.userId = userId;
        }),
        getUser: mion.route((ctx): string => 'user'),
      });

      // Only provide Authorization header, missing X-User-Id
      const request = getDefaultRequest('getUser', [], {
        Authorization: 'bearer-token-123',
      });

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeTruthy();
      const error = response.body['@thrownErrors']?.auth;
      // the body holds the error's wire shape, not the live instance
      expect(error).toEqual({
        'mion@isΣrrθr': true,
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'validation-error',
        publicMessage: `Invalid params in 'auth', validation failed.`,
        errorData: expect.anything(),
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle headers with special characters', async () => {
      const shared = {auth: {token: null as any}};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        auth: mion.headersMiddleware((ctx, h: HeadersSubset<'Authorization'>): void => {
          const token = h.headers.Authorization;
          ctx.shared.auth.token = token;
        }),
        getUser: mion.route((ctx): string => `Token: ${ctx.shared.auth.token}`),
      });

      const request = getDefaultRequest('getUser', [], {
        Authorization:
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      });

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.body.getUser).toContain('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should handle headers with whitespace', async () => {
      const shared = {auth: {token: null as any}};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        auth: mion.headersMiddleware((ctx, h: HeadersSubset<'Authorization'>): void => {
          const token = h.headers.Authorization;
          ctx.shared.auth.token = token;
        }),
        getUser: mion.route((ctx): string => `Token: ${ctx.shared.auth.token}`),
      });

      const request = getDefaultRequest('getUser', [], {
        Authorization: '  bearer-token-with-spaces  ',
      });

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.body.getUser).toEqual('Token:   bearer-token-with-spaces  ');
    });

    it('should handle long header values', async () => {
      const shared = {auth: {token: null as any}};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        auth: mion.headersMiddleware((ctx, h: HeadersSubset<'Authorization'>): void => {
          const token = h.headers.Authorization;
          ctx.shared.auth.token = token;
        }),
        getUser: mion.route((ctx): string => `Token length: ${ctx.shared.auth.token.length}`),
      });

      const longToken = 'x'.repeat(1000);
      const request = getDefaultRequest('getUser', [], {
        Authorization: longToken,
      });

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.body.getUser).toEqual('Token length: 1000');
    });

    it('should preserve header order when setting multiple headers', async () => {
      const shared = {data: 'test'};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        setHeadersMiddleware: mion.middleware((ctx): HeadersSubset<'x-first' | 'x-second' | 'x-third'> => {
          return new HeadersSubset({
            'x-first': 'first-value',
            'x-second': 'second-value',
            'x-third': 'third-value',
          });
        }),
        testRoute: mion.route((): string => 'ok'),
      });

      const request = getDefaultRequest('testRoute', []);

      const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.headers.get('x-first')).toEqual('first-value');
      expect(response.headers.get('x-second')).toEqual('second-value');
      expect(response.headers.get('x-third')).toEqual('third-value');
    });

    it('should handle overwriting headers set by multiple middlewares', async () => {
      const shared = {data: 'test'};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        firstMiddleware: mion.middleware((ctx): HeadersSubset<'X-Custom'> => {
          return new HeadersSubset({'X-Custom': 'first-value'});
        }),
        secondMiddleware: mion.middleware((ctx): HeadersSubset<'X-Custom'> => {
          return new HeadersSubset({'X-Custom': 'second-value'});
        }),
        testRoute: mion.route((): string => 'ok'),
      });

      const request = getDefaultRequest('testRoute', []);

      const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      // The last middleware to set the header should win
      expect(response.headers.get('x-custom')).toEqual('second-value');
    });

    it('should handle unicode characters in header values', async () => {
      const shared = {auth: {token: null as any}};
      const getSharedData = (): typeof shared => shared;

      createMionRouter({contextDataFactory: getSharedData}).initRoutes({
        auth: mion.headersMiddleware((ctx, h: HeadersSubset<'Authorization'>): void => {
          const token = h.headers.Authorization;
          ctx.shared.auth.token = token;
        }),
        getUser: mion.route((ctx): string => `Token: ${ctx.shared.auth.token}`),
      });

      const request = getDefaultRequest('getUser', [], {
        Authorization: 'Bearer 🔐-token-🎯',
      });

      const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBeFalsy();
      expect(response.body.getUser).toEqual('Token: Bearer 🔐-token-🎯');
    });
  });
});

describe('security: header records are own-key only', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    "has('%s') is false and get returns undefined on a request that never sent it",
    (name) => {
      const headers = headersFromRecord({'content-type': 'application/json'});
      expect(headers.has(name)).toBe(false);
      expect(headers.get(name)).toBeUndefined();
      // the node adapter hands over the platform's plain object without lowercasing
      const passthrough = headersFromRecord({'content-type': 'application/json'}, true);
      expect(passthrough.has(name)).toBe(false);
      expect(passthrough.get(name)).toBeUndefined();
    }
  );

  it('a header literally named constructor is a string, not a function', () => {
    const headers = headersFromRecord({constructor: 'sent'});
    expect(headers.get('constructor')).toBe('sent');
    expect(headers.has('constructor')).toBe(true);
  });

  it('setting __proto__ never swaps the prototype of the record', () => {
    const record: Record<string, string> = {};
    const headers = headersFromRecord(record, true);
    headers.set('__proto__', 'x');
    headers.append('__proto__', 'y');
    expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
    expect(headers.get('__proto__')).toBeUndefined();
    expect(({} as any).x).toBeUndefined();
  });
});

describe('response headers', () => {
  const DEFAULTS = {server: 'mionjs', 'x-team': 'mion', 'content-type': JSON_CONTENT_TYPE};
  const reply = (contentType = JSON_CONTENT_TYPE) => ({statusCode: 200, contentType, body: {}}) as MionResponse;
  beforeEach(() => resetRouter());

  it('stay unused after the defaults are filled in, and any write turns that off', () => {
    for (const write of ['set', 'append', 'delete'] as const) {
      for (const headers of [new FetchResponseHeaders(DEFAULTS), new RecordResponseHeaders(DEFAULTS)]) {
        expect(headers.unused).toBe(true);
        expect(headers.get('x-team')).toBe('mion');
        if (write === 'delete') headers.delete('x-team');
        else headers[write]('x-custom', 'yes');
        expect(headers.unused).toBe(false);
      }
    }
  });

  it('stay unused after reads, and never write into the defaults', () => {
    const defaults = {...DEFAULTS};
    const headers = new RecordResponseHeaders(defaults);
    headers.get('server');
    headers.has('x-team');
    expect([...headers.entries()].length).toBe(3);
    expect(headers.unused).toBe(true);
    headers.set('x-team', 'other');
    expect(defaults['x-team']).toBe('mion');
  });

  it('refuse a CR, LF or NUL in a name or value, as fetch Headers does, without echoing the value', () => {
    for (const headers of [new FetchResponseHeaders(DEFAULTS), new RecordResponseHeaders(DEFAULTS)]) {
      for (const write of ['set', 'append'] as const) {
        expect(() => headers[write]('x-a', 'ok\r\nx-injected: 1')).toThrow(TypeError);
        expect(() => headers[write]('x-a\nx-b', 'ok')).toThrow(TypeError);
        expect(() => headers[write]('x-a', 'ok\0')).toThrow(TypeError);
      }
      expect(headers.get('x-injected')).toBeFalsy();
    }
    expect(() => new RecordResponseHeaders(DEFAULTS).set('x-a', 'secret\r\n')).not.toThrow(/secret/);
  });

  it('refuse a bad responseHeaders default when the router starts', () => {
    expect(() => createMionRouter({responseHeaders: {'x-bad': 'a\r\nb'}}).initRoutes({})).toThrow(TypeError);
  });

  it('go back to the pool for the next request only while unused', () => {
    const first = getDefaultHeaders();
    releaseHeaders(first);
    expect(getDefaultHeaders()).toBe(first);
    first.set('x-custom', 'yes');
    releaseHeaders(first);
    expect(getDefaultHeaders()).not.toBe(first);
  });

  it('keep no more than 256 in the pool', () => {
    const taken = Array.from({length: 257}, getDefaultHeaders);
    taken.forEach(releaseHeaders);
    const again = Array.from({length: 257}, getDefaultHeaders);
    expect(again.filter((headers) => taken.includes(headers)).length).toBe(256);
  });

  it('are dropped from the pool once the router starts with other headers', () => {
    const old = getDefaultHeaders();
    releaseHeaders(old);
    const mion = createMionRouter({apiVersionCheck: false, responseHeaders: {'x-team': 'mion'}});
    mion.initRoutes({ping: mion.route((): string => 'pong')});
    const fresh = getDefaultHeaders();
    expect(fresh).not.toBe(old);
    expect(fresh.get('x-team')).toBe('mion');
  });

  it('get content-type in the fetch reply only once written to, or when it is not the JSON one', () => {
    const unused = getDefaultFetchHeaders();
    replyFetch(reply(), unused);
    expect(unused.unused).toBe(true);

    const written = getDefaultFetchHeaders();
    written.set('content-type', 'text/html');
    expect(replyFetch(reply(), written).headers.get('content-type')).toBe(JSON_CONTENT_TYPE);

    const other = getDefaultFetchHeaders();
    expect(replyFetch(reply('text/plain'), other).headers.get('content-type')).toBe('text/plain');
    expect(other.unused).toBe(false);
  });

  it('serve the next fetch request clean: Response copies the ones it is given', () => {
    const first = getDefaultFetchHeaders();
    replyFetch(reply(), first).headers.set('x-leak', 'yes');
    const second = getDefaultFetchHeaders();
    expect(second).toBe(first);
    expect(second.has('x-leak')).toBe(false);
  });

  const written = (headers: RecordResponseHeaders) => {
    const lines: [string, string | string[]][] = [];
    headers.forEach((name, value) => lines.push([name, value]));
    return lines;
  };

  it('keep the values of a name appended twice apart on a record, and read them joined', () => {
    const headers = new RecordResponseHeaders({});
    headers.append('Set-Cookie', 'a=1');
    headers.append('set-cookie', 'b=2');
    headers.append('set-cookie', 'c=3');
    headers.append('x-a', '1');
    expect(written(headers)).toEqual([
      ['set-cookie', ['a=1', 'b=2', 'c=3']],
      ['x-a', '1'],
    ]);
    expect(headers.get('set-cookie')).toBe('a=1, b=2, c=3');
    expect([...headers.entries()]).toEqual([
      ['set-cookie', 'a=1, b=2, c=3'],
      ['x-a', '1'],
    ]);
    expect([...headers.values()]).toEqual(['a=1, b=2, c=3', '1']);
  });

  it('take an empty earlier value on a record as absent', () => {
    const headers = new RecordResponseHeaders({'x-a': ''});
    headers.append('x-a', '1');
    expect(written(headers)).toEqual([['x-a', '1']]);
  });

  it('append to a name like an Object.prototype member as if it were new', () => {
    const headers = new RecordResponseHeaders({});
    expect(headers.has('constructor')).toBe(false);
    headers.append('constructor', 'a');
    expect(headers.get('constructor')).toBe('a');
  });

  it('keep two appended set-cookie values apart on fetch, and throw on a CR or LF like Headers', () => {
    const headers = new FetchResponseHeaders(DEFAULTS);
    headers.append('set-cookie', 'a=1');
    headers.append('set-cookie', 'b=2');
    expect(headers.native.getSetCookie()).toEqual(['a=1', 'b=2']);
    expect(() => headers.set('x-bad', 'one\r\ntwo')).toThrow(TypeError);
  });
});
