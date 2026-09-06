/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Deliberately WRONG routes. Two rules must flag them:
//  - `noReturnType` has no return type annotation  -> strong-typed-routes / missingReturnType
//  - `untypedParam` has an untyped parameter       -> strong-typed-routes / missingParamTypes
//  - `throwsInstead` throws instead of returning    -> no-throw-in-handlers / noThrow
// The rule is purely syntactic (it reads the @mionjs/router import list and follows
// the `mion` the createMionRouter call returns), so this file never has to typecheck —
// which is the point: the TRANSPORT is under test, not the diagnostics. A silent pass
// here means @mionjs/devtools/eslint loaded but registered nothing.
import {createMionRouter} from '@mionjs/router';

const mion = createMionRouter();

export const routes = {
  noReturnType: mion.route((_ctx, name: string) => `hello ${name}`),
  untypedParam: mion.route((_ctx, name): string => `hello ${name}`),
  throwsInstead: mion.route((_ctx, name: string): string => {
    throw new Error(`no hello for ${name}`);
  }),
};
