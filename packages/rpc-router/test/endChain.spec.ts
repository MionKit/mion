/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from '../src/router.ts';
import {dispatchRoute} from '../src/dispatch.ts';
import {endChain} from '../src/lib/dispatchError.ts';
import type {CallContext, MionResponse} from '../src/types/context.ts';
import type {Routes} from '../src/types/general.ts';
import {FatalError, MION_ROUTES, StatusCodes} from '@mionjs/core';
import {headersFromRecord} from '../src/lib/headers.ts';

const mion = createMionRouter();

describe('endChain', () => {
  const ran: string[] = [];
  let seen: Pick<MionResponse, 'hasErrors' | 'stopped' | 'statusCode'> | undefined;

  const dispatch = (mode: string) =>
    dispatchRoute('/target', JSON.stringify({first: [mode], target: []}), headersFromRecord({}), headersFromRecord({}), {}, {});

  const routes = {
    // mode: 'end' ends with 200, 'end-202' with a code, 'fail' throws, 'ok' does nothing
    first: mion.middleware((ctx: CallContext, mode: string): void => {
      ran.push('first');
      if (mode === 'end') endChain(ctx);
      if (mode === 'end-202') endChain(ctx, 202);
      if (mode === 'fail') throw new FatalError({publicMessage: 'nope', type: 'not-authorized', statusCode: 401});
    }),
    target: mion.route((): string => {
      ran.push('target');
      return 'ran';
    }),
    // an alwaysRun member that tries to end a chain already failed
    endAfterFailure: mion.middleware(
      (ctx: CallContext): void => {
        if (ctx.response.hasErrors) endChain(ctx);
      },
      {alwaysRun: true}
    ),
    always: mion.middleware(
      (ctx: CallContext): void => {
        ran.push('always');
        const {hasErrors, stopped, statusCode} = ctx.response;
        seen = {hasErrors, stopped, statusCode};
      },
      {alwaysRun: true}
    ),
  } satisfies Routes;

  beforeEach(() => {
    resetRouter();
    ran.length = 0;
    seen = undefined;
    mion.initRoutes(routes);
  });

  it('skips every later member but the alwaysRun ones, and answers 200 with no error', async () => {
    const response = await dispatch('end');
    expect(ran).toEqual(['first', 'always']);
    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.hasErrors).toBe(false);
    expect(response.stopped).toBe(true);
    expect(response.fatalError).toBeUndefined();
    expect(response.headers.get('x-rpc-error')).toBeFalsy();
    expect(response.body).toEqual({});
    expect(seen).toEqual({hasErrors: false, stopped: true, statusCode: StatusCodes.OK});
  });

  it('answers the status code it is given', async () => {
    const response = await dispatch('end-202');
    expect(response.statusCode).toBe(202);
    expect(response.stopped).toBe(true);
  });

  it('changes nothing on a chain that already failed', async () => {
    const response = await dispatch('fail');
    expect(ran).toEqual(['first', 'always']);
    expect(response.statusCode).toBe(401);
    expect(response.hasErrors).toBe(true);
    // stopped by the error, so endChain had nothing left to do
    expect(response.stopped).toBe(true);
    expect(response.body[MION_ROUTES.thrownErrors]?.first?.type).toBe('not-authorized');
  });

  it('leaves a chain it never touched running to the route', async () => {
    const response = await dispatch('ok');
    expect(ran).toEqual(['first', 'target', 'always']);
    expect(response.stopped).toBe(false);
    expect(response.body.target).toBe('ran');
  });
});
