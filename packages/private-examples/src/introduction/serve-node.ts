import {NodeHttpOptions, startNodeServer} from '@mionjs/platform-node';
import './myApi.routes.ts';

const nodeOptions: Partial<NodeHttpOptions> = {port: 3000};
startNodeServer(nodeOptions);
