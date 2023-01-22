<p align="center">
  <img alt="Typescript Serverless Apis at the speed of light" width="" src='../../assets/public/bannerx90.png?raw=true'>
</p>
<p align="center">
  <strong>MikroKit Serverless Router for quick Api development.
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/travis/mikrokit/mikrokit.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mikrokit/serverless`

**_[MikroKit Router](../router/README.md) is an RPC like router oriented for quick Api development,_** &nbsp; it is agnostic about the server or serverless environment it is used on. It could be used on aws lambda, azure functions, Google cloud functions, or any event based environment.

This package contains a collection bindings for different serverless environments.

## `RPC like router`

MikroKit router uses a **Remote Procedure Call** style routing, unlike traditional routers it does not use `GET`, `PUT`, `POST` and `DELETE` methods, everything is transmitted using `HTTP POST` method and all data is sent/received in the request/response `body` and `headers`.

### Requests & Responses

- Requests are made using only `HTTP POST` method.
- Data is sent and received only in the `body` and `headers`.
- Data is sent and received only in `JSON` format.

## `Routing`

🚀 Lightweight router **_based in plain javascript objects_**.

Thanks to it's RPC style there is no need to parse parameters or regular expressions when finding a route. Just a simple [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) in memory containing all the routes.

`Route parameters` are passed as an array in the request body, in a field with the same name as the route. Elements in the array must have the same order as the function parameters.

`Route response` is send back in the body in a field with the same name as the route.

The reason for this weird naming is to future proof the router to be able to accept multiple routes on a single request. However this can be changed setting the `routeFieldName` in the router options.

### 📋 [Please read full router documentation here!](./packages/router/README.md)

```js
// ../router/examples/routes-definition.routes.ts

import {setRouterOptions, addRoutes} from '@mikrokit/router';

const sayHello = (context: any, name: string): string => {
  return `Hello ${name}.`;
};

const sayHello2 = {
  route(context: any, name1: string, name2: string): string {
    return `Hello ${name1} and ${name2}.`;
  },
};

const routes = {
  sayHello, // api/sayHello
  sayHello2, // api/sayHello2
};

setRouterOptions({prefix: 'api/'});
export const executables = addRoutes(routes);
```

### Write a fully validated Serverless API in 5 mins 🚀

```ts
// examples/full-example-serverless.routes.ts

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
const {emptyContext, lambdaHandler, Router} = initAwsLambdaApp(app, sharedDataFactory, routerOpts);
Router.addRoutes(routes);
export type CallContext = typeof emptyContext;

// Aws Lambda Handler
export const handler = lambdaHandler;
```

---

_[MIT](../../LICENSE) LICENSE_
