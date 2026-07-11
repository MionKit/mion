import {initClient} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// create an AbortController for this request
const controller = new AbortController();

// pass the signal via call setup
const resultPromise = routes.users.sayHello({id: '1', name: 'John', surname: 'Doe'}).call({signal: controller.signal});

// cancel the request (e.g. on component unmount or user action)
controller.abort();

const [result, error] = await resultPromise;
// error.type === 'request-aborted'
