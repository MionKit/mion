import {initClient} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';

// The client applies the same transforms locally before it validates and sends,
// for every route the server registered with sanitizeParams. It is on by
// default; turn it off to validate and send the value exactly as typed. The
// server still sanitizes those routes, so the handler always gets the clean value.
const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000', sanitizeParams: false});

export {routes};
