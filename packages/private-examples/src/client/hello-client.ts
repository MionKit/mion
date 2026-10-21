import {initClient} from '@mionjs/client';

// only the API type is imported from the server
import type {MyApi} from './hello.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// call() never throws, it returns [result, error]
const [greeting, error] = await routes.sayHello('John').call();

if (error) console.log(error.publicMessage);
else console.log(greeting); // Hello John
