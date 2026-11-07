import {
  createMionRouter,
  Routes,
  type MionSecurityHandlerOptions,
} from '@mionjs/router';
import {mionSecurity} from '@mionjs/router/middlewares';
import {HeadersSubset} from '@mionjs/core';

type AuditHandlerOptions = {audit?: 'log' | 'skip'};

// every handler now takes the keys of both middlewares
const mion = createMionRouter.withTypes<{
  handler: MionSecurityHandlerOptions & AuditHandlerOptions;
}>()();

const routes = {
  security: mionSecurity({origins: ['https://app.example.com'], cors: {}}),
  audit: mion.middleware((ctx): void => {
    // the route's options hold the added key
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
