import {
  customMionRouter,
  Routes,
  type MionSecurityHandlerOptions,
} from '@mionjs/router';
import {mionSecurity} from '@mionjs/router/middlewares';
import {HeadersSubset} from '@mionjs/core';

type AuditHandlerOptions = {audit?: 'log' | 'skip'};

// once per app: every handler now takes the keys of both middlewares
export const createAppRouter = customMionRouter<{
  handler: MionSecurityHandlerOptions & AuditHandlerOptions;
}>();
const mion = createAppRouter();

const routes = {
  security: mionSecurity({origins: ['https://app.example.com'], cors: {}}),
  audit: mion.middleware((ctx): void => {
    // the added key sits on the options of the chain's route
    const route = ctx.executionChain.methods[ctx.executionChain.routeIndex];
    const options = route?.options as AuditHandlerOptions | undefined;
    if (options?.audit === 'log') console.log('audit', ctx.path);
  }),
  // cors: false keeps this header off the CORS lists
  rateLimit: mion.middleware(
    (): HeadersSubset<'x-ratelimit-remaining'> =>
      new HeadersSubset({'x-ratelimit-remaining': '99'}),
    {
      cors: false,
    }
  ),
  getUser: mion.route((ctx, id: number): string => `user ${id}`, {
    audit: 'log',
  }),
} satisfies Routes;

export const api = mion.initRoutes(routes);
