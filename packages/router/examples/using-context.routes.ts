import {registerRoutes, initRouter} from '@mionkit/router';
import {someDbDriver} from 'someDbDriver';
import {cloudLogs} from 'MyCloudLogLs';
import type {CallContext, Routes} from '@mionkit/router';
import type {APIGatewayEvent} from 'aws-lambda';
import type {Pet} from 'MyModels';

const myApp = {cloudLogs, db: someDbDriver};
const shared = {auth: {me: null}};
const getSharedData = (): typeof shared => shared;

type SharedData = ReturnType<typeof getSharedData>;
type Context = CallContext<SharedData, APIGatewayEvent>;

const getMyPet = async (ctx: Context): Promise<Pet> => {
    // use of ctx inside handlers
    const user = ctx.shared.auth.me;
    const pet = myApp.db.getPetFromUser(user);
    myApp.cloudLogs.log('pet from user retrieved');
    return pet;
};

const routes = {getMyPet} satisfies Routes;
initRouter({sharedDataFactory: getSharedData});
export const apiSpec = registerRoutes(routes);
