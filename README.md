<p align="center">
  <img alt='API DS, The APi Dashboard' src='./assets/public/logox150-inverse.png?raw=true'>
</p>
<p align="center">
  <strong>API DS is a new way of building APIs based on
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

`Routing`

1. NO REST
1. NO CORS
1. Opinionated
1. File System Based Routing
1. Request Merging
1. Serverless ready
1. JWT Authentication
1. Automatic typescript client generation

`Data`

1. Database Mapping
1. Automatic CRUD operations
1. Automatic Schema Validation
1. Access Control List _<sup>(linux-like)</sup>_

&nbsp;&nbsp;&nbsp;&nbsp;

## `NOT A REST FRAMEWORK`

ApisDS does not uses `GET`, `POST`, `PUT` or `DELETE` request like traditional REST APIS.

**All http request to the API are made using the `POST` method and all the required data is sent in the url or http body.**

ApiDS routing is based in the file system, so the URL in the request must also match the file system.

`Example: get user by id = 01`

```js
//file:  api/user/index.ts

@path('/:id')
export async getUser(req: Req, users: UserEntity) {
  const id = req.url.params.id;
  const user = await users.get(id);
  return user;
}
```

```
# HTTP REQUEST
URL: https://my.api.com/api/user/getUser/01
Method: POST

# HEADERS
Accept: text/plain
Content-Type: text/plain

# BODY
{
  "headers" : {
    "Authorization": "Bearer <token>"
  },
  "version" : 1.0
}

```

&nbsp;&nbsp;&nbsp;&nbsp;

## `NO CORS MODE`

> Cross-Origin Resource Sharing [(CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) is a pain in the \*\*\* for developers.  
> Is a security model designed for web 1.0 where the expected response from the server was html instead the json data from the api.
>
> **ApiDS has ditch CORS completely!**

When no CORS mode is enabled ApiDS enforces [simple http requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#simple_requests), thee are `POST` or `GET` requests, with only browser default headers, and text/plain content-type.  
All data required for the API to work including authentication credentials and query data is sent in the http body.

&nbsp;&nbsp;&nbsp;&nbsp;

## `OPINIONATED`

- **Convention over configuration**
- **Prioritizes developer friendliness and performance over existing conventions.**

Some features like persistence data mapping, default crud operations and User-Group ACL requires to structure the data in an **opinionated way**

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

You are welcome to open issues and pull request! 👍

**Monorepo:**  
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

**ESLint and Prettier:**  
All pull request must pass ESLint and [Prettier](https://github.com/prettier/prettier) before being merged.  
Run bellow command to automatically format all typescript files and check Lint errors.

```sh
npm run format && npm run lint
```

**Build:**

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
