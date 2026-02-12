// Load custom AOT caches (optional for client)
import {jitFnsCache, pureFnsCache} from 'my-api-aot';
import {addAOTCaches} from '@mionkit/core';

addAOTCaches(jitFnsCache, pureFnsCache);

// Then initialize the client
import {initClient} from '@mionkit/client';
import type {MyApi} from './aot-routes-example.ts';

const {routes, linkedFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});
