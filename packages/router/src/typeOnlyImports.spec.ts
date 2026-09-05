/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Guards the post-deepkit reality: `import type` is SAFE for types used in routes.
//
// Under deepkit, reflection was emitted from the import statement, so `import type` erased the
// metadata and silently broke validation — the reason mion shipped the `@mionjs/no-type-imports`
// ESLint rule and CLAUDE.md's "TYPE IMPORTS !!CRITICAL!!" warning. Under RunTypes the resolver
// reads the TypeScript program at build time and injects at the route() call site, so an erased
// import changes nothing. The rule and the warning were deleted on the strength of this spec —
// if it ever fails, that deletion was wrong.

import {describe, it, expect, beforeEach} from 'vitest';
import type {ProbeUser, ProbeCount} from './typeOnlyImports.models.ts';
import {createMionRouter, resetRouter, getRouteExecutable} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';

const mion = createMionRouter({skipClientRoutes: true});

describe('type-only imports still produce reflection', () => {
  const greet = mion.route((ctx, user: ProbeUser, count: ProbeCount): string => {
    return `hello ${user.name} ${user.surname} x${count.times}`;
  });

  const echoUser = mion.route((ctx, user: ProbeUser): ProbeUser => user);

  const dispatch = (id: string, params: unknown[]) => {
    const headers = headersFromRecord({});
    const body = JSON.stringify({[id]: params});
    return dispatchRoute(`/${id}`, body, headers, headersFromRecord({}), {headers, body}, {});
  };

  beforeEach(() => resetRouter());

  it('reflects params declared with type-only-imported types', async () => {
    mion.initRoutes({greet});
    const executable = getRouteExecutable('greet');
    expect(executable?.paramsCount).toEqual(2);
    expect(executable?.paramNames).toEqual(['user', 'count']);
    expect(typeof executable?.paramsJitFns.isType.fn).toBe('function');
    expect(executable?.paramsJitFns.isType.isNoop).toBe(false);
  });

  it('validates against a type-only-imported type', async () => {
    mion.initRoutes({greet});

    const ok = await dispatch('greet', [{name: 'Leo', surname: 'Tungsten', birth: new Date(0)}, {times: 2}]);
    expect(ok.hasErrors).toBeFalsy();
    expect(ok.body.greet).toEqual('hello Leo Tungsten x2');

    // the erased import must NOT mean "anything goes": a wrong type still fails validation
    const bad = await dispatch('greet', [{name: 42, surname: 'Tungsten', birth: new Date(0)}, {times: 2}]);
    expect(bad.hasErrors).toBe(true);
  });

  it('serializes a type-only-imported return type, reviving Date', async () => {
    mion.initRoutes({echoUser});

    const birthIso = '1990-05-04T00:00:00.000Z';
    const response = await dispatch('echoUser', [{name: 'Ann', surname: 'Beta', birth: birthIso}]);
    expect(response.hasErrors).toBeFalsy();
    expect(response.body.echoUser).toEqual({name: 'Ann', surname: 'Beta', birth: new Date(birthIso)});
  });
});
