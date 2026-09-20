/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A server route using a pattern format must still reject bad input with NO value import of
// `@mionjs/run-types/formats`: the build injects the pure fn into the generated cache module.
// Without that, an unregistered format silently accepts everything, so the valid case is here too.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from '../router.ts';
import {dispatchRoute} from '../dispatch.ts';
import {CallContext, MionHeaders} from '../types/context.ts';
import {Routes} from '../types/general.ts';
import {MION_ROUTES} from '@mionjs/core';
import {headersFromRecord} from './headers.ts';
import type {UUIDv4} from '@mionjs/run-types/formats';

const mion = createMionRouter();

type UuidRoutes = {
  echoUuid: ReturnType<typeof mion.route<(ctx: CallContext, id: UUIDv4) => string>>;
} & Routes;

const VALID_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('format pure fns without a formats value import', () => {
  beforeEach(() => resetRouter());

  const dispatchUuid = (uuid: string) => {
    const echoUuid = mion.route((_ctx, id: UUIDv4): string => id);
    const routes: UuidRoutes = {echoUuid};
    mion.initRoutes(routes);
    const headers: MionHeaders = headersFromRecord({});
    const body = JSON.stringify({echoUuid: [uuid]});
    return dispatchRoute('/echoUuid', body, headers, headersFromRecord({}), {headers, body}, {});
  };

  it('rejects a value the format does not match', async () => {
    const response = await dispatchUuid('not-a-uuid');
    expect(response.body[MION_ROUTES.thrownErrors]?.echoUuid?.type).toBe('validation-error');
  });

  it('accepts a value the format matches', async () => {
    const response = await dispatchUuid(VALID_UUID);
    expect(response.body[MION_ROUTES.thrownErrors]?.echoUuid).toBeUndefined();
    expect(response.body.echoUuid).toBe(VALID_UUID);
  });
});
