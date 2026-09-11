import {
  createMionRouter,
  addStartMiddleFns,
  addEndMiddleFns,
} from '@mionjs/router';

const mion = createMionRouter();

// a global start middleFn runs on EVERY request, an unknown path included: the place for a
// rate limiter or an access log that must see the requests that name no route
const rateLimit = mion.rawMiddleFn((ctx): void => {
  console.log('incoming', ctx.path);
});

// a global end middleFn with alwaysRun sees every answer, the 404 of an unknown path included
const accessLog = mion.rawMiddleFn(
  (ctx): void => {
    console.log(ctx.path, ctx.response.statusCode);
  },
  {alwaysRun: true}
);

// registered BEFORE initRoutes: they are added to every chain the router builds
addStartMiddleFns({rateLimit});
addEndMiddleFns({accessLog});

const sayHello = mion.route((ctx, name: string): string => `Hello ${name}`);

// a middleFn declared here belongs to the routes next to it and never runs on an unknown path
const auth = mion.middleFn((ctx, token: string): void => {
  if (token !== 'secret') throw new Error('unauthorized');
});

mion.initRoutes({auth, sayHello});
