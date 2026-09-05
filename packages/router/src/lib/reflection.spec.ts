/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {getHandlerReflection, MissingRtFnsError, RuntimeCodeGenBlockedError} from './reflection.ts';
import {RouterOptions} from '../types/general.ts';
import {AnyHandlerDef} from '../types/definitions.ts';
import {HandlerType} from '@mionjs/core';

describe('reflection error classification', () => {
  const routerOptions = {} as RouterOptions;

  /** Route definition whose marker payload blows up the way the given runtime would. */
  const failingDef = (message: string): AnyHandlerDef =>
    ({
      type: HandlerType.route,
      handler: () => undefined,
      get rtFns(): never {
        throw new Error(message);
      },
    }) as unknown as AnyHandlerDef;

  it('reports a blocked `new Function` as a build-config problem, naming emitMode', async () => {
    // workerd's wording; Vercel's EdgeVM and a CSP without 'unsafe-eval' say the same thing.
    const def = failingDef('Code generation from strings disallowed for this context');
    expect(() => getHandlerReflection(def as never, 'myRoute', routerOptions)).toThrow(RuntimeCodeGenBlockedError);
    expect(() => getHandlerReflection(def as never, 'myRoute', routerOptions)).toThrow(/emitMode: 'both'/);
  });

  it('reports anything else as a missing marker payload', async () => {
    const def = failingDef('rtFns is not defined');
    expect(() => getHandlerReflection(def as never, 'myRoute', routerOptions)).toThrow(MissingRtFnsError);
  });
});
