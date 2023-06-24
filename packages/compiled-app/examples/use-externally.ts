import {initHttp, addRoutes, routes} from '@mionkit/compiled-app';

const options = {
    enableValidation: false,
    enableSerialization: false,
};

const {startHttpServer} = initHttp(options);

addRoutes(routes);

startHttpServer({port: 3000});
