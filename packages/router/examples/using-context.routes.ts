import {addRoutes, initRouter} from '@mikrokit/router';
import {someDbDriver} from 'someDbDriver';
import {cloudLogs} from 'MyCloudLogLs';
import type {Context} from '@mikrokit/router';
import type {APIGatewayEvent} from 'aws-lambda';
import type {Pet} from 'MyModels';

const app = {cloudLogs, db: someDbDriver};
const shared = {auth: {me: null}};
const getSharedData = (): typeof shared => shared;

type App = typeof app;
type SharedData = ReturnType<typeof getSharedData>;
type ServerlessContext = {rawRequest: APIGatewayEvent; rawResponse?: null};
type CallContext = Context<App, SharedData, ServerlessContext>;

const getMyPet = async (context: CallContext): Promise<Pet> => {
    // use of context inside handlers
    const user = context.shared.auth.me;
    const pet = context.app.db.getPetFromUser(user);
    context.app.cloudLogs.log('pet from user retrieved');
    return pet;
};

const routes = {getMyPet};
initRouter(app, getSharedData);
export const apiSpec = addRoutes(routes);
