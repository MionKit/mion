/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, afterEach} from 'vitest';
import {MION_ROUTES} from '@mionjs/core';
import type {MethodWithOptsAndJitFns} from '@mionjs/core';
import {deserializeResponseBody} from '../../src/lib/serializer.ts';
import {resetBundledMethods, setBundledMethod} from '../../src/lib/methods.ts';
import {DEFAULT_CLIENT_OPTIONS} from '../../src/constants.ts';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}});
}

describe('deserializeResponseBody', () => {
  afterEach(() => resetBundledMethods());

  it('throws an answer it cannot decode by id, never leaving it as the method value', async () => {
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

    const body = await deserializeResponseBody(jsonResponse({stamp: {when: 'never'}}), DEFAULT_CLIENT_OPTIONS);

    expect('stamp' in body).toBe(false);
    const thrown = body[MION_ROUTES.thrownErrors]?.stamp;
    expect(thrown?.type).toBe('deserialization-error');
    expect(thrown?.publicMessage).toContain('not a stamp');
  });

  it('keeps a thrown-record key named __proto__ as a plain entry', async () => {
    const body = await deserializeResponseBody(
      jsonResponse({[MION_ROUTES.thrownErrors]: {['__proto__']: {type: 'boom', publicMessage: 'boom'}}}),
      DEFAULT_CLIENT_OPTIONS
    );

    const thrown = body[MION_ROUTES.thrownErrors] ?? {};
    expect(Object.keys(thrown)).toEqual(['__proto__']);
    expect(({} as any).type).toBeUndefined();
  });
});
