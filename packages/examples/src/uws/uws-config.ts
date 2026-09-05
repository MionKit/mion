import {startUwsServer} from '@mionjs/platform-uws';
import './uws-routes.ts';

await startUwsServer({port: 3000});
