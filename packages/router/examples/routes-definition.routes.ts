import {registerRoutes, Routes, initRouter} from '@mionkit/router';

const sayHello = (ctx, name: string): string => {
    return `Hello ${name}.`;
};

const sayHello2 = {
    route(ctx, name1: string, name2: string): string {
        return `Hello ${name1} and ${name2}.`;
    },
};

const routes = {
    sayHello, // api/sayHello
    sayHello2, // api/sayHello2
} satisfies Routes;

initRouter({prefix: 'api/'});
export const apiSpec = registerRoutes(routes);
