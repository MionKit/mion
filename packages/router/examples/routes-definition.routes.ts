import {setRouterOptions, addRoutes} from '@mikrokit/router';

const sayHello = (context: any, name: string): string => {
    return `Hello ${name}.`;
};

const sayHello2 = {
    route(context: any, name1: string, name2: string): string {
        return `Hello ${name1} and ${name2}.`;
    },
};

const routes = {
    sayHello, // api/sayHello
    sayHello2, // api/sayHello2
};

setRouterOptions({prefix: 'api/'});
export const executables = addRoutes(routes);
