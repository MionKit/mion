<p align="center">
  <img alt='MikroKit, a mikro kit for Typescript Serverless APIs' src='./assets/public/logox150.png?raw=true'>
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

**MikroKit vs [Deepkit](https://deepkit.io/)**

Mikrokit is inspired by Deepkit, an amazing web framework that brings types to the runtime world, Deepkit is an enterprise grade framework with many features: Web Framework, ORM, HTTP, RPC, Dependency Injection, Admin Dashboard and many more...

MikroKit uses only the core `runtime types` library from deepkit to produce a minimal framework oriented for serverless Apis with all the advantages of runtime types.

## `Opinionated`

MikroKit opinions might not always be the best, but are always taken with quick development and fast code execution and minimum abstractions in mind.
_Simplicity is the best pattern_.

- Convention over configuration.
- Prioritizes developer friendliness and performance over existing conventions.
- Tightly Integrating Routing + Data access (Aka the MikroKit way).

## `Features`

1. [AWS & Serverless framework](https://www.serverless.com/) for your cloud infrastructure
1. [AWS Cognito](https://aws.amazon.com/cognito/) for user management, sign up emails, password reset, etc
1. RPC Like Routing
1. [Postgres.js](https://github.com/porsager/postgres) for quick DataBase access with great support for types.
1. Base Models with Automatic CRUD operations
1. Automatic Validation and Serialization
1. Access Control List _<sup>(linux-like)</sup>_
1. Typescript client

## `RPC like`

MikroKit uses **Remote Procedure Call** style routing, unlike traditional REST apis it does not use `GET`, `PUT`, `POST` and `DELETE` methods, everything is transmitted using `HTTP POST` method and absolutely all data is sent/received in the request/response `BODY`.

### Requests & Responses

- Requests are made using only `HTTP POST` method.
- Data is sent and received only in the `HTTP BODY`.
- Data is sent and received only in `JSON` format.

### Rpc VS Rest

| RPC Like Request                                               | REST Request                                            | Description     |
| -------------------------------------------------------------- | ------------------------------------------------------- | --------------- |
| POST `http://myapi.com/users/get`<br>BODY `{"id":1}`           | GET `http://myapi.com/users/1`<br>BODY `NONE`           | Get user by id  |
| POST `http://myapi.com/users/create`<br>BODY `{"name":"John"}` | POST `http://myapi.com/users`<br>BODY `{"name":"John"}` | Create new user |
| POST `http://myapi.com/users/delete`<br>BODY `{"id":1}`        | DELETE `http://myapi.com/users/1`<br>BODY `NONE`        | Delete user     |
| POST `http://myapi.com/users/getAll`<br>BODY `NONE`            | GET `http://myapi.com/users` <br>BODY `NONE`            | Get All users   |

Please have a look to this great Presentation for more info about each different type of API and the pros and cons of each one:  
[Nate Barbettini – API Throwdown: RPC vs REST vs GraphQL, Iterate 2018](https://www.youtube.com/watch?v=IvsANO0qZEg)

## `Routing`

Blazing fast router **based in module Imports**. Thanks to the rpc style there is no need for parameters or regular expression parsing when finding a route, just a simple object in memory with all the routes on it, can't get faster than that.

All data is transmitted in the body, so data that is traditionally send via HTTP headers (like Authorization tokens), is send in the body. _Headers are supposed to be data for/by the server/browser and should not be used in Application level_, this also could prevent some problems with proxies and generate some problem with some other software that relies in headers (0Auth etc).

Routes are just defined using a plain javascript object, where every field is a route, so this also eliminates naming collisions. All data from the Application is sent/returned in the `data` field.  
More info about the router [here](./packages/router/).

MikroKit uses deepkit to automatically [validate](https://docs.deepkit.io/english/validation.html) the data send in the request and [serialize](https://docs.deepkit.io/english/serialization.html) the data send in the response.

### Example:

```js
import {mikroKitRouter} from '@mikrokit/router';
import {getPet} from './api/petRoutes';

interface User {
  id: number;
  name: string;
}

const getUser = async (user: User) => {
  const user = await db.users.get(user.id);
  return user;
};

const options = {
  version: 1,
  prefix: 'api/v1/',
};

const routes = {
  users: {
    getUser, // api/users/getUser
  },
  pets: {
    getPet, // api/pets/getPet
  },
};

mikroKitRouter.addRoutes(routes, options);
```

### Request

```
# HTTP REQUEST
URL: https://my.api.com/api/v1/users/getUser
Method: POST

# HEADERS
Accept: application/json

# BODY
{
  "Authorization": "Bearer <token>"
  "data: {
    "id" : 1
  }
}
```

### Response

```
# HTTP RESPONSE
URL: https://my.api.com/api/v1/users/getUser

# HEADERS
Content-Type: application/json; charset=utf-8

# BODY
{
  "version" : 1,
  "type" : "User",
  "data: {
    "id" : 1,
    "name" : "John"
  }
}
```

## `Quick start`

Install MikroKit cli.

```sh
npm install mikrokit
```

To create your first project.

```sh
npx degit https://github.com/mikrokit/mikrokit-base
```

## `CLI`

```shell
## generate Open Api spec files
npx mikrokit g openApi

## generate Api browser client (typescript)
npx mikrokit g apiClient


## generate all artifacts in one go (api spec, types and server files)
npx mikrokit g
```

## `Contributing`

The software is provided as it is without guarantees. If you want something done you are welcome to open issues and pull request! 👍 🎊 🎉

**_Monorepo_**

This project is a monorepo managed using [lerna](https://lerna.js.org/) and npm [workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces). (`npm >= 7` required)

```sh
npm i lerna -g
```

Each package within this monorepo is compiled using and tested individually using typescript and [jest](https://jestjs.io/).

```sh
cd packages/<my_api_ds_package>

## compiles typescript
npm run dev

## run jest unit tests
npm run dev:test
```

### ESLint and Prettier

All pull request must pass ESLint and [Prettier](https://github.com/prettier/prettier) before being merged.  
Run bellow command to automatically format all typescript files and check Lint errors.

```sh
npm run format && npm run lint
```

### Build

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
