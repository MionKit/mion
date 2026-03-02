import {NodeHttpOptions, startNodeServer} from '@mionkit/platform-node';
import './myApi.routes';

// init a http server with options specific for node
const nodeOptions: Partial<NodeHttpOptions> = {port: 3000};
startNodeServer(nodeOptions);
