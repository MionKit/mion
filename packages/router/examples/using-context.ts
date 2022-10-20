import {MkRouter, Context} from '@mikrokit/router';
import {APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';
import {someDbDriver} from 'someDbDriver';
import {cloudLogs} from 'MyCloudLogLs';

const app = {cloudLogs, db: someDbDriver};
const getSharedData = () => ({auth: {me: null}});

type App = typeof app;
type SharedData = ReturnType<typeof getSharedData>;
type CallContext = Context<App, SharedData, APIGatewayEvent>;

const getMyPet = async (context: CallContext) => {
    // use of context inside handlers
    const user = context.shared.auth.me;
    const pet = context.app.db.getPetFromUser(user);
    context.app.cloudLogs.log('pet from user retrieved');
    return pet;
};

const routes = {getMyPet};
MkRouter.initRouter(app, getSharedData);
MkRouter.addRoutes(routes);
