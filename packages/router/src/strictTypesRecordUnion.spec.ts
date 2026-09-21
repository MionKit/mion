// `strictTypes` composes two checks: validate, then the pooled unknown-key check. On a union carrying a
// Record member the pooled check answers false for every value, and on the stripping strategies it is not
// compiled at all, since the decoder was trusted to have dropped the key already. It does not drop it:
// a record member declares every key, so the decoder keeps the whole object.
//
// The result is a `strictTypes` route that checks nothing on such a param. These tests pin that, so the
// assertions flip in the same commit as the fix.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import {MION_ROUTES} from '@mionjs/core';
import type {MionHeaders} from './types/context.ts';

const shared = {auth: {me: null as any}};
const getSharedData = (): typeof shared => shared;

type ObjectOrNumbers = {a: string} | Record<string, number>;

function requestFor(routeId: string, params: unknown[]): {headers: MionHeaders; body: string} {
  return {headers: headersFromRecord({}), body: JSON.stringify({[routeId]: params})};
}

async function callRoute(routeId: string, params: unknown[]) {
  const request = requestFor(routeId, params);
  const response = await dispatchRoute(`/${routeId}`, request.body, request.headers, headersFromRecord({}), request, {});
  return {response, error: response.body[MION_ROUTES.thrownErrors]?.[routeId]};
}

describe('strictTypes on a param whose type is a union with a Record member', () => {
  beforeEach(() => resetRouter());

  it('lets an undeclared key through on the default (clone) strategy', async () => {
    let received: unknown;
    const mion = createMionRouter({contextDataFactory: getSharedData, strictTypes: true});
    const echo = mion.route((ctx, thing: ObjectOrNumbers): string => {
      received = thing;
      return 'ok';
    });
    mion.initRoutes({echo});

    const {error} = await callRoute('echo', [{a: 'x', evil: 'garbage'}]);
    // No member of the union describes this value, and `validate({checkUnknowns: true})` refuses it.
    expect(error, 'strictTypes raises no error').toBeUndefined();
    expect(received, 'the handler receives the undeclared key').toEqual({a: 'x', evil: 'garbage'});
  });

  it('lets an undeclared key through on the mutate strategy', async () => {
    let received: unknown;
    const mion = createMionRouter({contextDataFactory: getSharedData, strictTypes: true});
    const echo = mion.route(
      (ctx, thing: ObjectOrNumbers): string => {
        received = thing;
        return 'ok';
      },
      {serializer: {params: 'mutate'}}
    );
    mion.initRoutes({echo});

    const {error} = await callRoute('echo', [{a: 'x', evil: 'garbage'}]);
    expect(error, 'strictTypes raises no error').toBeUndefined();
    expect(received, 'the handler receives the undeclared key').toEqual({a: 'x', evil: 'garbage'});
  });

  it('still rejects a value matching no member', async () => {
    const mion = createMionRouter({contextDataFactory: getSharedData, strictTypes: true});
    const echo = mion.route((ctx, thing: ObjectOrNumbers): string => 'ok');
    mion.initRoutes({echo});

    const {error} = await callRoute('echo', [{zzz: 'garbage'}]);
    expect(error).toMatchObject({type: 'validation-error'});
  });

  it('CONTROL: the same payload against a plain object param is stripped before the handler', async () => {
    let received: unknown;
    const mion = createMionRouter({contextDataFactory: getSharedData, strictTypes: true});
    const echo = mion.route((ctx, thing: {a: string}): string => {
      received = thing;
      return 'ok';
    });
    mion.initRoutes({echo});

    const {error} = await callRoute('echo', [{a: 'x', evil: 'garbage'}]);
    expect(error).toBeUndefined();
    expect(received, 'the decoder dropped the key').toEqual({a: 'x'});
  });

  it('CONTROL: a union with no Record member is stripped before the handler', async () => {
    let received: unknown;
    const mion = createMionRouter({contextDataFactory: getSharedData, strictTypes: true});
    const echo = mion.route((ctx, thing: {a: string} | {b: number}): string => {
      received = thing;
      return 'ok';
    });
    mion.initRoutes({echo});

    const {error} = await callRoute('echo', [{a: 'x', evil: 'garbage'}]);
    expect(error).toBeUndefined();
    expect(received, 'the decoder dropped the key').toEqual({a: 'x'});
  });
});
