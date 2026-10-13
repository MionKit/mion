/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The route handlers, shared by the plain JSON router (routes.ts) and the compact one (routes-compact.ts),
// so the two lanes differ only in the wire they speak.
//
// Regular imports only - `import type` would erase User before the resolver sees it.
import type {CallContext} from '@mionjs/router';
import {SimpleUser, User} from '../../shared/models.ts';

export const hello = (): {hello: string} => ({hello: 'world'});

export const updateUser = (ctx: CallContext, user: User): User => {
  user.updatedAt = new Date();
  user.lastLoginAt = new Date();
  user.profile.displayName = `${user.profile.firstName} ${user.profile.lastName.charAt(0)}.`;
  return user;
};

export const updateSimpleUser = (ctx: CallContext, user: SimpleUser): SimpleUser => {
  user.lastUpdate = new Date();
  return user;
};
