import {registerRoutes, getCallContext, Routes, CallContext, initRouter, PureRoutes, PureRouteDef} from '@mionkit/router';

type SharedData = {
    myCompanyName: string;
};

type Context = CallContext<SharedData>;

// Note the context is not passed as first function
const sayHello = (name: string): string => {
    const {shared} = getCallContext<Context>();
    return `Hello ${name}. From ${shared.myCompanyName}.`;
};

const sayHello2 = {
    // Note the context is not passed as first function.
    route(name1: string, name2: string): string {
        const {shared} = getCallContext<Context>();
        return `Hello ${name1} and ${name2}. From ${shared.myCompanyName}.`;
    },
} satisfies PureRouteDef; // note we are using the PureRouteDef type instead of RouteDef

const routes = {
    sayHello, // api/sayHello
    sayHello2, // api/sayHello2
} satisfies PureRoutes; // note we are using the PureRoutes type instead of Routes

initRouter({prefix: 'api/', useAsyncCallContext: true});
export const apiSpec = registerRoutes(routes);
