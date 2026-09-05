// The same routes as drizzle-mion-routes-example.ts, fed by the types-road
// table: because both roads infer identical models with the same runtype id,
// the routes file only changes its import. Payloads are validated before the
// handler runs (refined bounds included), Dates survive the JSON wire in both
// directions, and the client is fully typed.
import {RpcError} from '@mionjs/core';
import {createMionRouter} from '@mionjs/router';
import type {NewUser, User, UserPatch} from './drizzle-types-refine-example.ts';

const mion = createMionRouter();

const usersStore = new Map<string, User>();

export const usersApi = mion.initRoutes({
  users: {
    // the NewUser payload is validated before this runs; id and createdAt are
    // optional (the table declares defaults), so the handler fills them
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

    // createdAt arrives on the client as a real Date, revived by the
    // serializer generated from the User type
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

    // UserPatch is a real partial: any subset is accepted, and a present key
    // still validates (a too-short name is rejected before the handler)
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

// The client initializes from this type and gets typed calls + revived Dates.
export type UsersApi = typeof usersApi;
