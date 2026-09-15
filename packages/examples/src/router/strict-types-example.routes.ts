import {createMionRouter, Routes} from '@mionjs/router';

interface User {
  name: string;
  email: string;
  age: number;
}

// Enable strictTypes globally: a param with unknown/extra properties is rejected.
// It applies to mutate and direct routes; clone and compact drop unknown keys while decoding.
const mion = createMionRouter({strictTypes: true});

// Or enable strictTypes per-route
const routes = {
  // this route rejects objects with extra properties: mutate hands the check what arrived
  createUser: mion.route((ctx, user: User): User => user, {
    strictTypes: true,
    encoder: {params: 'mutate'},
  }),
  // this route accepts objects with extra properties
  updateUser: mion.route((ctx, user: Partial<User>): Partial<User> => user, {
    strictTypes: false,
  }),
} satisfies Routes;

mion.initRoutes(routes);
