import {BunHttpOptions, setBunHttpOpts, startBunServer} from '@mionkit/bun';
import './myApi.routes';

// set options specific for bun
const bunOptions: Partial<BunHttpOptions> = {port: 8080};
setBunHttpOpts(bunOptions);

// init bun server
startBunServer();
