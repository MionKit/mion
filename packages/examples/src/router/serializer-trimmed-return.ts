import {createMionRouter, Routes} from '@mionjs/router';

// a wide row, the way a database table comes back
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

// the public shape of that row: three of its ten columns
export type PublicUser = Pick<DbUser, 'id' | 'name' | 'avatarUrl'>;

const mion = createMionRouter({basePath: 'api'});

export const routes = {
  // start-trimmed
  // returns the whole row, but the PublicUser return type decides what is sent
  getUser: mion.route((ctx, id: string): PublicUser => db.users.byId(id)),
  // end-trimmed

  // start-mutate
  // `mutate` sends the object as is, so this handler builds exactly what the type declares
  getUserFast: mion.route(
    (ctx, id: string): PublicUser => {
      const row = db.users.byId(id);
      return {id: row.id, name: row.name, avatarUrl: row.avatarUrl};
    },
    {serializer: 'mutate'}
  ),
  // end-mutate
} satisfies Routes;
