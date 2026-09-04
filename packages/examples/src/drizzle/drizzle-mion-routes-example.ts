// The same derived types drive a mion API. Routes typed with User, NewUser and
// UserPatch get everything from the types alone: payloads are validated before
// the handler runs (refined bounds included), Dates survive the JSON wire in
// both directions, and the client is fully typed. No schemas, no serializers,
// no per-route wiring to write.
import {RpcError} from '@mionjs/core';
import {initMionRouter, route} from '@mionjs/router';
import type {NewUser, User, UserPatch} from './drizzle-refine-example.ts';

const usersStore = new Map<string, User>();

export const usersApi = await initMionRouter({
  users: {
    // the NewUser payload is validated before this runs; id and createdAt are
    // optional (the table declares defaults), so the handler fills them
    insert: route((_ctx, user: NewUser): User => {
      const row: User = {
        id: user.id ?? crypto.randomUUID(),
        name: user.name,
        age: user.age,
        createdAt: user.createdAt ?? new Date(),
      };
      usersStore.set(row.id, row);
      return row;
    }),

    // createdAt arrives on the client as a real Date, revived by the
    // serializer generated from the User type
    select: route((_ctx, id: string): User | RpcError<'user-not-found'> => {
      return (
        usersStore.get(id) ??
        new RpcError({publicMessage: 'User not found', type: 'user-not-found'})
      );
    }),

    // UserPatch is a real partial: any subset is accepted, and a present key
    // still validates (a too-short name is rejected before the handler)
    update: route(
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

// The client initializes from this type and gets typed calls + revived Dates.
export type UsersApi = typeof usersApi;
