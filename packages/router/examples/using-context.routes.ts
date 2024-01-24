import {initMionRouter, initRouter} from '@mionkit/router';
import {myApp} from './myApp';
import type {CallContext, Routes} from '@mionkit/router';
import type {Pet, User} from './myModels';

interface SharedData {
    myUser: User | null;
    // ... other shared data properties
}
const initSharedData = (): SharedData => ({myUser: null});

type MyContext = CallContext<SharedData>;
const getMyPet = async (ctx: MyContext): Promise<Pet> => {
    const user = ctx.shared.myUser;
    const pet = myApp.db.getPetFromUser(user);
    return pet;
};

const routes = {getMyPet} satisfies Routes;
initRouter({sharedDataFactory: initSharedData});
export const apiSpec = initMionRouter(routes);
