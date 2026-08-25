/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The routes every mion lane serves. The handler signatures ARE the schema: the
// build-time resolver reads `user: User` and compiles the validator, deserializer and
// serializer from it. Nothing here declares a schema, which is the difference the
// benchmark is measuring.
//
// Regular imports only - `import type` would erase User before the resolver sees it.
import {Routes, route} from '@mionjs/router';
import {SimpleUser, User} from '../../shared/models.ts';

export const routes = {
  hello: route((): {hello: string} => ({hello: 'world'})),

  updateUser: route((ctx, user: User): User => {
    user.updatedAt = new Date();
    user.lastLoginAt = new Date();
    user.profile.displayName = `${user.profile.firstName} ${user.profile.lastName.charAt(0)}.`;
    return user;
  }),

  updateSimpleUser: route((ctx, user: SimpleUser): SimpleUser => {
    user.lastUpdate = new Date();
    return user;
  }),
} satisfies Routes;

export type BenchApi = typeof routes;
