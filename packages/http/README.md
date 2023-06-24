<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/public/bannerx90-dark.png?raw=true">
    <source media="(prefers-color-scheme: light)" srcset="../../assets/public/bannerx90.png?raw=true">
    <img alt='mion, a mikro kit for Typescript Serverless APIs' src='../../assets/public/bannerx90.png?raw=true'>
  </picture>
</p>
<p align="center">
  <strong>mion HTTP Server for quick Api development.
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/travis/MionKit/mion.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mion/http`

**mion router is an RPC like router oriented for quick Api development,** it is agnostic about the environment it is used on. It could be used on [serverless environments](../serverless/README.md), or as an standalone http server.

**mion Server is well suited a very specific scenario, that is Apis that works with json data only**. In return it offers quick development, fast execution and a Lightweight router. [Benchmarks here!](https://github.com/MionKit/benchmarks) 🚀

This is a limited http server, only supports `application/json` content type, does not support multipart/form-data, no websocket or streams and no file upload neither. There are better alternatives for those scenarios (like S3 file upload, etc).

## `RPC like router`

mion router uses a **Remote Procedure Call** style routing, unlike traditional routers it does not use `GET`, `PUT`, `POST` and `DELETE` methods, everything is transmitted using `HTTP POST` method and all data is sent/received in the request/response `body` and `headers`.

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

import {setRouterOptions, registerRoutes} from '@mion/router';

const sayHello = (app, ctx, name: string): string => {
  return `Hello ${name}.`;
};

const sayHello2 = {
  route(app, ctx, name1: string, name2: string): string {
    return `Hello ${name1} and ${name2}.`;
  },
};

const routes = {
  sayHello, // api/sayHello
  sayHello2, // api/sayHello2
};

setRouterOptions({prefix: 'api/'});
export const apiSpec = registerRoutes(routes);
```

---

### Write a fully validated API in 5 mins 🚀

```ts
// examples/full-example.routes.ts

import {initHttpApp} from '@mion/http';
import {Route} from '@mion/router';

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
const {emptyContext, startHttpServer, Router} = initHttpApp(app, sharedDataFactory, routerOpts);
Router.addRoutes(routes);
startHttpServer({port: 8080});

export type CallContext = typeof emptyContext;
```

---

_[MIT](../../LICENSE) LICENSE_
