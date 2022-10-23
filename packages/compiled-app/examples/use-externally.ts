import {initHttp, addRoutes, routes} from '@mikrokit/compiled-app';

const {startHttpServer} = initHttp();

addRoutes(routes);

startHttpServer({port: 3000});
