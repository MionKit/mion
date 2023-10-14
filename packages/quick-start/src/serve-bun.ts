import {setBunHttpOptions, startBunHttpServer} from '@mionkit/bun';
import './myApi.routes';

// set options specific for bun
const bunOptions = {port: 8080};
setBunHttpOptions(bunOptions);

// init bun server
startBunHttpServer();
