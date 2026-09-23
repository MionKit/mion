import {
  createMionRouter,
  addStartMiddlewares,
  addEndMiddlewares,
} from '@mionjs/router';

const mion = createMionRouter();

// alwaysRun: a rate limiter must also see requests that already failed
const rateLimit = mion.rawMiddleware(
  (ctx): void => {
    console.log('incoming', ctx.path);
  },
  {alwaysRun: true}
);

// a global end middleware with alwaysRun sees every answer, a 404 and a 413 included
const accessLog = mion.rawMiddleware(
  (ctx): void => {
    console.log(ctx.path, ctx.response.statusCode);
  },
  {alwaysRun: true}
);

// no alwaysRun: no session is loaded and no token checked for a request refused anyway
const loadSession = mion.rawMiddleware((ctx): void => {
  console.log('loading the session for', ctx.path);
});

// registered BEFORE initRoutes: they are added to every chain the router builds
addStartMiddlewares({rateLimit, loadSession});
addEndMiddlewares({accessLog});

const sayHello = mion.route((ctx, name: string): string => `Hello ${name}`);

// declared beside the routes, so it never runs on either 404
const auth = mion.middleware((ctx, token: string): void => {
  if (token !== 'secret') throw new Error('unauthorized');
});

mion.initRoutes({auth, sayHello});
