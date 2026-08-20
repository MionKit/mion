import {BunHttpOptions, startBunServer} from '@mionjs/platform-bun';
import './myApi.routes.ts';

// init a bun server with options specific for bun
const bunOptions: Partial<BunHttpOptions> = {port: 3000};
startBunServer(bunOptions);
