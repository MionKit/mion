import {
  createMionRouter,
  addStartMiddleFns,
  addEndMiddleFns,
} from '@mionjs/router';

const mion = createMionRouter();

// a request that arrived already failed (an unknown path, an unknown batch id, a body the server
// refused) runs ONLY the middleFns that declare alwaysRun, so a rate limiter that must see them
// declares it too
const rateLimit = mion.rawMiddleFn(
  (ctx): void => {
    console.log('incoming', ctx.path);
  },
  {alwaysRun: true}
);

// a global end middleFn with alwaysRun sees every answer, a 404 and a 413 included
const accessLog = mion.rawMiddleFn(
  (ctx): void => {
    console.log(ctx.path, ctx.response.statusCode);
  },
  {alwaysRun: true}
);

// without alwaysRun a global middleFn is skipped for a request that already failed: no session is
// loaded and no token is checked for a request that is going to be refused anyway
const loadSession = mion.rawMiddleFn((ctx): void => {
  console.log('loading the session for', ctx.path);
});

// registered BEFORE initRoutes: they are added to every chain the router builds
addStartMiddleFns({rateLimit, loadSession});
addEndMiddleFns({accessLog});

const sayHello = mion.route((ctx, name: string): string => `Hello ${name}`);

// a middleFn declared here belongs to the routes next to it and never runs on an unknown path
const auth = mion.middleFn((ctx, token: string): void => {
  if (token !== 'secret') throw new Error('unauthorized');
});

mion.initRoutes({auth, sayHello});
