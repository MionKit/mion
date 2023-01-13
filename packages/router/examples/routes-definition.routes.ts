import {Route, Handler, Routes, Router} from '@mikrokit/router';

const sayHello: Handler = (context, name: string): string => {
    return `Hello ${name}.`;
};

const sayHello2: Route = {
    route(context, name1: string, name2: string): string {
        return `Hello ${name1} and ${name2}.`;
    },
};

const routes: Routes = {
    sayHello, // api/sayHello
    sayHello2, // api/sayHello2
};

Router.setRouterOptions({prefix: 'api/'});
Router.addRoutes(routes);
