/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A route compiles the value-level JSON functions by name, so a JSON encoder / decoder override on its param type
// must not take them away.
import {describe, it, expect, beforeEach} from 'vitest';
import {overrideJsonEncoder, overrideJsonDecoder} from '@mionjs/run-types';
import {createMionRouter, resetRouter, getRouteExecutable} from '../src/router.ts';
import {dispatchRoute} from '../src/dispatch.ts';
import {headersFromRecord} from '../src/lib/headers.ts';

interface Stamp {
  readonly __brand: 'routeJsonOverride';
  id: bigint;
  at: Date;
}
overrideJsonEncoder<Stamp>((v) => 'OVR' + (v as Stamp).id.toString());
overrideJsonDecoder<Stamp>((s) => ({id: BigInt((s as string).slice(3)), at: new Date(0)}) as never);

const stamp = (): Stamp => ({__brand: 'routeJsonOverride', id: 7n, at: new Date('2020-01-02T03:04:05.000Z')});

const mion = createMionRouter();
resetRouter();

const dispatchJson = (routeId: string, params: unknown[]) => {
  const request = {headers: headersFromRecord({}), body: JSON.stringify({[routeId]: params})};
  return dispatchRoute(`/${routeId}`, request.body, request.headers, headersFromRecord({}), request, {});
};

describe('a route whose param type overrides the JSON encoder and decoder', () => {
  beforeEach(() => resetRouter());

  const echoClone = mion.route((ctx, s: Stamp): Stamp => ({...s, id: s.id + 1n}));
  const echoMutate = mion.route((ctx, s: Stamp): Stamp => ({...s, id: s.id + 1n}), {parser: 'mutate'});
  const echoCompact = mion.route((ctx, s: Stamp): Stamp => ({...s, id: s.id + 1n}), {parser: 'compact'});

  for (const [id, route] of [
    ['echoClone', echoClone],
    ['echoMutate', echoMutate],
    ['echoCompact', echoCompact],
  ] as const) {
    it(`${id}: params restore and the return encodes through the structural functions`, async () => {
      mion.initRoutes({[id]: route});
      const exec = getRouteExecutable(id)!;
      const wire = JSON.parse(JSON.stringify(exec.paramsJitFns.json.encode.fn([stamp()])));
      const response = await dispatchJson(id, wire);
      expect(response.hasErrors).toBe(false);
      const decoded = exec.returnJitFns.json.decode.fn(JSON.parse(JSON.stringify(response.body[id])));
      expect(decoded).toEqual({...stamp(), id: 8n});
    });
  }
});
