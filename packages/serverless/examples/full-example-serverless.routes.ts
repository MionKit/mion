import {initAwsLambdaApp} from '@mikrokit/client';
import {Route} from '@mikrokit/router';

// #### App ####

type SimpleUser = {name: string; surname: string};
type DataPoint = {date: Date};
type SharedData = {auth: {me: any}};

const dbChangeUserName = (user: SimpleUser): SimpleUser => ({name: 'NewName', surname: user.surname});
const app = {db: {changeUserName: dbChangeUserName}};
const sharedDataFactory = (): SharedData => ({auth: {me: null}});

// #### Routes ####

const changeUserName: Route = (context: CallContext, user: SimpleUser) => {
    return context.app.db.changeUserName(user);
};

const getDate: Route = (context: CallContext, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('December 17, 2020 03:24:00')};
};

// #### Init server ####

const routerOpts = {prefix: 'api/'};
const routes = {changeUserName, getDate};
const {voidContextHandler, lambdaHandler, MkRouter} = initAwsLambdaApp(app, sharedDataFactory, routerOpts);
MkRouter.addRoutes(routes);
export type CallContext = typeof voidContextHandler;

// Aws Lambda Handler
export const handler = lambdaHandler;
