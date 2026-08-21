import {initClient} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// this request will fail if it takes longer than 5 seconds
const [result, error, unexpected] = await routes.users.sayHello({id: '1', name: 'John', surname: 'Doe'}).call({timeout: 5000});

// transport failures are never part of the route's typed error union: they land in the
// unexpected slot, which is an open RpcError<string>
if (unexpected?.type === 'request-timeout') {
    console.log('Request took too long');
}
