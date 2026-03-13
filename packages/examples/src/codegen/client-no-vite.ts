// Client without mion Vite plugin — no AOT caches needed.
// Validation and serialization metadata is fetched at runtime
// from the server via fetchRemoteMethodsMetadata().
import {initClient} from '@mionjs/client';
import type {MyApi} from './aot-routes-example.ts';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});
