import {registerRoutes, initRouter} from '@mikrokit/router';
import {someDbDriver} from 'someDbDriver';
import {cloudLogs} from 'MyCloudLogLs';
import type {Context} from '@mikrokit/router';
import type {APIGatewayEvent} from 'aws-lambda';
import type {Pet} from 'MyModels';

const myApp = {cloudLogs, db: someDbDriver};
const shared = {auth: {me: null}};
const getSharedData = (): typeof shared => shared;

type App = typeof myApp;
type SharedData = ReturnType<typeof getSharedData>;
type ServerlessContext = {rawRequest: APIGatewayEvent; rawResponse?: null};
type CallContext = Context<SharedData, ServerlessContext>;

const getMyPet = async (app: App, ctx: CallContext): Promise<Pet> => {
    // use of ctx inside handlers
    const user = ctx.shared.auth.me;
    const pet = app.db.getPetFromUser(user);
    app.cloudLogs.log('pet from user retrieved');
    return pet;
};

const routes = {getMyPet};
initRouter(myApp, getSharedData);
export const apiSpec = registerRoutes(routes);
