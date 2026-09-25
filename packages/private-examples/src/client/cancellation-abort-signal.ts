import {initClient} from '@mionjs/client';
import type {MyApi} from './hello.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const controller = new AbortController();

const resultPromise = routes.sayHello('John').call({signal: controller.signal});

// e.g. on component unmount or a user action
controller.abort();

const [greeting, , undeclared] = await resultPromise;
if (undeclared?.type === 'request-aborted') console.log('Request was canceled');
else console.log(greeting);
