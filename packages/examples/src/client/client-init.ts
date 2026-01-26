import {initClient} from '@mionkit/client';

// importing only the RemoteApi type from server
import type {MyApi} from './server.routes';

const {routes, linkedFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});
