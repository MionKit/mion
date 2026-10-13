/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The same routes as routes.ts on the compact wire: every object travels as an array of its
// values, no key names. The mion.compact lane serves these, so JSON vs compact is one router option.
import {Routes, createMionRouter} from '@mionjs/router';
import {hello, updateSimpleUser, updateUser} from './handlers.ts';

const mion = createMionRouter({parser: 'compact'});

const routes = {
  hello: mion.route(hello),
  updateUser: mion.route(updateUser),
  updateSimpleUser: mion.route(updateSimpleUser),
} satisfies Routes;

mion.initRoutes(routes);
