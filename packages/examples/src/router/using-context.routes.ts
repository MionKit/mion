import {initMionRouter, route} from '@mionjs/router';
import type {CallContext, Routes} from '@mionjs/router';
import type {User} from './full-example.app.ts';

interface ContextData {
    myUser: User | null;
    // ... other context data properties
}
const initContextData = (): ContextData => ({myUser: null});

type MyContext = CallContext<ContextData>;

const routes = {
    getMyPet: route(async (ctx: MyContext): Promise<Pet> => {
        const user = ctx.shared.myUser;
        const pet = await myApp.db.getPetFromUser(user);
        return pet;
    }),
} satisfies Routes;

export const myApi = await initMionRouter(routes, {contextDataFactory: initContextData});
