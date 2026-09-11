/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Per-route request limits. Every route resolves ONE number: its own option, else the maximum a
// valid body can reach given the params types of its whole chain (times the factor), else the
// platform adapter's `maxBodySize`. `resolveRequest` hands it to the adapter BEFORE the body is
// read, from the same lookup that finds the chain.

import {describe, it, expect, beforeEach} from 'vitest';
import * as TF from '@mionjs/run-types/formats';
import {createMionRouter, resetRouter, getRouteExecutable, getRouteExecutionChain, setPlatformConfig} from './router.ts';
import {dispatchRoute, dispatchResolved} from './dispatch.ts';
import {resolveRequest} from './callContext.ts';
import {headersFromRecord} from './lib/headers.ts';
import {getSerializableMethod} from './lib/remoteMethods.ts';
import {DEFAULT_ROUTE_OPTIONS} from './constants.ts';
import {DEFAULT_MAX_BODY_SIZE, MION_ROUTES, RpcError, StatusCodes} from '@mionjs/core';

const mion = createMionRouter();

interface Item {
  id: TF.String<{maxLength: 36}>;
  qty: number;
}

// what the build computes for the params tuples below (6 bytes per string unit, 24 per number)
const ITEM_BYTES = 1 + 5 + (2 + 6 * 36) + 1 + 6 + 24 + 1; // {"id":…,"qty":…}
const PAGE_BYTES = 2 + 3 * ITEM_BYTES + 2; // [ 3 items ]
const BOUNDED_PARAMS_BYTES = 2 + (2 + 6 * 36) + 1 + PAGE_BYTES; // [orderId, items]
// the metadata middleFn sits in every chain and declares a fixed contribution
const METADATA_SLOT = JSON.stringify(MION_ROUTES.methodsMetadata).length + 1 + 4096;

/** The keyed body `{"<route>":<params>,"<metadata>":<ids>}` at its largest, times the factor. */
function derivedLimit(routeId: string, paramsBytes: number): number {
  const envelope = 2 + (JSON.stringify(routeId).length + 1 + paramsBytes) + 1 + METADATA_SLOT;
  return Math.ceil(envelope * DEFAULT_ROUTE_OPTIONS.maxBodySizeFactor);
}

function dispatch(path: string, body: string) {
  const reqHeaders = headersFromRecord({});
  return dispatchRoute(path, body, reqHeaders, headersFromRecord({}), {headers: reqHeaders, body}, {});
}

function thrownErrors(response: Awaited<ReturnType<typeof dispatch>>): Record<string, RpcError<string>> {
  return response.body[MION_ROUTES.thrownErrors] as Record<string, RpcError<string>>;
}

describe('per-route request limits', () => {
  const bounded = mion.route((ctx, orderId: TF.String<{maxLength: 36}>, items: TF.List<Item, 3>): number => items.length);
  const loose = mion.route((ctx, text: string): string => text);
  const overridden = mion.route((ctx, text: string): string => text, {maxBodySize: 100});
  const gate = mion.middleFn((ctx, tags: string[]): void => undefined);
  const declaredGate = mion.middleFn((ctx, tags: string[]): void => undefined, {maxBodySize: 100});

  beforeEach(() => resetRouter());

  it('a route whose params are all bounded derives its limit from the types', () => {
    mion.initRoutes({bounded});
    const route = getRouteExecutable('bounded')!;
    expect(route.paramsJsonMaxBytes).toBe(BOUNDED_PARAMS_BYTES);
    const limit = derivedLimit('bounded', BOUNDED_PARAMS_BYTES);
    expect(getRouteExecutionChain('/bounded')!.maxBodySize).toBe(limit);
    // the resolved number is what the route publishes
    expect(route.options.maxBodySize).toBe(limit);
    expect(getSerializableMethod(route).options.maxBodySize).toBe(limit);
    expect(resolveRequest('/bounded', undefined, {}).maxBodySize).toBe(limit);
  });

  it('a body at the derived limit passes and one byte over is refused before parsing', async () => {
    mion.initRoutes({bounded});
    const limit = getRouteExecutionChain('/bounded')!.maxBodySize!;
    const valid = JSON.stringify({bounded: ['order-1', [{id: 'a', qty: 1}]]});
    const atLimit = valid + ' '.repeat(limit - valid.length);
    expect(atLimit.length).toBe(limit);
    const passed = await dispatch('/bounded', atLimit);
    expect(passed.hasErrors).toBe(false);
    expect(passed.body.bounded).toBe(1);

    const refused = await dispatch('/bounded', atLimit + ' ');
    expect(refused.statusCode).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
    expect(thrownErrors(refused)['mionDeserializeRequest'].type).toBe('request-payload-too-large');
    expect(refused.body.bounded).toBeUndefined();
  });

  it("a route whose params have no maximum takes the platform adapter's number", async () => {
    mion.initRoutes({loose});
    expect(getRouteExecutable('loose')!.paramsJsonMaxBytes).toBeUndefined();
    // nothing settled at registration: the number is the platform's, read when the request resolves
    expect(getRouteExecutionChain('/loose')!.maxBodySize).toBeUndefined();
    // no adapter published anything (a router driven directly): the shared default
    expect(resolveRequest('/loose', undefined, {}).maxBodySize).toBe(DEFAULT_MAX_BODY_SIZE);
    expect(DEFAULT_MAX_BODY_SIZE).toBe(128_000);
    // the metadata publishes the number the server really applies
    expect(getSerializableMethod(getRouteExecutable('loose')!).options.maxBodySize).toBe(DEFAULT_MAX_BODY_SIZE);
    // an adapter publishes its own: that is the number from then on
    setPlatformConfig({maxBodySize: 100});
    expect(resolveRequest('/loose', undefined, {}).maxBodySize).toBe(100);
    const refused = await dispatch('/loose', '{"loose":["' + 'x'.repeat(100) + '"]}');
    expect(refused.statusCode).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
  });

  it("the route option wins over the derived number and over the platform adapter's number", () => {
    mion.initRoutes({
      overridden,
      bounded: mion.route((ctx, n: number): number => n, {maxBodySize: 7}),
    });
    // a platform number SMALLER than the route option never lowers it: the route said so on purpose
    setPlatformConfig({maxBodySize: 50});
    expect(getRouteExecutionChain('/overridden')!.maxBodySize).toBe(100);
    expect(resolveRequest('/overridden', undefined, {}).maxBodySize).toBe(100);
    expect(getRouteExecutionChain('/bounded')!.maxBodySize).toBe(7);
    expect(getRouteExecutable('bounded')!.options.maxBodySize).toBe(7);
  });

  it("a derived number is never clamped by the platform adapter's number either", () => {
    mion.initRoutes({bounded});
    const limit = derivedLimit('bounded', BOUNDED_PARAMS_BYTES);
    setPlatformConfig({maxBodySize: 50});
    expect(resolveRequest('/bounded', undefined, {}).maxBodySize).toBe(limit);
  });

  it('a middleFn with unbounded params sends the chain to the platform number unless it declares its contribution', () => {
    mion.initRoutes({gate, bounded});
    expect(getRouteExecutionChain('/bounded')!.maxBodySize).toBeUndefined();
    expect(resolveRequest('/bounded', undefined, {}).maxBodySize).toBe(DEFAULT_MAX_BODY_SIZE);
    resetRouter();
    mion.initRoutes({declaredGate, bounded});
    const envelope =
      2 +
      (JSON.stringify('declaredGate').length + 1 + 100) +
      1 +
      (JSON.stringify('bounded').length + 1 + BOUNDED_PARAMS_BYTES) +
      1 +
      METADATA_SLOT;
    expect(getRouteExecutionChain('/bounded')!.maxBodySize).toBe(Math.ceil(envelope * DEFAULT_ROUTE_OPTIONS.maxBodySizeFactor));
  });

  it("an unknown path resolves to the not-found chain with the platform adapter's number", () => {
    mion.initRoutes({bounded});
    setPlatformConfig({maxBodySize: 4_000});
    const resolved = resolveRequest('/nope', undefined, {});
    expect(resolved.maxBodySize).toBe(4_000);
    expect(resolved.executionChain.methods[resolved.executionChain.routeIndex].id).toBe(MION_ROUTES.notFound);
  });

  it('resolveRequest + dispatchResolved is the same request as dispatchRoute, resolved once', async () => {
    mion.initRoutes({bounded});
    const body = JSON.stringify({
      bounded: [
        'order-1',
        [
          {id: 'a', qty: 1},
          {id: 'b', qty: 2},
        ],
      ],
    });
    const reqHeaders = headersFromRecord({});
    const rawRequest = {headers: reqHeaders, body};
    const resolved = resolveRequest('/bounded', undefined, rawRequest);
    expect(resolved.path).toBe('/bounded');
    const viaResolved = await dispatchResolved(resolved, body, reqHeaders, headersFromRecord({}), rawRequest, {});
    const viaPath = await dispatch('/bounded', body);
    expect(viaResolved.body).toEqual(viaPath.body);
    expect(viaResolved.body.bounded).toBe(2);
  });
});

describe("the platform's own request ceiling", () => {
  const loose = mion.route((ctx, text: string): string => text);
  const big = mion.route((ctx, text: string): string => text, {maxBodySize: 9_000});
  const bounded = mion.route((ctx, items: TF.List<TF.String<{maxLength: 36}>, 1000>): number => items.length);

  beforeEach(() => resetRouter());

  it("the adapter's maxBodySize never passes the ceiling", () => {
    mion.initRoutes({loose});
    setPlatformConfig({maxBodySize: 10_000, maxBodySizeCap: 5_000});
    expect(resolveRequest('/loose', undefined, {}).maxBodySize).toBe(5_000);
    expect(getSerializableMethod(getRouteExecutable('loose')!).options.maxBodySize).toBe(5_000);
  });

  it('a route option and a derived limit above the ceiling are brought down to it', () => {
    mion.initRoutes({big, bounded});
    const derived = getRouteExecutionChain('/bounded')!.maxBodySize!;
    expect(derived).toBeGreaterThan(5_000);
    // the adapter publishes after the routes are registered (node, uws)
    setPlatformConfig({maxBodySize: 1_000, maxBodySizeCap: 5_000});
    expect(getRouteExecutionChain('/big')!.maxBodySize).toBe(5_000);
    expect(getRouteExecutable('big')!.options.maxBodySize).toBe(5_000);
    expect(getRouteExecutionChain('/bounded')!.maxBodySize).toBe(5_000);
    expect(resolveRequest('/bounded', undefined, {}).maxBodySize).toBe(5_000);
  });

  it('the order does not matter: an adapter that publishes before the routes are registered', () => {
    setPlatformConfig({maxBodySize: 1_000, maxBodySizeCap: 5_000});
    mion.initRoutes({big});
    expect(getRouteExecutionChain('/big')!.maxBodySize).toBe(5_000);
  });

  it('a ceiling above everything changes nothing, and no ceiling means none', () => {
    mion.initRoutes({big});
    setPlatformConfig({maxBodySize: 1_000, maxBodySizeCap: 100_000});
    expect(getRouteExecutionChain('/big')!.maxBodySize).toBe(9_000);
    setPlatformConfig({maxBodySize: 1_000});
    expect(getRouteExecutionChain('/big')!.maxBodySize).toBe(9_000);
    expect(resolveRequest('/loose-missing', undefined, {}).maxBodySize).toBe(1_000);
  });
});
