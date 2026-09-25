import {UwsHttpOptions, startUwsServer} from '@mionjs/platform-uws';
import './myApi.routes.ts';

const uwsOptions: Partial<UwsHttpOptions> = {port: 3000};
startUwsServer(uwsOptions);
