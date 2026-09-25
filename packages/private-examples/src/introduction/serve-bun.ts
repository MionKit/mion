import {BunHttpOptions, startBunServer} from '@mionjs/platform-bun';
import './myApi.routes.ts';

const bunOptions: Partial<BunHttpOptions> = {port: 3000};
startBunServer(bunOptions);
