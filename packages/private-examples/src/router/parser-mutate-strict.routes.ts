import {createMionRouter, Routes} from '@mionjs/router';

interface User {
  name: string;
  email: string;
  age: number;
}

// every route on this router rejects params carrying a property the type does not declare
const mion = createMionRouter({parser: {params: 'mutateStrict'}} as const);

const routes = {
  // inherits mutateStrict from the router
  createUser: mion.route((ctx, user: User): User => user),
  // this route drops the extra property instead of refusing the request
  updateUser: mion.route((ctx, user: Partial<User>): Partial<User> => user, {
    parser: {params: 'clone'},
  }),
} satisfies Routes;

mion.initRoutes(routes);
