import {setNodeHttpOptions, startHttpServer} from '@mionkit/http';
import './myApi.routes';

// set options specific for node
const nodeOptions = {port: 8080};
setNodeHttpOptions(nodeOptions);

// init node server
startHttpServer();
