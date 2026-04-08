import {initClient} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';

// all requests timeout after 10 seconds unless overridden per-request
const {routes} = initClient<MyApi>({
    baseURL: 'http://localhost:3000',
    timeout: 10_000,
});

// uses the 10s default timeout
const [r1] = await routes.users.sayHello({id: '1', name: 'John', surname: 'Doe'}).call();

// overrides to 2s for this specific call
const [r2, err] = await routes.users.sayHello({id: '1', name: 'John', surname: 'Doe'}).call({timeout: 2000});
