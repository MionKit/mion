import {initHttp, addRoutes, routes} from '@mion/compiled-app';

const options = {
    enableValidation: false,
    enableSerialization: false,
};

const {startHttpServer} = initHttp(options);

addRoutes(routes);

startHttpServer({port: 3000});
