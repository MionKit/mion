import {initClient} from '@mionjs/client';
import type {HelloApi} from './hello.routes.ts';

const {routes} = initClient<HelloApi>({baseURL: 'http://localhost:3000'});

// this request fails if it takes longer than 5 seconds
const [greeting, error, fatal] = await routes.sayHello('John').call({timeout: 5000});

// transport failures are never part of the route's typed error union: they land in the
// fatal slot, which is an open RpcError<string>
if (fatal?.type === 'request-timeout') console.log('Request took too long');
else if (!error) console.log(greeting);
