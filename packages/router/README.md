<p align="center">
  <img alt='API DS, The APi Dashboard' width="" src='../../assets/public/bannerx90.png?raw=true'>
</p>
<p align="center">
  <strong>File based router for
    <a href='../..' >ApiDs</a> and
    <a href='https://www.fastify.io/' target='_blank'>Fastify</a>.
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/travis/apids/apids.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

&nbsp;&nbsp;&nbsp;&nbsp;

# `@apids/router`

This router follows the ApiDS design pattern where all requests are made using `HTTP POST` and all the required data is sent in the `HTTP Request Body`, so there are no dynamic parameters in the url.

Static analysis is used to generate the routes and the required schemas for automatic [validation & serialization](https://www.fastify.io/docs/latest/Validation-and-Serialization/).

### `ROUTES`

Routes are defined using the `file path` + `export method name`, the file extension gets removed from the path.  
An error will be thrown If the file name contains non safe URL characters <sup>(`encodeURI(path) !== path`)</sup>.

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

### `DECLARING ROUTES USING EXPORTS`

All the [named exports](https://www.typescriptlang.org/docs/handbook/modules.html#export) from a module are interpreted as a route.
The exported functions must be of the type [`ApiRoute`](./src/types.ts). It's also possible to export objects of the type [`ApiRouteOptions`](./src/types.ts) similar to [`fastify.route(options)`](https://www.fastify.io/docs/latest/Routes/#options) except the `method` and `url` are not configurable.  
Any exported property that does not match the types of `ApiRoute` or `ApiRouteOptions` will cause an error during the routes generation.

// TODO: [default export](https://www.typescriptlang.org/docs/handbook/modules.html#default-exports) is used to export an plain object with multiple routes.

**Route declaration using a function:**

```ts
// we can't declare the correct ApiRoute type so is more prone to errors
// we also need to declare the types of all the parameters and the return types
export function sayHello(
  body: Request,
  data: ApiDS,
  req: FastifyRequest,
  reply: FastifyReply,
): Response {
  return {sentence: `hello`};
}
```

**Route declaration using arrow functions:** <sup>(Preferred Method)</sup>

```ts
import {ApiRoute} from '@apids/router/src/types';

// correct ApiRoute type is declared so no need to re-declare parameters and return types
export const sayHello2: ApiRoute<Request, Response> = (
  body,
  data,
  req,
  reply,
) => ({sentence: `hello`});
```

**Route declaration using ApiRouteOptions object:**

```ts
import {ApiRouteOptions} from '@apids/router/src/types';
// ApiRouteOptions is a wrapper for Fastify Route Options
// correct ApiRouteOptions type is declared so no need to re-declare parameters and return types
export const sayHello3: ApiRouteOptions<Request, Response> = {
  handler: (body, data, req, reply) => ({sentence: `hello`}),
  version: '1.0.0',
  logLevel: 'debug',
};
```

&nbsp;&nbsp;&nbsp;&nbsp;

### `AUTOMATIC VALIDATION & SERIALIZATION USING TYPES`

Fastify uses Json Schemas for automatic [validation & serialization](https://www.fastify.io/docs/latest/Validation-and-Serialization/).  
The `Request` and `Response` types of each route <sup>(`ApiRoute<Request, Response>`)</sup> are evaluated and a JSON schema is generated and added to fastify so http request and responses are automatically validated.  
[`vega/ts-json-schema-generator`](https://github.com/vega/ts-json-schema-generator) is used to transform the types into Json Schemas.

```ts
// file: api/users.ts
import {ApiRoute} from '@apids/router/src/types';

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
  // typescript can also catch static type errors
  return {id: body.user_id, name: 'Peter'};
};
```

**Based in the previous code bellow are few valid and invalid `http.request.body` examples:**

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

### `GENERATING FILES`

// TODO ...

```ts
import RouterReader from 'x';

const routes = new RouterReader({
  rootDir: './examples',
  prefix: 'api',
  outDir: '.dist',
});

routes.parse();
routes.save();
```

&nbsp;&nbsp;&nbsp;&nbsp;

## &nbsp;

_[MIT](../../LICENSE) LICENSE_
