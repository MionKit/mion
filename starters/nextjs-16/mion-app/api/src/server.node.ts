import {initApi} from './api.ts';
import {startNodeServer} from '@mionkit/platform-node';

await initApi();
startNodeServer({port: 3001});
