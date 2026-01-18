import {initClient} from '@mionkit/client';
import type {MyApi} from './server.routes';

const {routes, hooks} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function callWithHooks() {
    // calls route with auth hook
    // Returns 4-tuple: [routeResult, routeError, hooksResults, hooksErrors]
    const [user, routeError, hookResults, hookErrors] = await routes.users.getById('123').callWithHooks({
        auth: hooks.auth('myToken-XYZ'),
    });

    if (routeError || hookErrors?.auth) {
        console.log('Something failed');
    } else {
        console.log(user); // User object
    }
}

