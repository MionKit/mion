// Load custom AOT caches (optional for client)
import {jitFnsCache, pureFnsCache} from 'my-api-aot';
import {addAOTCaches} from '@mionjs/core';

addAOTCaches(jitFnsCache, pureFnsCache);

// Then initialize the client
import {initClient} from '@mionjs/client';
import type {MyApi} from './aot-routes-example.ts';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});
