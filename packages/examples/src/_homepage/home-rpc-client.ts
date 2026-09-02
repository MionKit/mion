// @errors: 2345
// @noErrors: 1003
import {initClient} from '@mionjs/client';
import type {MyApi} from './home-rpc-server.ts';

const {routes} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});
// @annotate: Remote routes are called like local async functions, fully typed

const [user, error] = await routes.getUser(1234).call();
//                                 ^|

if (user) {
  user.createdAt;
  //         ^?

  // @annotate: Native classes like Set come back as real values

  user.tags;
  //    ^?
}

// Type error: id must be a number
// @ts-expect-error -- shown on purpose; the assertion fails the build if this ever stops erroring
routes.getUser('1234').call();
