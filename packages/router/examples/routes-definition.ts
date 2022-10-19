import {Route, Handler, Routes, MkkRouter} from '@mikrokit/router';

const sayHello: Handler = (context, name: string) => {
    return `Hello ${name}.`;
};

const sayHello2: Route = {
    route(context, name1: string, name2: string) {
        return `Hello ${name1} and ${name2}.`;
    },
};

const routes: Routes = {
    sayHello, // api/sayHello
    sayHello2, // api/sayHello2
};

MkkRouter.setRouterOptions({prefix: 'api/'});
MkkRouter.addRoutes(routes);
