import {MkkRouter, Context} from '@mikrokit/router';
import {APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';
import {someDbDriver} from 'someDbDriver';
import {cloudLogs} from 'MyCloudLogLs';

const app = {cloudLogs, db: someDbDriver};
const sharedData = {auth: {me: null}};

type App = typeof app;
type SharedData = typeof sharedData;
type CallContext = Context<App, SharedData, APIGatewayEvent, APIGatewayProxyResult>;

const getMyPet = async (context: CallContext) => {
    // use of context inside handlers
    const user = context.shared.auth.me;
    const pet = context.app.db.getPetFromUser(user);
    context.app.cloudLogs.log('pet from user retrieved');
    return pet;
};

const routes = {getMyPet};
MkkRouter.initRouter(app, () => structuredClone(sharedData));
MkkRouter.addRoutes(routes);
