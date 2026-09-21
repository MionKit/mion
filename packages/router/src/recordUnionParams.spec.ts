// A union carrying a Record member is the shape no decoder can clean: a record declares every key, so the stripping
// strategies keep the whole object and the pooled unknown-key check answers false. Only a validator following the branch
// that matched can refuse it; these routes are the end-to-end proof, from wire to handler.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import {MION_ROUTES} from '@mionjs/core';
import type {MionHeaders} from './types/context.ts';

const shared = {auth: {me: null as any}};
const getSharedData = (): typeof shared => shared;

type ObjectOrNumbers = {a: string} | Record<string, number>;
type ObjectOrStrings = {a: string} | Record<string, string>;
type ObjectOrNumber = {a: string} | number;

function requestFor(routeId: string, params: unknown[]): {headers: MionHeaders; body: string} {
  return {headers: headersFromRecord({}), body: JSON.stringify({[routeId]: params})};
}

async function callRoute(routeId: string, params: unknown[]) {
  const request = requestFor(routeId, params);
  const response = await dispatchRoute(`/${routeId}`, request.body, request.headers, headersFromRecord({}), request, {});
  return {response, error: response.body[MION_ROUTES.thrownErrors]?.[routeId]};
}

describe('a param whose type is a union with a Record member', () => {
  beforeEach(() => resetRouter());

  it('refuses an undeclared key on the default (clone) strategy', async () => {
    let received: unknown;
    const mion = createMionRouter({contextDataFactory: getSharedData});
    const echo = mion.route((ctx, thing: ObjectOrNumbers): string => {
      received = thing;
      return 'ok';
    });
    mion.initRoutes({echo});

    const {error} = await callRoute('echo', [{a: 'x', evil: 'garbage'}]);
    expect(error).toMatchObject({type: 'validation-error'});
    expect(received, 'the handler was never called').toBeUndefined();
  });

  it('refuses it on the compact strategy too', async () => {
    const mion = createMionRouter({contextDataFactory: getSharedData});
    const echo = mion.route((ctx, thing: ObjectOrNumbers): string => 'ok', {parser: 'compact'});
    mion.initRoutes({echo});

    const {error} = await callRoute('echo', [{a: 'x', evil: 'garbage'}]);
    expect(error).toMatchObject({type: 'validation-error'});
  });

  it('refuses it on mutateStrict, which keeps every key it was sent', async () => {
    const mion = createMionRouter({contextDataFactory: getSharedData});
    const echo = mion.route((ctx, thing: ObjectOrNumbers): string => 'ok', {parser: {params: 'mutateStrict'}});
    mion.initRoutes({echo});

    const {error} = await callRoute('echo', [{a: 'x', evil: 'garbage'}]);
    expect(error).toMatchObject({type: 'validation-error'});
  });

  it('mutate is the permissive strategy and hands the key to the handler', async () => {
    let received: unknown;
    const mion = createMionRouter({contextDataFactory: getSharedData});
    const echo = mion.route(
      (ctx, thing: ObjectOrNumbers): string => {
        received = thing;
        return 'ok';
      },
      {parser: {params: 'mutate'}}
    );
    mion.initRoutes({echo});

    const {error} = await callRoute('echo', [{a: 'x', evil: 'garbage'}]);
    expect(error).toBeUndefined();
    expect(received).toEqual({a: 'x', evil: 'garbage'});
  });

  it('accepts the key when the value really is a record', async () => {
    let received: unknown;
    const mion = createMionRouter({contextDataFactory: getSharedData});
    const echo = mion.route((ctx, thing: ObjectOrStrings): string => {
      received = thing;
      return 'ok';
    });
    mion.initRoutes({echo});

    // Every value is a string, so this IS a Record<string, string>; refusing it would be wrong.
    const {error} = await callRoute('echo', [{a: 'x', evil: 'garbage'}]);
    expect(error).toBeUndefined();
    expect(received).toEqual({a: 'x', evil: 'garbage'});
  });

  it('still rejects a value matching no member', async () => {
    const mion = createMionRouter({contextDataFactory: getSharedData});
    const echo = mion.route((ctx, thing: ObjectOrNumbers): string => 'ok');
    mion.initRoutes({echo});

    const {error} = await callRoute('echo', [{zzz: 'garbage'}]);
    expect(error).toMatchObject({type: 'validation-error'});
  });

  it('CONTROL: a plain object param is stripped before the handler', async () => {
    let received: unknown;
    const mion = createMionRouter({contextDataFactory: getSharedData});
    const echo = mion.route((ctx, thing: {a: string}): string => {
      received = thing;
      return 'ok';
    });
    mion.initRoutes({echo});

    const {error} = await callRoute('echo', [{a: 'x', evil: 'garbage'}]);
    expect(error).toBeUndefined();
    expect(received, 'the decoder dropped the key').toEqual({a: 'x'});
  });

  it('CONTROL: one key-bearing member means no union check, so the decoder still does the work', async () => {
    let received: unknown;
    const mion = createMionRouter({contextDataFactory: getSharedData});
    const echo = mion.route((ctx, thing: ObjectOrNumber): string => {
      received = thing;
      return 'ok';
    });
    mion.initRoutes({echo});

    const {error} = await callRoute('echo', [{a: 'x', evil: 'garbage'}]);
    expect(error).toBeUndefined();
    expect(received, 'the decoder dropped the key').toEqual({a: 'x'});
  });
});
