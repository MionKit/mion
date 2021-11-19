<p align="center">
  <img alt='API DS, The APi Dashboard' src='./assets/public/logox150.png?raw=true'>
</p>
<p align="center">
  <strong>The quick way of building APIs based on
    <a href='https://www.typescriptlang.org/' target='_blank'>Typescript</a> and
    <a href='https://www.fastify.io/' target='_blank'>Fastify</a>.
  </strong>
</p>

<p align=center>
  <img src="https://img.shields.io/travis/apids/apids.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

&nbsp;&nbsp;&nbsp;&nbsp;

## `FEATURES`

**`Routing`**

1. RPC API _<sup>(No REST)</sup>_
1. File System Based Routing
1. Opinionated
1. Simple HTTP Requests
1. Serverless ready
1. JWT Authentication
1. Automatic typescript client generation
1. Access Control List _<sup>(linux-like)</sup>_

**`Data`** (under review, maybe integration with [prisma](https://www.prisma.io/) is a better alternative)

1. Database Mapping
1. Automatic CRUD operations
1. Automatic Schema Validation

&nbsp;&nbsp;&nbsp;&nbsp;

## `RPC API`

ApisDS uses **Remote Procedure Call** style routing, it is not like traditional REST apis and
does not use `GET`, `PUT` or `DELETE` methods. Have a look to this great Presentation for more info about each different type of APIs:  
[Nate Barbettini – API Throwdown: RPC vs REST vs GraphQL, Iterate 2018](https://www.youtube.com/watch?v=IvsANO0qZEg)

**`Requests & Responses`**

- Requests are made using only `HTTP POST` method.
- Data is send and recieved only in the `HTTP BODY`.
- Data is send and received only in `JSON` format.

This is quite strict but is a tradeof for simplicity and performance.

**`RPC VS REST Requests`**

| RPC                                                      | REST                                             | Descriotion     |
| -------------------------------------------------------- | ------------------------------------------------ | --------------- |
| `POST http://myapi.com/users/getByID`<br>`BODY {"id":1}` | `GET http://myapi.com/users/1`<br>`BODY NONE`    | get user by id  |
| `POST http://myapi.com/users/create`<br>`BODY EMPTY`     | `POST http://myapi.com/users`<br>`BODY NONE`     | create new user |
| `POST http://myapi.com/users/delete`<br>`BODY {"id":1}`  | `DELETE http://myapi.com/users/1`<br>`BODY NONE` | delete user     |
| `POST http://myapi.com/users/getAll`<br>`BODY EMPTY`     | `GET http://myapi.com/users` <br>`BODY NONE`     | get All users   |

&nbsp;&nbsp;&nbsp;&nbsp;

## `FILE SYSTEM BASED ROUTING`

Routing is based in the file system, URLs must match the `file path` + `method name`, (more info about the router [here](./packages/router/)).

**`File`**

```js
// file:  api/user/index.ts
// or file:  api/user.ts

export async getUser(body: Body, db: DB) {
  const id = body.user.id;
  const user = await db.users.get(id);
  return user;
}
```

**`Request`**

```
# HTTP REQUEST
URL: https://my.api.com/api/user/getUser
Method: POST

# HEADERS
Accept: application/json
Content-Type: application/json

# BODY
{
  "Authorization": "Bearer <token>"
  "version" : 1.0,
  "user" : {
    "id" : 1
  }
}

```

&nbsp;&nbsp;&nbsp;&nbsp;

## `SIMPLE HTTP REQUESTS` <small>(Uder review - This needs a securty audit if implemented)</small>

[Simple http requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#simple_requests), are request that does not trigguer a CORS preflight request, therefore increasing the application performance.  
When a simple http request mode is enabled the server response will be sent as content-type: text/plain instead json, therefore metting all the critea for a simple http request.

Please be carefull enabling this feature and only use it for autheticated requests. It is also recomened to disallow yuur app from bein embeding as iframe using the [`X-Frame-Options: SAMEORIGIN`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options) policy.
All data required for the API to work including authentication credentials and query data is sent in the http body.

&nbsp;&nbsp;&nbsp;&nbsp;

## `OPINIONATED`

- Convention over configuration.
- Prioritizes developer friendliness and performance over existing conventions.
- Integrate Routing + Data Mapping requires a tight coupling between the two parts (Aka the ApiDS way).

&nbsp;&nbsp;&nbsp;&nbsp;

## `QUICK START`

Install API DS cli.

```sh
npm install apids
```

To create your first project.

```sh
npx degit https://github.com/apids/apids-strater
```

&nbsp;&nbsp;&nbsp;&nbsp;

## `CLI`

```shell
## generate Open Api spec files
npx apids g openApi

## generate Api browser client (typescript)
npx apids g apiClient

## generate Fastify server files
npx apids g fastify

## generate all artifacts in one go (api spec, types and server files)
npx apisds g
```

&nbsp;&nbsp;&nbsp;&nbsp;

## `CONTRIBUTING`

The software is provided as it is without guarantees. If you want something done you are welcome to open issues and pull request! 👍 🎊 🎉

**`Monorepo:`**

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

**`ESLint and Prettier:`**

All pull request must pass ESLint and [Prettier](https://github.com/prettier/prettier) before being merged.  
Run bellow command to automatically format all typescript files and check Lint errors.

```sh
npm run format && npm run lint
```

**`Build:`**

```
npm run build
```

&nbsp;&nbsp;&nbsp;&nbsp;

## &nbsp;

_Powered by:_

![node.js](./assets/other_logos/node.png?raw=true) &nbsp;&nbsp;
![Typescript](./assets/other_logos/ts.png?raw=true) &nbsp;&nbsp;
![Open Api](./assets/other_logos/open-api.png?raw=true) &nbsp;&nbsp;
![Fastify](./assets/other_logos/fastify.js.png?raw=true) &nbsp;&nbsp;

_License: [MIT](./LICENSE)_
