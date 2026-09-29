import {initClient} from '@mionjs/client';
import type {MyApi} from './myApi.routes.ts';

export const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});
