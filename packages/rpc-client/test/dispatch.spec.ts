/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {RpcError} from '@mionjs/core';
import {routeSucceeded} from '../src/dispatch.ts';
import type {ClientCallContext, RequestErrors} from '../src/types.ts';

describe('routeSucceeded', () => {
  const context = {subRequestList: {}} as unknown as ClientCallContext;
  const errorsOf = (type: string): RequestErrors => new Map([['save', new RpcError({type, publicMessage: type})]]);

  it('counts a route whose handler ran as succeeded, so a mutation is never resent', () => {
    expect(routeSucceeded(context, 'save', errorsOf('response-validation-error'))).toBe(true);
    expect(routeSucceeded(context, 'save', errorsOf('headers-validation-error'))).toBe(true);
  });

  it('counts any other error as failed', () => {
    expect(routeSucceeded(context, 'save', errorsOf('validation-error'))).toBe(false);
  });
});
