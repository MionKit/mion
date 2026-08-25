import {UwsHttpOptions, startUwsServer} from '@mionjs/platform-uws';
import './myApi.routes.ts';

// init a http server with options specific for uWebSockets.js
const uwsOptions: Partial<UwsHttpOptions> = {port: 3000};
startUwsServer(uwsOptions);
