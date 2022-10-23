<p align="center">
  <img alt='MikroKit, a mikro kit for Typescript Serverless APIs' src='./assets/public/logo.svg?raw=true' width="403" height="150">
</p>
<p align="center">
  <strong>Minimal kit for Serverless APIs written in Typescript.</strong><br/>
  Built on top of
    <a href='https://www.typescriptlang.org/' target='_blank'>Serverless Framework</a> and
    <a href='https://deepkit.io/' target='_blank'>Deepkit</a>.
</p>

<p align=center>
  <img src="https://img.shields.io/travis/mikrokit/mikrokit.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

## `Why another framework`

Serverless applications have different requirements than conventional server apps.

With that in mind **MikroKit is designed to build lightweight Apis**. It is a very opinionated micro framework with simplicity and speed in mind.

### MikroKit vs Deepkit

Deepkit is an amazing modern web framework that brings types to the runtime world, with a full batteries included philosophy, it is still on early stages but could be considered an enterprise grade framework with many features like: Web Framework, ORM, HTTP, RPC, Dependency Injection, Dashboard, Events and many more...

[![Deepkit](./assets/other_logos/deepkit_text.svg?raw=true)](https://deepkit.io/)

MikroKit uses only the core `@deepkit/type` library from deepkit to produce a minimal framework oriented for serverless Apis with all the advantages of runtime types.

## `Opinionated`

**MikroKit is orientated towards** a very specific scenario, that is **Apis that works with json data only**. In return it offers fast development and lightweight execution.

MikroKit opinions might not always be the best or suit every scenario, but are always taken with quick development, fast code execution and minimum abstractions in mind. _Simplicity can be the best pattern_.

- Convention over configuration.
- Prioritizes developer friendliness and performance over existing conventions.
- Tightly Integration between Routing + Data (Aka the MikroKit way).

## `Features`

<!-- 1. [AWS & Serverless framework](https://www.serverless.com/) for cloud infrastructure
1. [AWS Cognito](https://aws.amazon.com/cognito/) for Authentication, sign up emails, password reset, etc -->

- ✅ RPC Like Routing
- ✅ Automatic Validation and Serialization
- 🛠️ [Postgres.js](https://github.com/porsager/postgres) for quick DataBase access with great support for types, (No DataBase access abstraction).
- 🛠️ Base Models with CRUD & Filters operations
- 🛠️ Access Control List _<sup>(linux-like)</sup>_
- 🛠️ Automatic Typescript client generation.

#### !! MikroKit is currently under heavy development

## `RPC like`

Here is where MikroKit starts to deviate from traditional frameworks. [The router](./packages/router/README.md) uses a **Remote Procedure Call** style routing, unlike traditional routers it does not use `GET`, `PUT`, `POST` and `DELETE` methods, everything is transmitted using `HTTP POST` method and all data is sent/received in the request/response `body` and `headers`.

### Requests & Responses

- Requests are made using only `HTTP POST` method.
- Data is sent and received only in the `body` and `headers`.
- Data is sent and received only in `JSON` format.

### Rpc VS Rest

| RPC Like Request                                                   | REST Request                            | Description     |
| ------------------------------------------------------------------ | --------------------------------------- | --------------- |
| POST `/users/get`<br>BODY `{"/users/get":[{"id":1}]}`              | GET `/users/1`<br>BODY `NONE`           | Get user by id  |
| POST `/users/create`<br>BODY `{"/users/create":[{"name":"John"}]}` | POST `/users`<br>BODY `{"name":"John"}` | Create new user |
| POST `/users/delete`<br>BODY `{"/users/delete":[{"id":1}]}`        | DELETE `/users/1`<br>BODY `NONE`        | Delete user     |
| POST `/users/getAll`<br>BODY `{"/users/getAll":[]}`                | GET `/users` <br>BODY `NONE`            | Get All users   |

Please have a look to this great Presentation for more info about each different type of API and the pros and cons of each one:  
[Nate Barbettini – API Throwdown: RPC vs REST vs GraphQL, Iterate 2018](https://www.youtube.com/watch?v=IvsANO0qZEg)

## `Routing`

🚀 Blazing fast router **_based in plain javascript objects_**.

Thanks to it's RPC style there is no need to parse parameters or regular expressions when finding a route. Just a simple [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) in memory containing all the routes. Can't get faster than that.

`Route parameters` are passed as an array in the request body, in a field with the same name as the route. Elements in the array must have the same order as the function parameters.

`Route response` is send back in the body in a field with the same name as the route.

The reason for this weird naming is to future proof the router to be able to accept multiple routes on a single request. However this can be changed setting the `routeFieldName` in the router options.

📚 [Full router documentation here!](./packages/router/README.md)

### Example:

```js
// packages/router/examples/routes-definition.ts

import {Route, Handler, Routes, MkRouter} from '@mikrokit/router';

const sayHello: Handler = (context, name: string) => {
  return `Hello ${name}.`;
};

const sayHello2: Route = {
  route(context, name1: string, name2: string) {
    return `Hello ${name1} and ${name2}.`;
  },
};

const routes: Routes = {
  sayHello, // api/sayHello
  sayHello2, // api/sayHello2
};

MkRouter.setRouterOptions({prefix: 'api/'});
MkRouter.addRoutes(routes);
```

## `Automatic Serialization & Validation`

Mikrokit uses [Deepkit's runtime types](https://deepkit.io/) to automatically [validate](https://docs.deepkit.io/english/validation.html) request params and [serialize/deserialize](https://docs.deepkit.io/english/serialization.html) response data.

Thanks to Deepkit's magic the type information is available at runtime and the data is auto-magically Validated and Serialized. For more information please read deepkit's documentation:

- Request [Deserialization/Validation](https://docs.deepkit.io/english/validation.html)
- Response [Serialization](https://docs.deepkit.io/english/serialization.html)

<table>
<tr><th>POST HTTP REQUEST</th><th>HTTP RESPONSE</th></tr>
<tr>
<td>

```yml
PATH: /api/v1/sayHello

# HEADERS
Accept: application/json

# BODY
{"/api/v1/users/getUser": ["John"]}
```

</td>
<td>

```yml
PATH: /api/v1/sayHello

# HEADERS
Content-Type: application/json; charset=utf-8

# BODY
{"/api/v1/sayHello": "Hello John"}
```

</td>
</tr>
</table>

## `Quick start`

#### You can use MikroKit base project.

```sh
npx degit https://github.com/mikrokit/mikrokit-base
```

#### Or manually intall in your own project

Some steps are required to be able to use deepkit runtime types, [docs here](https://docs.deepkit.io/english/runtime-types.html#runtime-types-installation).

Reflection must be enabled in _tsconfig.json_

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "es6",
    "moduleResolution": "node",
    "experimentalDecorators": true
  },
  "reflection": true
}
```

Install deepkit required packages

```sh
npm install --save @deepkit/type
npm install --save-dev @deepkit/type-compiler @deepkit/core
```

Install MikroKit CLI.

```sh
npm install mikrokit
```

## `Contributing`

The software is provided as it is without guarantees. If you want something done you are welcome to open issues and pull request! 👍 🎊 🎉

### Monorepo

This project is a monorepo managed using npm [workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces). (`npm >= 7` required)

**_!! ALL Dev Dependencies mus be installed in root package !!_**

Each package within this monorepo is compiled using and tested individually using typescript and [jest](https://jestjs.io/).
To run an npm command in a workspace, append `-w @mikrokit/<name>` to the command.

```sh
## run jest tests
npm run test -w @mikrokit/router

## compiles typescript
npm run dev -w @mikrokit/router

## run jest unit tests
npm run dev:test -w @mikrokit/router
```

### ESLint and Prettier

All pull request must pass ESLint and [Prettier](https://github.com/prettier/prettier) before being merged.  
Run bellow command to automatically format all typescript files and check Lint errors.

```sh
npm run format && npm run lint
```

### Build

Build must be done mostly on CI environment, be sure to remove any `.dist` folder or typescript will get types from the build types definitions files instead the source code and wont get lates updates from the other packages.

```
npm run build
```

### Powered by:

- [Serverless Framework](https://www.serverless.com/)
- [AWS Cognito](https://aws.amazon.com/cognito/)
- [Deepkit](https://deepkit.io/)
- [Postgres.js](https://github.com/porsager/postgres)

![powered by: aws, deepkit, serverless, postgres.js, mikrokit](./assets/public/tech-stack-830x100.png?raw=true) &nbsp;&nbsp;

_License: [MIT](./LICENSE)_
