import {initClient, type RouteSubRequest} from '@mionjs/client';
import type {MyApi} from './init.routes.ts';

// Nothing changes in the code: the build knows the lane, and each call carries what it needs.
const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// This route is bundled: the call names it, so its functions ship with the app.
const [user, error] = await routes.users.getById('u1').call();

// A helper keeps the route's name when it stays generic, so the build still sees which route it calls.
async function callWithRetry<S extends RouteSubRequest<any>>(
  sub: S,
  tries = 2
) {
  let last: Awaited<ReturnType<S['call']>> | undefined;
  for (let i = 0; i < tries; i++) {
    last = (await sub.call()) as Awaited<ReturnType<S['call']>>;
    if (!last[2]) break; // no undeclared error: done
  }
  return last!;
}

const [again] = await callWithRetry(routes.users.getById('u1'));

console.log(user, error, again);
