import {createMionRouter, Routes} from '@mionjs/router';

interface User {
  name: string;
  email: string;
  age: number;
}

// strictTypes on the router: every mutate route rejects params with extra properties
const mion = createMionRouter({strictTypes: true});

// or set it per route
const routes = {
  // this route rejects objects with extra properties: mutate hands the check what arrived
  createUser: mion.route((ctx, user: User): User => user, {
    strictTypes: true,
    serializer: {params: 'mutate'},
  }),
  // this route accepts objects with extra properties
  updateUser: mion.route((ctx, user: Partial<User>): Partial<User> => user, {
    strictTypes: false,
  }),
} satisfies Routes;

mion.initRoutes(routes);
