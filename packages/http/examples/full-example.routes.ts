import {initHttpRouter, startHttpServer} from '@mionkit/http';
import {Routes, registerRoutes} from '@mionkit/router';

// #### App ####

type SimpleUser = {name: string; surname: string};
type DataPoint = {date: Date};
type SharedData = {auth: {me: any}};

const dbChangeUserName = (user: SimpleUser): SimpleUser => ({name: 'NewName', surname: user.surname});
const myApp = {db: {changeUserName: dbChangeUserName}};
const sharedDataFactory = (): SharedData => ({auth: {me: null}});

// #### Routes ####

const changeUserName = (ctx, user: SimpleUser): SimpleUser => {
    return myApp.db.changeUserName(user);
};

const getDate = (ctx, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('December 17, 2020 03:24:00')};
};

// #### Init server ####

const routerOpts = {prefix: 'api/'};
const routes = {changeUserName, getDate} satisfies Routes;
initHttpRouter(sharedDataFactory, routerOpts);
registerRoutes(routes);
startHttpServer({port: 8080});
