import {createMionRouter, Routes} from '@mionjs/router';
import {getSessionUser, type AuthUser} from './myAuth.ts';

// its written return type is the type of ctx.shared (an inferred one would be only `null`)
const newSharedData = (): {me: AuthUser | null} => ({me: null});

const mion = createMionRouter({sharedDataFactory: newSharedData});

const routes = {
  auth: mion.middleware(async (ctx): Promise<void> => {
    const cookie = ctx.request.headers.get('cookie');
    ctx.shared.me = (await getSessionUser(cookie)) ?? null;
  }),
  sayHello: mion.route((ctx): string => `Hello ${ctx.shared.me?.name}`), // written by auth above
} satisfies Routes;

export const api = mion.initRoutes(routes);
