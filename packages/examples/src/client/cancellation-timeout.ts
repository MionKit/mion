import {initClient} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// this request will fail if it takes longer than 5 seconds
const [result, error] = await routes.users.sayHello({id: '1', name: 'John', surname: 'Doe'}).call({timeout: 5000});

// NOTE the cast: the client raises transport failures ('request-timeout', 'request-aborted', ...)
// as RpcError at runtime, but the statically declared error union only carries the handler's own
// errors plus ValidationError, so `error.type` does not include them yet.
// See docs/todos/client-transport-error-types.md
if ((error?.type as string) === 'request-timeout') {
    console.log('Request took too long');
}
