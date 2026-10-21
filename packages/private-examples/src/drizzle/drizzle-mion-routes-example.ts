import {RpcError} from '@mionjs/core';
import {createMionRouter} from '@mionjs/router';
import type {NewUser, User, UserPatch} from './drizzle-refine-example.ts';

const mion = createMionRouter();

const usersStore = new Map<string, User>();

export const usersApi = mion.initRoutes({
  users: {
    // id and createdAt are optional (table defaults), so the handler fills them
    insert: mion.route((_ctx, user: NewUser): User => {
      const row: User = {
        id: user.id ?? crypto.randomUUID(),
        name: user.name,
        age: user.age,
        createdAt: user.createdAt ?? new Date(),
      };
      usersStore.set(row.id, row);
      return row;
    }),

    // createdAt arrives on the client as a real Date
    select: mion.route(
      (_ctx, id: string): User | RpcError<'user-not-found'> => {
        return (
          usersStore.get(id) ??
          new RpcError({
            publicMessage: 'User not found',
            type: 'user-not-found',
          })
        );
      }
    ),

    // any subset is accepted, but a too-short name is still rejected
    update: mion.route(
      (
        _ctx,
        id: string,
        patch: UserPatch
      ): User | RpcError<'user-not-found'> => {
        const existing = usersStore.get(id);
        if (!existing)
          return new RpcError({
            publicMessage: 'User not found',
            type: 'user-not-found',
          });
        const next: User = {...existing, ...patch};
        usersStore.set(id, next);
        return next;
      }
    ),
  },
});

// the client's types come from this
export type UsersApi = typeof usersApi;
