import {createMionRouter, Routes} from '@mionjs/router';

interface User {
  name: string;
  email: string;
  age: number;
}

// Enable strictTypes globally: rejects objects with unknown/extra properties
const mion = createMionRouter({strictTypes: true});

// Or enable strictTypes per-route
const routes = {
  // this route rejects objects with extra properties
  createUser: mion.route((ctx, user: User): User => user, {strictTypes: true}),
  // this route accepts objects with extra properties
  updateUser: mion.route((ctx, user: Partial<User>): Partial<User> => user, {
    strictTypes: false,
  }),
} satisfies Routes;

mion.initRoutes(routes);
