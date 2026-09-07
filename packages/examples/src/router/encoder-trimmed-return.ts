import {createMionRouter, Routes} from '@mionjs/router';

// A wide row, the way a database table comes back.
export interface DbUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  passwordHash: string;
  internalNotes: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginIp: string;
  marketingSegment: string;
}

declare const db: {users: {byId: (id: string) => DbUser}};

// The public shape of that row: three of its ten columns.
export type PublicUser = Pick<DbUser, 'id' | 'name' | 'avatarUrl'>;

const mion = createMionRouter({basePath: 'api'});

export const routes = {
  // start-trimmed
  // The handler reads the whole row and returns it. The RETURN TYPE says PublicUser, and the
  // default `clone` encoder builds the payload from that type, so only id, name and avatarUrl
  // reach the wire. The password hash and the internal notes never leave the process.
  getUser: mion.route((ctx, id: string): PublicUser => db.users.byId(id)),
  // end-trimmed

  // start-mutate
  // `mutate` skips the copy and rewrites the value in place, which is faster and allocates
  // nothing. It also sends the object AS IS, so the whole row would go out here. Use it when the
  // handler builds the exact response object and throws it away afterwards.
  getUserFast: mion.route(
    (ctx, id: string): PublicUser => {
      const row = db.users.byId(id);
      return {id: row.id, name: row.name, avatarUrl: row.avatarUrl};
    },
    {encoder: 'mutate'}
  ),
  // end-mutate
} satisfies Routes;
