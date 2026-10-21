import {initClient} from '@mionjs/client';
// start:api-type-imports-valid
import type {MyApi} from './myApi.routes.ts';

export const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});
// end:api-type-imports-valid
