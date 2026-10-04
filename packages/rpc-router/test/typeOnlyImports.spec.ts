/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Type-only route imports are safe because reflection uses the build-time program, not runtime import metadata.

import {describe, it, expect, beforeEach} from 'vitest';
import type {ProbeUser, ProbeCount} from './typeOnlyImports.models.ts';
import {createMionRouter, resetRouter, getRouteExecutable} from '../src/router.ts';
import {dispatchRoute} from '../src/dispatch.ts';
import {headersFromRecord} from '../src/lib/headers.ts';

describe('type-only imports still produce reflection', () => {
  /** Built next to the reset: a router created where the file is evaluated trips the once-guard. */
  function declareRoutes() {
    const mion = createMionRouter();
    const greet = mion.route((ctx, user: ProbeUser, count: ProbeCount): string => {
      return `hello ${user.name} ${user.surname} x${count.times}`;
    });

    const echoUser = mion.route((ctx, user: ProbeUser): ProbeUser => user);

    return {mion, greet, echoUser};
  }
  let app: ReturnType<typeof declareRoutes>;

  const dispatch = (id: string, params: unknown[]) => {
    const headers = headersFromRecord({});
    const body = JSON.stringify({[id]: params});
    return dispatchRoute(`/${id}`, body, headers, headersFromRecord({}), {headers, body}, {});
  };

  beforeEach(() => {
    resetRouter();
    app = declareRoutes();
  });

  it('reflects params declared with type-only-imported types', async () => {
    app.mion.initRoutes({greet: app.greet});
    const executable = getRouteExecutable('greet');
    expect(executable?.paramsCount).toEqual(2);
    expect(executable?.paramNames).toEqual(['user', 'count']);
    expect(typeof executable?.paramsJitFns.isType.fn).toBe('function');
    expect(executable?.paramsJitFns.isType.isNoop).toBe(false);
  });

  it('validates against a type-only-imported type', async () => {
    app.mion.initRoutes({greet: app.greet});

    const ok = await dispatch('greet', [{name: 'Leo', surname: 'Tungsten', birth: new Date(0)}, {times: 2}]);
    expect(ok.hasErrors).toBeFalsy();
    expect(ok.body.greet).toEqual('hello Leo Tungsten x2');

    // the erased import must NOT mean "anything goes": a wrong type still fails validation
    const bad = await dispatch('greet', [{name: 42, surname: 'Tungsten', birth: new Date(0)}, {times: 2}]);
    expect(bad.hasErrors).toBe(true);
  });

  it('serializes a type-only-imported return type, reviving Date', async () => {
    app.mion.initRoutes({echoUser: app.echoUser});

    const birthIso = '1990-05-04T00:00:00.000Z';
    const response = await dispatch('echoUser', [{name: 'Ann', surname: 'Beta', birth: birthIso}]);
    expect(response.hasErrors).toBeFalsy();
    // the params decoder revived the Date for the handler; the body then holds the encoder's
    // JSON-ready projection of what the handler returned
    expect(response.body.echoUser).toEqual({name: 'Ann', surname: 'Beta', birth: birthIso});
  });
});
