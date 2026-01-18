import {initClient} from '@mionkit/client';
import type {MyApi} from './server.routes';

const {routes, hooks} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function basicErrorHandling() {
    // call() returns 4-tuple - never throws
    const [user, error] = await routes.users.getById('123').call();

    if (error) {
        // Handle error - TypeScript knows the error type
        console.log('Error:', error.publicMessage);
    } else {
        // Handle success
        console.log('User:', user?.name);
    }
}

