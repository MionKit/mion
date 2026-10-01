import {createMionRouter, Routes} from '@mionjs/router';
import {getAuthUser, type AuthUser} from './myAuth.ts';

// without this return type, `me` would be typed as only `null`
const newSharedData = (): {me: AuthUser | null} => ({me: null});

const mion = createMionRouter({contextDataFactory: newSharedData});

const routes = {
  auth: mion.middleware(async (ctx, token: string): Promise<void> => {
    ctx.shared.me = (await getAuthUser(token)) ?? null;
  }),
  sayHello: mion.route((ctx): string => `Hello ${ctx.shared.me?.name}`), // written by auth above
} satisfies Routes;

export const api = mion.initRoutes(routes);
