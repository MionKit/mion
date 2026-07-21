// Client without the mion Vite plugin — no build-time injection on the client.
// Validation and serialization metadata is fetched at runtime from the server via
// fetchRemoteMethodsMetadata().
import {initClient} from '@mionjs/client';
import type {MyApi} from './routes-example.ts';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});
