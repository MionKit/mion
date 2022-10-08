<p align="center">
  <img alt='MikroKit, The APi Dashboard' width="" src='../../assets/public/bannerx90.png?raw=true'>
</p>
<p align="center">
  <strong>File based router for
    <a href='../..' >MikroKit</a> and
    <a href='https://www.fastify.io/' target='_blank'>Fastify</a>.
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/travis/mikrokit/mikrokit.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

&nbsp;&nbsp;&nbsp;&nbsp;

# `@mikrokit/router`

This router follows the **MikroKit RPC** pattern.

**`Requests & Responses`**

- Requests are made using only `HTTP POST` method.
- Data is send and recieved only in the `HTTP BODY`.
- Data is send and received only in `JSON` format.

A compiling step is used to analyze all your src files and generate a single typescript files containing al the api routes and a single json file containing schemas required for automatic [validation & serialization](https://www.fastify.io/docs/latest/Validation-and-Serialization/).
Once these two files are generated they can be used an imported normaly into your [fastify](https://www.fastify.io/) server.

## `ROUTES`

Routes are defined using the `file path` + `method name`, the file extension gets removed from the path.  
An error will be thrown durin compile time If the file name contains non safe URL characters `encodeURI(path) !== path`.

```ts
// file: api/index.ts

// fastify route: api/sayHello
export function sayHello(body: RequestSchema): ReplySchema {
  return {sentence: `Hello to ${body.name}`};
}
```

```ts
// file: api/users.ts

// fastify route: api/users/getById
export function getById(body: Req): User {
  return {id: body.id, name: 'Peter'};
}

// fastify route: api/users/getAll
export const getAll: ApiRoute<Req, Resp> = (body, ds) => ds.users.getAll();
```

&nbsp;&nbsp;&nbsp;&nbsp;

## `DECLARING ROUTES USING EXPORTS`

Routes are declared using the [default](https://www.typescriptlang.org/docs/handbook/modules.html#default-exports) or [named](https://www.typescriptlang.org/docs/handbook/modules.html#export) exports and must be of the type [`ApiRoute`](./src/types.ts) or [`ApiRouteOptions`](./src/types.ts). The default export is an object with multiple routes.

The [`ApiRouteOptions`](./src/types.ts) object is similar to the options object in [`fastify.route(options)`](https://www.fastify.io/docs/latest/Routes/#options) except `method` and `url` are not configurable.

Any exported property that does not match the type of `ApiRoute` or `ApiRouteOptions` will cause an error during compilation.

**`Using default and named exports:`**

```js
import {ApiRoutes, ApiRoute} from '@mikrokit/router/src/types';

// declaring routes using default export
const route1: ApiRoute<Request1, Response1> = () => {...};
const route2: ApiRoute<Request2, Response2> = () => {...};
export default const routes: ApiRoutes = {
  route1,
  route2,
}

// declaring a route using named export
export const route3: ApiRoute<Request3, Response3> = () => {...};
```

**`Route declaration using ApiRoute:`**

```ts
import {ApiRoute} from '@mikrokit/router/src/types';
interface Request {
  name: string;
}
interface Reply {
  sentence: string;
}

// when adding ApiRoute type all parameters from the function call are automatically infered by typesctipt
export const sayHello2: ApiRoute<Request, Reply> = (body: Request, db: MikroKit, request: FastifyRequest, reply: FastifyReply) => ({
  sentence: `hello ${body.name}`,
});
```

**`Route declaration using ApiRouteOptions:`**

```ts
import {ApiRouteOptions} from '@mikrokit/router/src/types';
interface Request {
  name: string;
}
interface Reply {
  sentence: string;
}

// ApiRouteOptions is a wrapper for Fastify Route Options
export const sayHello3: ApiRouteOptions<Request, Reply> = {
  handler: (body: Request, db: MikroKit, request: FastifyRequest, reply: FastifyReply) => ({sentence: `hello ${body.name}`}),
  version: '1.0.0',
  logLevel: 'debug',
};
```

&nbsp;&nbsp;&nbsp;&nbsp;

## `AUTOMATIC VALIDATION & SERIALIZATION USING TYPES`

Fastify uses Json Schemas for automatic [validation & serialization](https://www.fastify.io/docs/latest/Validation-and-Serialization/).

During compilation you can pass a directory containing all schemas `schemasDir` and MikroKit will evaluate the `Request` and `Response` types of each route <sup>(`ApiRoute<Request, Response>`)</sup> and use it's corresponding schema for automatic validation and serialization. Alternatively you can manually add scehmas and define the schemas for each route as you would [normally do in fastify](https://www.fastify.io/docs/latest/Validation-and-Serialization/).

**`schema definition`**

```ts
import {ApiRouteOptions} from '@mikrokit/router/src/types';
interface User {
  name: string;
}
interface HelloReply {
  sentence: string;
}

export const sayHello: ApiRouteOptions<User, HelloReply> = {
  handler: () => ({sentence: `hello ${body.name}`}),
  schema: {
    body: {$ref: '#other-user'}, // would use #other-user schema instead #user
    response: {$ref: '#other-hello-reply'}, // would use #other-hello-reply schema instead #hello-reply
  },
};
```

You can use [`vega/ts-json-schema-generator`](https://github.com/vega/ts-json-schema-generator) to automatically generate the schemas from your Typescript files.

**`Validation example`**

```ts
// file: api/users.ts
import {ApiRoute} from '@mikrokit/router/src/types';

interface Request {
  user_id: number;
}

interface User {
  id: number;
  name: string;
  surname: string;
}

export const getById: ApiRoute<Request, User> = (body) => {
  return {id: body.user_id, name: 'Peter', surname: 'Smith'};
};

export const getById2: ApiRoute<Request, User> = (body) => {
  // throws a serialization error (server error) as 'surname' is missing
  return {id: body.user_id, name: 'Peter'} as any;
};
```

**`Validation results`**

```http
# HTTP REQUEST
URL: https://my.api.com/api/users/getById
Method: POST

# VALID BODY
{"user_id" : 1}

# INVALID BODY (user_id is not a number)
{"user_id" : "1"}

# INVALID BODY (missing parameter user_id)
{"user_id" : "1"}
```

&nbsp;&nbsp;&nbsp;&nbsp;

## `COMPILING ROUTES`

The `RouterCompiler` reads the `srcDir` where all the route definitions are located and generates a single typescript file containing all routes and a single json file containing all the schemas for validation and serialization.

```ts
import {routerCompiler} from 'x';

const compiler = routerCompiler({
  srcDir: './examples',
  schemasDir: './examples',
  apiUrlPrefix: 'api',
  outFile: '.dist/api.ts',
});

compiler.parse();
compiler.save();
```

## &nbsp;

_[MIT](../../LICENSE) LICENSE_