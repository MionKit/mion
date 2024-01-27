import {initMionRouter, route} from '@mionkit/router';
import {myApp} from './myApp';
import type {CallContext, Routes} from '@mionkit/router';
import type {Pet, User} from './myModels';

interface SharedData {
    myUser: User | null;
    // ... other shared data properties
}
const initSharedData = (): SharedData => ({myUser: null});

type MyContext = CallContext<SharedData>;

const routes = {
    getMyPet: route(async (ctx: MyContext): Promise<Pet> => {
        const user = ctx.shared.myUser;
        const pet = await myApp.db.getPetFromUser(user);
        return pet;
    }),
} satisfies Routes;

export const myApi = initMionRouter(routes, {sharedDataFactory: initSharedData});
