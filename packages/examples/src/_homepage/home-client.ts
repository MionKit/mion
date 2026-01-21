// @errors: 2345
// @noErrors: 1003
import {initClient} from '@mionkit/client';
import type {MyApi} from './home-server.ts';
// @annotate: Autocomplete: shows available routes
const {routes} = initClient<MyApi>({
    baseURL: 'http://localhost:3000',
});

const [user, error] = await routes.getUser(1234).call();
//                                 ^|

// @log: Returned RpcErrors are Fully typed
if (error) {
    console.log('Error:', error.type);
    //                     ^?
}

// @log: Date and Set are restored to their original types
if (user) {
    user.createdAt;
    //   ^?


    user.tags;
    //   ^?
}

// Type error: id must be a number
routes.getUser('1234').call();
