// @errors: 2345
// @noErrors: 1003
import {initClient} from '@mionkit/client';
import type {MyApi} from './home-server.ts';

const {routes} = initClient<MyApi>({
    baseURL: 'http://localhost:3000',
});

// Call getUser route - returns User with Date and Set types
const [user, error] = await routes.getUser(1234).call();
if (error) {
    // Handle RpcError - type is narrowed to 'user-not-found'
    console.log('Error:', error.type);
    //                     ^?
}

if (user) {
    // Date and Set are automatically serialized/deserialized
    user.createdAt;
    //   ^?


    user.tags;
    //   ^?
}

// Type error: id must be a string, not a number
routes.getUser('1234').call();

// Autocomplete: shows available routes
// prettier-ignore
routes.
//     ^|
