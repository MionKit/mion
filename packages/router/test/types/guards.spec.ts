/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, getRouteExecutable, resetRouter} from '../../src/router.ts';
import {isExecutable, isRoutes} from '../../src/types/guards.ts';
import {type Routes} from '../../src/types/general.ts';

describe('router guards', () => {
  beforeEach(() => resetRouter());

  it('isExecutable accepts a compiled route', () => {
    const mion = createMionRouter();
    mion.initRoutes({sayHello: mion.route((): string => 'hello')} satisfies Routes);
    expect(isExecutable(getRouteExecutable('sayHello')!)).toBe(true);
  });

  it('isExecutable rejects a routes group wrapper', () => {
    expect(isExecutable({pathPointer: ['users'], routes: {}} as any)).toBe(false);
  });

  it('isExecutable requires a handler even when routes is the string "undefined"', () => {
    expect(isExecutable({id: 'fake', routes: 'undefined'} as any)).toBe(false);
  });

  it('isRoutes accepts objects only', () => {
    expect(isRoutes({} as any)).toBe(true);
    expect(isRoutes((() => null) as any)).toBe(false);
  });
});
