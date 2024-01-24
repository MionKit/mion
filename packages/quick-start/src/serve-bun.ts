import {BunHttpOptions, startBunServer} from '@mionkit/bun';
import './myApi.routes';

// init a bun server with options specific for bun
const bunOptions: Partial<BunHttpOptions> = {port: 3000};
startBunServer(bunOptions);
