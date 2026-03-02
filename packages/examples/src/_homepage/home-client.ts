// @errors: 2345
// @noErrors: 1003
import {initClient} from '@mionkit/client';
import type {MyApi} from './home-server.ts';

const {routes} = initClient<MyApi>({
    baseURL: 'http://localhost:3000',
});
// @annotate: Autocomplete: shows available routes

const [user, error] = await routes.getUser(1234).call();
//                                 ^|

if (user) {
    user.createdAt;
//         ^?

// @annotate: Native Classes Like Set are automatically serialized/deserialized

    user.tags;
//        ^?
}

// Type error: id must be a number
routes.getUser('1234').call();
