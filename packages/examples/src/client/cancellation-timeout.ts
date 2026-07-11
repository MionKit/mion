import {initClient} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// this request will fail if it takes longer than 5 seconds
const [result, error] = await routes.users.sayHello({id: '1', name: 'John', surname: 'Doe'}).call({timeout: 5000});

if (error?.type === 'request-timeout') {
    console.log('Request took too long');
}
