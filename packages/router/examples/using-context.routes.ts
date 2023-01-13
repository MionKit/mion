import {Router, Context} from '@mikrokit/router';
import {APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';
import {someDbDriver} from 'someDbDriver';
import {cloudLogs} from 'MyCloudLogLs';

const app = {cloudLogs, db: someDbDriver};
const shared = {auth: {me: null}};
const getSharedData = (): typeof shared => shared;

type App = typeof app;
type SharedData = ReturnType<typeof getSharedData>;
type CallContext = Context<App, SharedData, APIGatewayEvent>;

const getMyPet = async (context: CallContext): Promise<Pet> => {
    // use of context inside handlers
    const user = context.shared.auth.me;
    const pet = context.app.db.getPetFromUser(user);
    context.app.cloudLogs.log('pet from user retrieved');
    return pet;
};

const routes = {getMyPet};
Router.initRouter(app, getSharedData);
Router.addRoutes(routes);
