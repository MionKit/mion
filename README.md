<p align="center">
  <img alt='MikroKit, a mikro kit for Typescript Serverless APIs' src='./assets/public/logo.svg?raw=true' width="403" height="150">
</p>
<p align="center">
  <strong>Build serverless Apis at the speed of light with typescript.</strong><br/>.
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

**MikroKit is oriented towards** a very specific scenario, that is **Apis that works with json data only**. In return it offers fast development and lightweight execution.

MikroKit opinions might not always be the best or suit every scenario, but are always taken with quick development, fast code execution and minimum abstractions in mind. _Simplicity can be the best pattern_.

- Convention over configuration.
- Prioritizes developer friendliness and performance over existing conventions.
<!-- - Tightly Integration between Routing + Data (Aka the MikroKit way). -->

## `Features`

<!-- 1. [AWS & Serverless framework](https://www.serverless.com/) for cloud infrastructure
1. [AWS Cognito](https://aws.amazon.com/cognito/) for Authentication, sign up emails, password reset, etc -->

- ✅ RPC Like Routing
- ✅ Automatic Validation and Serialization
<!-- - 🛠️ [Postgres.js](https://github.com/porsager/postgres) for quick DataBase access with great support for types, (No DataBase access abstraction).
- 🛠️ Base Models with CRUD & Filters operations
- 🛠️ Access Control List _<sup>(linux-like)</sup>_ -->
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

[Please read full router documentation here! 📗](./packages/router/README.md)

### Example:

```js
// packages/router/examples/routes-definition.routes.ts

import {Route, Handler, Routes, MkRouter} from '@mikrokit/router';

const sayHello: Handler = (context, name: string): string => {
  return `Hello ${name}.`;
};

const sayHello2: Route = {
  route(context, name1: string, name2: string): string {
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

Mikrokit uses [Deepkit's runtime types](https://deepkit.io/) to automatically [validate](https://docs.deepkit.io/english/validation.html) request params and [serialize/deserialize](https://docs.deepkit.io/english/serialization.html) request/response data.

Thanks to Deepkit's magic the type information is available at runtime and the data is auto-magically Validated and Serialized. For more information please read deepkit's documentation:

- Request [Validation](https://docs.deepkit.io/english/validation.html)
- Response/Request [Serialization/Deserialization](https://docs.deepkit.io/english/serialization.html)

#### Request Validation examples

<table>
<tr><th>Code</th><th>POST Request <code>/users/getUser</code></th></tr>
<tr>
<td>

```ts
// packages/router/examples/get-user-request.routes.ts

import {Route, Routes, MkRouter} from '@mikrokit/router';

const getUser: Route = async (context: any, entity: {id: number}): Promise<User> => {
  const user = await context.db.getUserById(entity.id);
  return user;
};

const routes: Routes = {
  users: {
    getUser, // api/users/getUser
  },
};

MkRouter.addRoutes(routes);
```

</td>
<td>

```yml
# VALID REQUEST BODY
{ "/users/getUser": [ {"id" : 1} ]}

# INVALID REQUEST BODY (user.id is not a number)
{"/users/getUser": [ {"id" : "1"} ]}

# INVALID REQUEST BODY (missing parameter user.id)
{"/users/getUser": [ {"ID" : 1} ]}

# INVALID REQUEST BODY (missing parameters)
{"/users/getUser": []}
```

</td>
</tr>
</table>

#### !!! IMPORTANT !!!

Deepkit does not support [Type Inference](https://www.typescriptlang.org/docs/handbook/type-inference.html), `parameter types` and more importantly `return types` must be explicitly defined, so they are correctly validated/serialized.

🚫 Invalid route definitions!

```ts
const myRoute1: Route = () {};
const myRoute2: Route = () => null;
const sayHello: Route = (context, name) => `Hello ${name}`;
const getYser: Route = async (context, userId) => context.db.getUserById(userId);
```

✅ Valid route definitions!

```ts
const myRoute1: Route = (): void {};
const myRoute2: Route = (): null => null;
const sayHello: Route = (context: Context, name:string): string => `Hello ${name}`;
const getYser: Route = async (context: Context, userId:number): Promise<User> => context.db.getUserById(userId);
```

## `Quick start`

#### You can use MikroKit base project.

<!--
```sh
npx degit https://github.com/mikrokit/mikrokit-base
```

#### Or manually intall in your own project -->

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

<!-- Install MikroKit CLI.

```sh
npm install mikrokit
``` -->

## `Contributing`

The software is provided as it is without guarantees. If you want something done you are welcome to open issues and pull request! 👍 🎊 🎉

### Monorepo

This project is a monorepo managed using npm [workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces). (`npm >= 7` required), [NX](https://nx.dev/) and [Lerna](https://lerna.js.org/)

**_!! ALL Dev Dependencies mus be installed in root package !!_**

Each package within this monorepo is compiled using and tested individually using typescript and [jest](https://jestjs.io/).
To run an npm command in a workspace, `npx nx run <package>:<npm-script>`, i.e: `npx nx run @mikrokit/router:build`

```sh
## run jest tests in @mikrokit/router
npx nx run @mikrokit/router:test

## run jest in all packages
npx lerna run test

## compiles typescript in @mikrokit/router
npx nx run @mikrokit/router:build

## compiles typescript in all packages (NX will build only whats required)
npx lerna run build
```

### ESLint and Prettier

All pull request must pass ESLint and [Prettier](https://github.com/prettier/prettier) before being merged.  
Run bellow command to automatically format all typescript files and check Lint errors.

```sh
npm run format && npm run lint
```

### Powered by:

- [Typescript](https://www.typescriptlang.org/)
- [Deepkit](https://deepkit.io/)
  <!-- - [Serverless Framework](https://www.serverless.com/)  -->
  <!-- - [AWS Cognito](https://aws.amazon.com/cognito/) -->
  <!-- - [Postgres.js](https://github.com/porsager/postgres) -->

<!-- ![powered by: deepkit, serverless, mikrokit](./assets/public/tech-stack-830x100.png?raw=true) &nbsp;&nbsp; -->

---

_License: [MIT](./LICENSE)_
