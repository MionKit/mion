<p align="center">
  <img alt='MikroKit, a mikro kit for Typescript Serverless APIs' src='./assets/public/logo.svg?raw=true' width="403" height="150">
</p>
<p align="center">
  <strong>Typescript Apis at the speed of light 🚀</strong><br/>.
</p>

<p align=center>
  <img src="https://img.shields.io/travis/mikrokit/mikrokit.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

## `Why another framework`

1. Serverless applications have different requirements than conventional server apps.
2. There are not yet many frameworks that offers type safe apis with automatic validation and serialization out of the box.

With that in mind **MikroKit is designed to quickly build lightweight Apis**. It is a very opinionated and lightweight framework with simplicity, and developer experience in mind.

## `Features`

<!-- 1. [AWS & Serverless framework](https://www.serverless.com/) for cloud infrastructure
1. [AWS Cognito](https://aws.amazon.com/cognito/) for Authentication, sign up emails, password reset, etc -->

- ✅ RPC Like [Router](packages/router/README.md)
- ✅ Automatic Validation and Serialization
<!-- - 🛠️ [Postgres.js](https://github.com/porsager/postgres) for quick DataBase access with great support for types, (No DataBase access abstraction).
- 🛠️ Base Models with CRUD & Filters operations
- 🛠️ Access Control List _<sup>(linux-like)</sup>_ -->
- ✅ AWS Lambda [Handler](packages/serverless/README.md)
- ✅ Http [Server](packages/http/README.md)
- 🛠️ Automatic Typescript client generation.

## Typia vs deepkit

[typia](https://typia.io/) is a validation library that offers similar validation features as deepkit.

After using deepkit for a while there are some things i dnt like too much, like weird kirks like not being able to use reflection when importing interfaces or types, only works with classes. quite a bit delay in supporting lattest versions of TS, direction and popularity of the library.

A big drawback is that when using ncc compiler to reduce the size of the deployed package for serverless env it includes the whole tsc library and resulting file is quite big.

\*\*The intent of the feature branch is to try using typia for automattic validation instead deepkit.

Pros of typia:

- AOT compilation so probably reduced size of final artifact to deploy to serverless
- hopefully better support for latest ts version as it offers less features and reflection than deepkit

Cons of typia:

- deepkit offers full reflection not only validation so a whole new set of features could be used instead just validation

## `Opinionated`

**MikroKit is oriented towards** a very specific scenario, that is **Apis that works with json data only**. MikroKit architecture might not always be the best or suit every scenario, but are always taken with quick development, lightweight execution and minimum abstractions in mind. **_!Simplicity can be the best pattern!_**

- Convention over configuration.
- Prioritizes developer experience and performance over existing conventions.
- Lightweight by design. [Some benchmarks here!](https://github.com/MikroKit/benchmarks) 🚀
<!-- - Tightly Integration between Routing + Data (Aka the MikroKit way). -->

#### !! MikroKit is currently under heavy development

<!-- ### Automatic Validation and Serialization

MikroKit uses `@deepkit/type` library from [Deepkit](https://deepkit.io/) to bring types to the runtime world. This opens a new world of possibilities. Please check Deepkit's documentation for installation, validation and serialization instructions. -->

## `RPC like`

Here is where MikroKit starts to deviate from traditional frameworks. [The router](./packages/router/README.md) uses a **Remote Procedure Call** style routing, unlike traditional routers it does not use `GET`, `PUT`, `POST` and `DELETE` methods, everything is transmitted using `HTTP POST` method and all data is sent/received in the request/response `body` and `headers`.

### Requests & Responses

- Requests are made using only `HTTP POST` method.
- Data is sent and received only in the `body` and `headers`.
- Data is sent and received only in `JSON` format.

### Rpc VS Rest

Please have a look to this great Presentation for more info about each different type of API and the pros and cons of each one:  
[Nate Barbettini – API Throwdown: RPC vs REST vs GraphQL, Iterate 2018](https://www.youtube.com/watch?v=IvsANO0qZEg)

## `Routing`

🚀 Lightweight and fast router.

Thanks to it's RPC style there is no need to parse parameters or regular expressions when finding a route. Just a simple [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) in memory containing all the routes. Can't get faster than that.

`Route parameters` are passed as an array in the request body, in a field with the same name as the route. Elements in the array must have the same order as the function parameters.

`Route response` is send back in the body in a field with the same name as the route.

The reason for this naming is to future proof the router to be able to accept multiple routes on a single request. However this can be changed setting the `routeFieldName` in the router options.

[Please read full router documentation here! 📗](./packages/router/README.md)

### Example:

```js
// packages/router/examples/routes-definition.routes.ts

import {setRouterOptions, registerRoutes} from '@mikrokit/router';

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

## `Automatic Serialization & Validation`

Mikrokit uses [Deepkit's runtime types](https://deepkit.io/) for automatic [validation](https://docs.deepkit.io/english/validation.html) and [serialization/deserialization](https://docs.deepkit.io/english/serialization.html). Thanks to Deepkit's magic the type information is available at runtime and the data can be auto-magically Validated and Serialized.

Runtime types allow for a completely new set of capabilities. Please check Deepkit's documentation for install instructions and more information:

- Request [Validation](https://docs.deepkit.io/english/validation.html)
- Response/Request [Serialization/Deserialization](https://docs.deepkit.io/english/serialization.html)

#### Request Validation examples

<table>
<tr><th>Code</th><th>POST Request <code>/users/getUser</code></th></tr>
<tr>
<td>

```ts
// packages/router/examples/get-user-request.routes.ts

import {registerRoutes, initRouter} from '@mikrokit/router';
import type {User} from 'MyModels';

const getUser = async (app, ctx, entity: {id: number}): Promise<User> => {
  const user = await ctx.db.getUserById(entity.id);
  return user;
};

const routes = {
  users: {
    getUser, // api/users/getUser
  },
};

export const apiSpec = registerRoutes(routes);
```

</td>
<td>

```yaml
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

[Type Inference](https://www.typescriptlang.org/docs/handbook/type-inference.html) is not supported, `parameter types` and `return types` must be explicitly defined, so they are correctly validated/serialized.

🚫 Invalid route definitions!

```ts
const myRoute1 = () => {};
const myRoute2 = () => null;
const sayHello = (context, name) => `Hello ${name}`;
const getYser = async (context, userId) => context.db.getUserById(userId);
```

✅ Valid route definitions!

```ts
const myRoute1 = (): void {};
const myRoute2 = (): null => null;
const sayHello = (context: Context, name:string): string => `Hello ${name}`;
const getYser = async (context: Context, userId:number): Promise<User> => context.db.getUserById(userId);
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
