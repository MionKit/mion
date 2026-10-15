/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// routes.ts on the compact wire (objects travel as arrays of values, no key names), served by the mion.compact lane.
import {Routes, createMionRouter} from '@mionjs/router';
import {hello, updateSimpleUser, updateUser} from './handlers.ts';

// `alwaysAwait: false` for the same reason as routes.ts: every handler here is sync.
const mion = createMionRouter({parser: 'compact', alwaysAwait: false});

const routes = {
  hello: mion.route(hello),
  updateUser: mion.route(updateUser),
  updateSimpleUser: mion.route(updateSimpleUser),
} satisfies Routes;

mion.initRoutes(routes);
