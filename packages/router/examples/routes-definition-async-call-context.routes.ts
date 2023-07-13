import {setRouterOptions, registerRoutes, getCallContext, getApp} from '@mionkit/router';

type SharedData = {
    myCompanyName: string;
};

// Note the app and context are not passed as function parameters.
const sayHello = (name: string): string => {
    const {shared} = getCallContext<SharedData>();
    return `Hello ${name}. From ${shared.myCompanyName}.`;
};

const sayHello2 = {
    // Note the app and context are not passed as function parameters.
    route(name1: string, name2: string): string {
        const {shared} = getCallContext<SharedData>();
        return `Hello ${name1} and ${name2}. From ${shared.myCompanyName}.`;
    },
};

const routes = {
    sayHello, // api/sayHello
    sayHello2, // api/sayHello2
};

setRouterOptions({prefix: 'api/', useAsyncCallContext: true});
export const apiSpec = registerRoutes(routes);
