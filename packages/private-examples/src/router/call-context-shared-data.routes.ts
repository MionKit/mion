import {customMionRouter, Routes} from '@mionjs/router';
import {getSessionUser, type AuthUser} from './myAuth.ts';

type Shared = {me: AuthUser | null};

// `shared` types ctx.shared; the factory must return it
const mion = customMionRouter<{shared: Shared}>()({
  contextDataFactory: () => ({me: null}),
});

const routes = {
  auth: mion.middleware(async (ctx): Promise<void> => {
    const cookie = ctx.request.headers.get('cookie');
    ctx.shared.me = (await getSessionUser(cookie)) ?? null;
  }),
  sayHello: mion.route((ctx): string => `Hello ${ctx.shared.me?.name}`), // written by auth above
} satisfies Routes;

export const api = mion.initRoutes(routes);
