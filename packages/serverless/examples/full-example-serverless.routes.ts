import {awsLambdaHandler} from '@mionkit/serverless';
import {CallContext, initRouter, registerRoutes, Route} from '@mionkit/router';

// #### App ####

type SimpleUser = {name: string; surname: string};
type DataPoint = {date: Date};
type SharedData = {auth: {me: any}};

const dbChangeUserName = (user: SimpleUser): SimpleUser => ({name: 'NewName', surname: user.surname});
const myApp = {db: {changeUserName: dbChangeUserName}};
const sharedDataFactory = (): SharedData => ({auth: {me: null}});

// #### Routes ####

const changeUserName: Route = (ctx: CallContext, user: SimpleUser) => {
    return myApp.db.changeUserName(user);
};

const getDate: Route = (ctx: CallContext, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('December 17, 2020 03:24:00')};
};

// #### Init App ####
const routerOpts = {sharedDataFactory, prefix: 'api/'};
const routes = {changeUserName, getDate};
initRouter(routerOpts);
export const myApi = registerRoutes(routes);

// Aws Lambda Handler
export const handler = awsLambdaHandler;
