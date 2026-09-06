/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Deliberately WRONG routes. Three rules must flag them:
//  - `noReturnType` has no return type annotation  -> strong-typed-routes  [MRT001]
//  - `untypedParam` has an untyped parameter       -> strong-typed-routes  [MRT002]
//  - `throwsInstead` throws instead of returning   -> no-throw-in-handlers [MRT003]
//  - `plainError` answers with a bare Error        -> returned-error-type  [MRT004]
// The rules are compiler-fed, so this file DOES have to resolve: the plugin runs
// the published resolver binary over the project tsconfig (which includes
// lint/), and that is exactly what is under test here — the TRANSPORT plus the
// resolver path a consumer install takes. A silent pass means
// @mionjs/devtools/eslint loaded but registered nothing, or never reached the
// binary.
import {createMionRouter} from '@mionjs/router';

const mion = createMionRouter();

export const routes = {
  noReturnType: mion.route((_ctx, name: string) => `hello ${name}`),
  untypedParam: mion.route((_ctx, name): string => `hello ${name}`),
  throwsInstead: mion.route((_ctx, name: string): string => {
    throw new Error(`no hello for ${name}`);
  }),
  plainError: mion.route((_ctx, name: string): string | Error => new Error(name)),
};
