import {startNodeServer} from '@mionjs/platform-node';
import './node-routes.ts';

await startNodeServer({port: 3000});
