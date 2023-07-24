import {CallContext, Routes, registerRoutes} from '@mionkit/router';
import type {Pet} from 'MyModels';
import {myApp} from './myApp';
import {IncomingMessage, ServerResponse} from 'http';

// client must support write stream
const fakeProgress = {
    rawHook: async (ctx: CallContext, request, req: IncomingMessage, resp: ServerResponse): Promise<void> => {
        return new Promise((resolve) => {
            const maxTime = 1000;
            const increment = 10;
            let total = 0;
            const intervale = setInterval(() => {
                if (total >= maxTime) {
                    clearInterval(intervale);
                    resolve();
                }
                total += increment;
                resp.write(`\n${total}%`);
            }, increment);
        });
    },
};

const getPet = async (ctx, petId: number): Promise<Pet> => {
    const pet = myApp.deb.getPet(petId);
    // ...
    return pet;
};

const routes = {
    fakeProgress, // header: Authorization (defined using fieldName)
    users: {
        getPet,
    },
} satisfies Routes;

export const apiSpec = registerRoutes(routes);
