/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Deliberately WRONG routes, one per rpc-handler-* error. The file must resolve: the plugin runs the published resolver
// over the project tsconfig (which includes lint/), so a silent pass means it registered nothing or never reached it.
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
