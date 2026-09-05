/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Deliberately WRONG routes. `strong-typed-routes` must flag both of them:
//  - `noReturnType` has no return type annotation  -> missingReturnType
//  - `untypedParam` has an untyped parameter       -> missingParamTypes
// The rule is purely syntactic (it reads the @mionjs/router import list and follows
// the `mion` the createMionRouter call returns), so this file never has to typecheck —
// which is the point: the TRANSPORT is under test, not the diagnostics. A silent pass
// here means @mionjs/devtools/eslint loaded but registered nothing.
import {createMionRouter} from '@mionjs/router';

const mion = createMionRouter();

export const routes = {
  noReturnType: mion.route((_ctx, name: string) => `hello ${name}`),
  untypedParam: mion.route((_ctx, name): string => `hello ${name}`),
};
