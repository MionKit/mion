import {NodeHttpOptions, setNodeHttpOpts, startNodeServer} from '@mionkit/http';
import './myApi.routes';

// set options specific for node
const nodeOptions: Partial<NodeHttpOptions> = {port: 8080};
setNodeHttpOpts(nodeOptions);

// init node server
startNodeServer();
