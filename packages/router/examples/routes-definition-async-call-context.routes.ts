import {setRouterOptions, registerRoutes, getCallContext, Routes} from '@mionkit/router';

type SharedData = {
    myCompanyName: string;
};

// Note the app and context are not passed as function parameters.
const sayHello = (name: string): string => {
    const {myCompanyName} = getCallContext<SharedData>();
    return `Hello ${name}. From ${myCompanyName}.`;
};

const sayHello2 = {
    // Note the app and context are not passed as function parameters.
    route(name1: string, name2: string): string {
        const {myCompanyName} = getCallContext<SharedData>();
        return `Hello ${name1} and ${name2}. From ${myCompanyName}.`;
    },
};

const routes = {
    sayHello, // api/sayHello
    sayHello2, // api/sayHello2
} satisfies Routes;

setRouterOptions({prefix: 'api/', useAsyncCallContext: true});
export const apiSpec = registerRoutes(routes);
