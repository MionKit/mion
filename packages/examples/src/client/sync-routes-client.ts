import {initClient} from '@mionjs/client';
import type {MyApi} from './sync-routes.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const [greeting, , undeclared] = await routes.sayHello('Ana').call();

// the route's types changed on the server since this app was built, and nothing ran there
if (undeclared?.type === 'route-types-mismatch') location.reload();
else console.log(greeting);
