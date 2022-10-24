import {Routes, MkRouter, Route} from '@mikrokit/router';

const sayHello: Route = (context, name: string): string => {
    return `Hello ${name}.`;
};

const routes: Routes = {
    'say-Hello': sayHello, // api/say-Hello  !! NOT Recommended
    'say Hello': sayHello, // api/say%20Hello  !! ROUTE WONT BE FOUND
};

MkRouter.addRoutes(routes);
