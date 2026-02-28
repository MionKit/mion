import {initClient} from '@mionkit/client';
import type {MyApi} from './server.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// calls sum route in the server
const [sum, error] = await routes.utils.sum(5, 2).call();

if (error) {
    console.log('Error:', error.publicMessage);
} else {
    console.log(sum); // 7
}
