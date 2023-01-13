import {Routes, Router, Route} from '@mikrokit/router';

const sayHello: Route = (context, name: string): string => {
    return `Hello ${name}.`;
};

const routes: Routes = {
    'say-Hello': sayHello, // api/say-Hello  !! NOT Recommended
    'say Hello': sayHello, // api/say%20Hello  !! ROUTE WONT BE FOUND
};

Router.addRoutes(routes);
