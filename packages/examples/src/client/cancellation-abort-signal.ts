import {initClient} from '@mionjs/client';
import type {HelloApi} from './hello.routes.ts';

const {routes} = initClient<HelloApi>({baseURL: 'http://localhost:3000'});

// create an AbortController for this request
const controller = new AbortController();

// pass the signal via call setup
const resultPromise = routes.sayHello('John').call({signal: controller.signal});

// cancel the request (e.g. on component unmount or user action)
controller.abort();

const [greeting, , fatal] = await resultPromise;
if (fatal?.type === 'request-aborted') console.log('Request was canceled');
else console.log(greeting);
