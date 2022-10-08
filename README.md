<p align="center">
  <img alt='MikroKit, a mikro kit for Typescript Serverless APIs' src='./assets/public/logox150.png?raw=true'>
</p>
<p align="center">
  <strong>A mikro kit for Typescript Serverless APIs.</strong><br/>
  Built on top of
    <a href='https://www.typescriptlang.org/' target='_blank'>Serverless Framework</a> and
    <a href='https://deepkit.io/' target='_blank'>Deepkit</a>.
</p>

<p align=center>
  <img src="https://img.shields.io/travis/mikrokit/mikrokit.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

## `Why another kit/framework`

Serverless applications have different requirements than conventional server apps.  
With that in mind **MikroKit is designed to build lightweight Apis,**. It is a very opinionated micro framework with simplicity and speed in mind.

## `MikroKit vs Deepkit`

[Deepkit](https://deepkit.io/) is an amazing web framework that brings types to the runtime world, it is a full batteries included
and enterprise grade framework (Web Framework, ORM, HTTP, RPC, Dependency Injection, etc).
MikroKit uses only the core `runtime types` library from deepkit to produce a minimal framework oriented for serverless Apis.

## `Opinionated`

MikroKit opinions might not always be the best but are taken with quick development and fast code execution in mind.

- Convention over configuration.
- Prioritizes developer friendliness and performance over existing conventions.
- Integrating Routing + Data Mapping requires a tight coupling between the two parts (Aka the MikroKit way).

## `Features`

1. [AWS & Serverless framework](https://www.serverless.com/) for your cloud infrastructure
1. [AWS Cognito](https://aws.amazon.com/cognito/) for user management, sign up emails, password reset, etc
1. RPC like
1. File Based Routing
1. JWT Authentication
1. [Postgress.js](https://github.com/porsager/postgres) for DataBase access.
1. Access Control List _<sup>(linux-like)</sup>_
1. Automatic CRUD operations
1. Automatic Validation and Serialization
1. Typescript client

## `RPC like`

ApisDS uses **Remote Procedure Call** style routing, unlike traditional REST apis it
does not use `GET`, `PUT`, `POST` and `DELETE` methods, everything is transmitted using `HTTP POST` method.

Please have a look to this great Presentation for more info about each different type of API and the pros and cons of each one:  
[Nate Barbettini – API Throwdown: RPC vs REST vs GraphQL, Iterate 2018](https://www.youtube.com/watch?v=IvsANO0qZEg)

**`Requests & Responses`**

- Requests are made using only `HTTP POST` method.
- Data is sent and received only in the `HTTP BODY`.
- Data is sent and received only in `JSON` format.

**`RPC VS REST Requests`**

| RPC                                                      | REST                                             | Description     |
| -------------------------------------------------------- | ------------------------------------------------ | --------------- |
| `POST http://myapi.com/users/getByID`<br>`BODY {"id":1}` | `GET http://myapi.com/users/1`<br>`BODY NONE`    | get user by id  |
| `POST http://myapi.com/users/create`<br>`BODY EMPTY`     | `POST http://myapi.com/users`<br>`BODY NONE`     | create new user |
| `POST http://myapi.com/users/delete`<br>`BODY {"id":1}`  | `DELETE http://myapi.com/users/1`<br>`BODY NONE` | delete user     |
| `POST http://myapi.com/users/getAll`<br>`BODY EMPTY`     | `GET http://myapi.com/users` <br>`BODY NONE`     | get All users   |

## `FILE BASED ROUTING`

Routing is based in the file system, generated URLs match the `file path` + `method name` pattern.  
More info about the router [here](./packages/router/).

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

## `Quick start`

Install MikroKit cli.

```sh
npm install mikrokit
```

To create your first project.

```sh
npx degit https://github.com/mikrokit/mikrokit-strater
```

## `CLI`

```shell
## generate Open Api spec files
npx mikrokit g openApi

## generate Api browser client (typescript)
npx mikrokit g apiClient


## generate all artifacts in one go (api spec, types and server files)
npx apisds g
```

## `Contributing`

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

## &nbsp;

_Powered by:_

![aws, deepkit, serverless, postgress.js, mikrokit](./assets/public/tech-stack-830x100.png?raw=true) &nbsp;&nbsp;

_License: [MIT](./LICENSE)_
