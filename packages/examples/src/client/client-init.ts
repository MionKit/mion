import {initClient} from '@mionjs/client';

// importing only the RemoteApi type from server
import type {MyApi} from './server.routes.ts';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});
