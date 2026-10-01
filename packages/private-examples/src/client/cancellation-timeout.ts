import {initClient} from '@mionjs/client';
import type {MyApi} from './hello.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// this request fails if it takes longer than 5 seconds
const [greeting, error, response] = await routes
  .sayHello('John')
  .call({timeout: 5000});

// transport failures never join the route's typed errors; they go to @thrownErrors, open RpcError<string>
if (response['@thrownErrors']?.[0].type === 'request-timeout')
  console.log('Request took too long');
else if (!error) console.log(greeting);
