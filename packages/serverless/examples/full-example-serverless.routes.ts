import {initAwsLambdaApp, lambdaHandler} from '@mionkit/serverless';
import {Context, registerRoutes, Route} from '@mionkit/router';
import {AwsRawServerContext} from '../src/types';

// #### App ####

type SimpleUser = {name: string; surname: string};
type DataPoint = {date: Date};
type SharedData = {auth: {me: any}};
type App = typeof myApp;
type CallContext = Context<SharedData, AwsRawServerContext>;

const dbChangeUserName = (user: SimpleUser): SimpleUser => ({name: 'NewName', surname: user.surname});
const myApp = {db: {changeUserName: dbChangeUserName}};
const sharedDataFactory = (): SharedData => ({auth: {me: null}});

// #### Routes ####

const changeUserName: Route = (app: App, ctx: CallContext, user: SimpleUser) => {
    return app.db.changeUserName(user);
};

const getDate: Route = (app: App, ctx: CallContext, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('December 17, 2020 03:24:00')};
};

// #### Init App ####
const routerOpts = {prefix: 'api/'};
const routes = {changeUserName, getDate};
initAwsLambdaApp(myApp, sharedDataFactory, routerOpts);
export const myApi = registerRoutes(routes);

// Aws Lambda Handler
export const handler = lambdaHandler;
