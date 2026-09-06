/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * The three ways a handler can answer with an error, measured against the dispatcher:
 *
 * | what you write             | where it lands            | chain      |
 * | -------------------------- | ------------------------- | ---------- |
 * | `return new RpcError(...)` | `body[id]` (typed)        | continues  |
 * | `return new FatalError()`  | `body[id]` (typed)        | HALTS      |
 * | `throw` anything           | `@thrownErrors` (untyped) | HALTS      |
 * | `return` a non-mion Error  | `@thrownErrors` (untyped) | HALTS      |
 *
 * A halt skips every later executable except the `alwaysRun` ones, sets the error header, the
 * status code, `hasErrors` and `response.fatalError` (the first halting error, thrown or returned).
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import type {CallContext, MionHeaders} from './types/context.ts';
import type {Routes} from './types/general.ts';
import {HeadersSubset, RpcError, FatalError, MION_ROUTES, StatusCodes, isFatalError} from '@mionjs/core';
import {headersFromRecord} from './lib/headers.ts';

const mion = createMionRouter();

type RawRequest = {headers: MionHeaders; body: string};

/** a union return travels as its `[index, value]` envelope once serialized */
const unwrap = (value: unknown): RpcError<string> => (Array.isArray(value) ? value[1] : value) as RpcError<string>;
const unwrapValue = (value: unknown): unknown => (Array.isArray(value) ? value[1] : value);

describe('fatal dispatch', () => {
  const ran: string[] = [];
  let seenFatal: RpcError<string> | undefined;

  const request = (body: Record<string, any[]>, headers: Record<string, string> = {}): RawRequest => ({
    headers: headersFromRecord(headers),
    body: JSON.stringify(body),
  });
  const dispatch = (path: string, req: RawRequest) => dispatchRoute(path, req.body, req.headers, headersFromRecord({}), req, {});

  const declared = () => new RpcError({publicMessage: 'declared', type: 'declared-error'});
  const fatal = () => new FatalError({publicMessage: 'Not Authorized', type: 'not-authorized', statusCode: 401});

  const routes = {
    // mode picks how the FIRST middleFn answers: 'return' | 'fatal' | 'throw' | 'ok'
    first: mion.middleFn((_ctx: CallContext, mode: string): void | RpcError<'declared-error' | 'not-authorized'> => {
      ran.push('first');
      if (mode === 'return') return declared();
      if (mode === 'fatal') return fatal();
      if (mode === 'throw') throw new RpcError({publicMessage: 'thrown', type: 'thrown-error'});
    }),
    gate: mion.headersFn(
      (_ctx: CallContext, h: HeadersSubset<'X-Mode'>): void | RpcError<'declared-error' | 'not-authorized'> => {
        ran.push('gate');
        if (h.headers['X-Mode'] === 'return') return declared();
        if (h.headers['X-Mode'] === 'fatal') return fatal();
      }
    ),
    target: mion.route((_ctx: CallContext, mode: string): string | RpcError<'declared-error' | 'not-authorized'> => {
      ran.push('target');
      if (mode === 'return') return declared();
      if (mode === 'fatal') return fatal();
      return 'ran';
    }),
    after: mion.middleFn((_ctx: CallContext): void => {
      ran.push('after');
    }),
    always: mion.middleFn(
      (ctx: CallContext): void => {
        ran.push('always');
        seenFatal = ctx.response.fatalError;
      },
      {alwaysRun: true}
    ),
  } satisfies Routes;

  beforeEach(() => {
    resetRouter();
    ran.length = 0;
    seenFatal = undefined;
    mion.initRoutes(routes);
  });

  describe('a plain returned RpcError', () => {
    it('from a middleFn keeps the chain running and halts nothing', async () => {
      const response = await dispatch('/target', request({first: ['return'], target: ['ok']}, {'X-Mode': 'ok'}));
      expect(ran).toEqual(['first', 'gate', 'target', 'after', 'always']);
      expect(response.hasErrors).toBe(false);
      expect(response.fatalError).toBeUndefined();
      expect(response.statusCode).toBe(StatusCodes.OK);
      expect(response.headers.get('x-rpc-error')).toBeFalsy();
      expect(unwrap(response.body.first).type).toBe('declared-error');
      expect(unwrapValue(response.body.target)).toBe('ran');
      expect(response.body[MION_ROUTES.thrownErrors]).toBeUndefined();
    });

    it('from a headersFn keeps the chain running', async () => {
      const response = await dispatch('/target', request({first: ['ok'], target: ['ok']}, {'X-Mode': 'return'}));
      expect(ran).toEqual(['first', 'gate', 'target', 'after', 'always']);
      expect(response.hasErrors).toBe(false);
      expect(unwrap(response.body.gate).type).toBe('declared-error');
      expect(unwrapValue(response.body.target)).toBe('ran');
    });

    it('from a route keeps the chain running', async () => {
      const response = await dispatch('/target', request({first: ['ok'], target: ['return']}, {'X-Mode': 'ok'}));
      expect(ran).toEqual(['first', 'gate', 'target', 'after', 'always']);
      expect(response.hasErrors).toBe(false);
      expect(unwrap(response.body.target).type).toBe('declared-error');
    });
  });

  describe('a returned FatalError', () => {
    it('from a middleFn halts the chain and stays in its own typed slot', async () => {
      const response = await dispatch('/target', request({first: ['fatal'], target: ['ok']}, {'X-Mode': 'ok'}));
      expect(ran).toEqual(['first', 'always']);
      expect(response.hasErrors).toBe(true);
      expect(response.statusCode).toBe(401);
      expect(response.headers.get('x-rpc-error')).toBe('not-authorized');
      expect(response.body.target).toBeUndefined();
      expect(response.body[MION_ROUTES.thrownErrors]).toBeUndefined();
      const error = unwrap(response.body.first);
      expect(error.type).toBe('not-authorized');
      expect(response.fatalError).toBe(seenFatal);
      expect(seenFatal?.type).toBe('not-authorized');
      expect(isFatalError(seenFatal)).toBe(true);
    });

    it('from a headersFn halts the chain', async () => {
      const response = await dispatch('/target', request({first: ['ok'], target: ['ok']}, {'X-Mode': 'fatal'}));
      expect(ran).toEqual(['first', 'gate', 'always']);
      expect(response.hasErrors).toBe(true);
      expect(unwrap(response.body.gate).type).toBe('not-authorized');
      expect(response.body.target).toBeUndefined();
      expect(response.body[MION_ROUTES.thrownErrors]).toBeUndefined();
    });

    it('from a route halts what comes after the route', async () => {
      const response = await dispatch('/target', request({first: ['ok'], target: ['fatal']}, {'X-Mode': 'ok'}));
      expect(ran).toEqual(['first', 'gate', 'target', 'always']);
      expect(response.hasErrors).toBe(true);
      expect(unwrap(response.body.target).type).toBe('not-authorized');
      expect(response.body[MION_ROUTES.thrownErrors]).toBeUndefined();
    });

    it('without a statusCode answers 400, a declared application error, never 422', async () => {
      resetRouter();
      mion.initRoutes({
        gate: mion.middleFn((): void | RpcError<'gate-closed'> => new FatalError({publicMessage: 'closed', type: 'gate-closed'})),
        target: routes.target,
      });
      const response = await dispatch('/target', request({gate: [], target: ['ok']}));
      expect(response.hasErrors).toBe(true);
      expect(response.statusCode).toBe(StatusCodes.APPLICATION_ERROR);
      expect(unwrap(response.body.gate).type).toBe('gate-closed');
    });

    it('with a statusCode answers that code', async () => {
      const response = await dispatch('/target', request({first: ['fatal'], target: ['ok']}, {'X-Mode': 'ok'}));
      expect(response.statusCode).toBe(401);
    });

    it('never carries the brand on the wire', async () => {
      const response = await dispatch('/target', request({first: ['fatal'], target: ['ok']}, {'X-Mode': 'ok'}));
      // the default json mode prepares the body in place and the adapter stringifies it
      const wire = JSON.stringify(response.body);
      expect(wire).not.toContain('isFatal');
      expect(unwrap(JSON.parse(wire).first)).toEqual({
        'mion@isΣrrθr': true,
        type: 'not-authorized',
        publicMessage: 'Not Authorized',
        statusCode: 401,
      });
    });
  });

  describe('a thrown error', () => {
    it('halts the chain, lands in @thrownErrors and is branded fatal', async () => {
      const response = await dispatch('/target', request({first: ['throw'], target: ['ok']}, {'X-Mode': 'ok'}));
      expect(ran).toEqual(['first', 'always']);
      expect(response.hasErrors).toBe(true);
      // thrown without a statusCode: unexpected, so 422
      expect(response.statusCode).toBe(StatusCodes.UNEXPECTED_ERROR);
      expect(response.headers.get('x-rpc-error')).toBe('thrown-error');
      expect(response.body.first).toBeUndefined();
      expect(response.body.target).toBeUndefined();
      const thrown = response.body[MION_ROUTES.thrownErrors] as Record<string, RpcError<string>>;
      expect(thrown.first.type).toBe('thrown-error');
      // a thrown plain RpcError is stamped, without becoming a FatalError
      expect(isFatalError(thrown.first)).toBe(true);
      expect(thrown.first instanceof FatalError).toBe(false);
      expect(response.fatalError).toBe(thrown.first);
      expect(seenFatal).toBe(thrown.first);
    });

    it('the first halting error wins fatalError, later alwaysRun failures do not replace it', async () => {
      resetRouter();
      mion.initRoutes({
        first: routes.first,
        target: routes.target,
        failingAlways: mion.middleFn(
          (_ctx: CallContext): void => {
            throw new Error('cleanup failed');
          },
          {alwaysRun: true}
        ),
      });
      const response = await dispatch('/target', request({first: ['fatal'], target: ['ok']}));
      expect(response.fatalError?.type).toBe('not-authorized');
      expect(response.headers.get('x-rpc-error')).toBe('not-authorized');
      const thrown = response.body[MION_ROUTES.thrownErrors] as Record<string, RpcError<string>>;
      expect(thrown.failingAlways.type).toBe('unknown-error');
      expect(thrown.failingAlways instanceof FatalError).toBe(true);
    });
  });

  // An Error with no mion brand can never be an RpcError, so it has no typed slot to land in.
  // Before this it fell through to `response.body[id]` and was served as a SUCCESSFUL answer.
  describe('a returned Error mion cannot represent', () => {
    it('halts and lands in @thrownErrors instead of being served as data', async () => {
      resetRouter();
      mion.initRoutes({
        broken: mion.middleFn((): void => {
          return new Error('not a mion error') as unknown as void;
        }),
        target: routes.target,
        always: routes.always,
      });
      const response = await dispatch('/target', request({target: ['ok']}));

      expect(ran).toEqual(['always']);
      expect(response.hasErrors).toBe(true);
      expect(response.body.broken).toBeUndefined(); // never served as data
      expect(response.body.target).toBeUndefined();
      const thrown = response.body[MION_ROUTES.thrownErrors] as Record<string, RpcError<string>>;
      expect(thrown.broken).toBeDefined();
      expect(isFatalError(thrown.broken)).toBe(true);
      expect(response.fatalError).toBe(thrown.broken);
    });
  });

  describe('a raw middleFn', () => {
    it('cannot declare a return type, so a returned error halts as an undeclared one', async () => {
      resetRouter();
      mion.initRoutes({
        raw: mion.rawMiddleFn((): RpcError<string> => new RpcError({publicMessage: 'raw', type: 'raw-error'})),
        target: routes.target,
        always: routes.always,
      });
      const response = await dispatch('/target', request({target: ['ok']}));
      expect(ran).toEqual(['always']);
      expect(response.hasErrors).toBe(true);
      expect(response.body.raw).toBeUndefined();
      const thrown = response.body[MION_ROUTES.thrownErrors] as Record<string, RpcError<string>>;
      expect(thrown.raw.type).toBe('raw-error');
      expect(isFatalError(thrown.raw)).toBe(true);
      expect(response.fatalError).toBe(thrown.raw);
    });
  });
});
