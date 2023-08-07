<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png">
    <img alt='mion, a mikro kit for Typescript Serverless APIs' src='https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png'>
  </picture>
</p>
<p align="center">
  <strong>RPC Like router with automatic Validation and Serialization.
  </strong>
</p>
<p align=center>

  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mion/router`

🚀 Lightweight and fast HTTP router with automatic validation and serialization out of the box.

Thanks to it's RPC routing style is quite performant as there is no need to parse URLs or match regular expressions when finding a route. Just a direct mapping from url to the route handler.

mion Router uses a **Remote Procedure Call** style routing, unlike traditional routers it does not rely on `GET`, `PUT`, `POST`, or any other http method to to identify the route. The router only supports sending/receiving data as json in the body or in http headers. No query params support or any other xml or data formats other than json.

These architectural limitations make it suitable for modern APIs and grants some advantages over other routers that need to support many more features.

### Rpc Like VS Rest

We explicitly mention **RPC like** as the router is still designed to work over Http while providing some advantages that are not possible when using REST apis.

- Type Safety
- Less complexity
- Better integration between client and server
- Better developer experience

Please have a look to bellow great Presentation for more info about each different type of API and the pros and cons of each one: [Nate Barbettini – API Throwdown: RPC vs REST vs GraphQL](https://www.youtube.com/watch?v=IvsANO0qZEg)

## `Routes`

Routes are just regular functions, the first parameter is always the `call context`, the rest of parameters are sent from remote clients. Route names are defined using a plain javascript object, where every property of the object is the route's name.

Params are automatically serialized and validated from typescript, no other extra steps required or need to declare schemas or any other validation library. **Types are your schema!**

mion only cares about the `url.path`, and completely ignores the http method, so in theory request could be made using `POST`, `PUT`, `GET`, or the router could be used in any event driven environment where the concept of method does not exist.

```ts
// examples/routes-definition.routes.ts

import {registerRoutes, Routes, initRouter} from '@mionkit/router';

const sayHello = (ctx, name: string): string => {
  return `Hello ${name}.`;
};

const sayHello2 = {
  route(ctx, name1: string, name2: string): string {
    return `Hello ${name1} and ${name2}.`;
  },
};

const routes = {
  sayHello, // api/sayHello
  sayHello2, // api/sayHello2
} satisfies Routes;

initRouter({prefix: 'api/'});
export const apiSpec = registerRoutes(routes);
```

Using javascript names helps keeping route names simple, it is not recommended to use the array notation to define route names. no url decoding is done when finding the route

```ts
// examples/no-recommended-names.routes.ts

import {Routes, registerRoutes} from '@mionkit/router';

const sayHello = (ctx, name: string): string => {
  return `Hello ${name}.`;
};

const routes = {
  'say-Hello': sayHello, // api/say-Hello  !! NOT Recommended
  'say Hello': sayHello, // api/say%20Hello  !! ROUTE WONT BE FOUND
} satisfies Routes;

export const apiSpec = registerRoutes(routes);
```

## `Hooks`

Hooks are simply auxiliary functions that get executed before or after a route gets executed. We call them hooks because they are functions that get hooked into the execution path of a route.

Hooks are useful when a route might require some extra data like authorization, preconditions, logging, or some processing like body parsing, etc...  
Multiple Hooks can be executed but only a single Route will be executed per remote call.

Hooks can use `context.shared` to share data with other routes and hooks. The return value from a hook will be ignored unless `canReturnData` is set to true, in that case the returned value will be serialized in and sent back in the response body.

```ts
// examples/hooks-definition.routes.ts

import {CallContext, HookDef, registerRoutes} from '@mionkit/router';
import {myApp} from './myApp';

const logger = {
  // ensures logger is executed even if there are errors in the route or other hooks
  forceRunOnError: true,
  hook: async (ctx: CallContext): Promise<void> => {
    const hasErrors = ctx.request.internalErrors.length > 0;
    if (hasErrors) await myApp.cloudLogs.error(ctx.path, ctx.request.internalErrors);
    else myApp.cloudLogs.log(ctx.path, ctx.shared.me.name);
  },
} satisfies HookDef;

registerRoutes({
  // ... other routes and hooks
  logger, // logs things after all other hooks and routes are executed
});
```

#### Header Hooks

In cases were the data is received/sent in the headers a 'Header Hook' can be used. this kind of hooks are limited to one parameter besides the context and must be `string`, `number` or `boolean` as no other kind of data is allowed in headers.

When using a header hook [Soft Type Conversion](https://docs.deepkit.io/english/serialization.html#serialisation-loosely-convertion) is used, this means strings like '1' , '0', 'true', 'false'
will be converted to `boolean` and numeric strings like '5' , '100' will be converted to a `number`.

```ts
// examples/hooks-header-definition.routes.ts

import {HeaderHookDef, registerRoutes} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const auth = {
  /* headerName is optional,
   * if not declared would use the name of the variable when registering routes
   * in this case it would be 'auth' */
  headerName: 'Authorization',
  headerHook: async (ctx, token: string): Promise<void> => {
    const me = await getAuthUser(token);
    if (!isAuthorized(me)) throw {code: 401, message: 'user is not authorized'};
    ctx.shared.auth = {me}; // user is added to ctx to shared with other routes/hooks
  },
} satisfies HeaderHookDef;

registerRoutes({
  auth,
  // ... other routes and hooks. If auth fails they wont get executed
});
```

#### Raw Hooks

In cases where it is required to access the raw underlying request and response it is possible to use a `Raw Hook`. These are functions that receive the `CallContext` , `RawRequest` , `RawResponse` and `RouterOptions`, but can't receive extra parameters or return any data, they can only modify the CallContext and return or throw errors. This could be considered equivalent to a @middleware in some other frameworks.

Raw Hooks are useful to extend the router functionality. I.e: The router [internally uses](./packages/router/src/jsonBodyParser.ts) `Raw Hooks` to parse and stringify the json request and response.

```ts
// examples/hooks-raw-definition.routes.ts

import {CallContext, RawHookDef, registerRoutes} from '@mionkit/router';
import {IncomingMessage, ServerResponse} from 'http';
type HttpRequest = IncomingMessage & {body: any};

// sends a fake progress to the client
const progress = {
  rawHook: async (ctx: CallContext, rawRequest: HttpRequest, rawResponse: ServerResponse): Promise<void> => {
    return new Promise((resolve) => {
      const maxTime = 1000;
      const increment = 10;
      let total = 0;
      const intervale = setInterval(() => {
        if (total >= maxTime) {
          clearInterval(intervale);
          resolve();
        }
        total += increment;
        rawResponse.write(`\n${total}%`);
      }, increment);
    });
  },
} satisfies RawHookDef<any, HttpRequest, ServerResponse>;

registerRoutes({
  progress,
  // ... other routes and hooks
});
```

## Request & Response

`Route parameters` are passed as an Array in the request body or possibly a header, in a field with the same name as the route/hook. Elements in the array must have the same order as the function parameters.

`Route response` is send back in the response body in a field with the same name as the route/hook and contains a tuple [`routeResponse`, `RouteError`].

| Request URL      | Request Body                           | Response Body                                 |
| ---------------- | -------------------------------------- | --------------------------------------------- |
| `/api/sayHello`  | `{"/api/sayHello": ["John"] }`         | `{"/api/sayHello": ["Hello John."]}`          |
| `/api/sayHello2` | `{"/api/sayHello2": ["Adan", "Eve"] }` | `{"/api/sayHello2": ["Hello Adan and Eve."]}` |

The reason for this request/response formats is to directly match each executed function in the server with it's input parameters and response values. This architecture will allow combining multiple request on a single one for future version of the router.

#### Request type

```ts
// src/types.ts#L202-L216

/** Router's own request object, do not confuse with the underlying raw request */
export type Request = {
  /** parsed headers */
  readonly headers: Readonly<Obj>;
  /** parsed body */
  readonly body: Readonly<Obj>;
  /** All errors thrown during the call are stored here so they can bee logged or handler by a some error handler hook */
  readonly internalErrors: Readonly<RouteError[]>;
};

/** Any request used by the router must follow this interface */
export type RawRequest = {
  headers: {[header: string]: string | undefined | string[]} | undefined;
  body: string | null | undefined | {}; // eslint-disable-line @typescript-eslint/ban-types
};
```

#### Response format

The `response.body` contain responses for any hook or route that has been executed, each individual response can be successful or failed, and follows next format:

```js
{
  <routeName>: [routeResponse, RouteError],
  <hookName>: [hookResponse, RouteError],
}
```

- `ReturnValue = response.body[<routeName>][0]`
- `ReturnError = response.body[<routeName>][1]`

Ie: calling the route `/api/sayHello` with an invalid json body would return bellow response 👇

`HTTP 400 Invalid Request`

```json
{
  // mionParseJsonRequestBody is the name of the json parser Raw Hook used internally by mion router
  "mionParseJsonRequestBody": [
    null, // return value is null
    {"statusCode": 400, "name": "Invalid Request", "message": "Wrong request body ..."}
  ]
  // node there is no field `/api/sayHello` in the response as the route never got executed
}
```

Remember: each hook/route is always send/returned in a field with the `hook` or `route` name!

#### Response type

```ts
// src/types.ts#L218-L229

/** Router's own response object, do not confuse with the underlying raw response */
export type Response = {
  readonly statusCode: number;
  /** response errors: empty if there were no errors during execution */
  readonly hasErrors: boolean;
  /** response headers */
  readonly headers: Headers;
  /** the router response data, body should not be modified manually so marked as Read Only */
  readonly body: Readonly<PublicResponses>;
  /** json encoded response, contains data and errors if there are any. */
  readonly json: string;
};
```

## `Execution Path`

The order in which `routes` and `hooks` are added to the router is important as they will be executed in the same order they are defined (Top Down order). An `execution path` is generated for every route.

```ts
// examples/valid-definition-order.routes.ts

import {Routes, registerRoutes} from '@mionkit/router';

// prettier-ignore
const routes = {
    authorizationHook: {hook(): void {}}, // hook
    users: {
        userOnlyHook: {hook(): void {}}, // hook
        getUser: (): null => null, // route: users/getUser
    },
    pets: {
        getPet: (): null => null, // route: users/getUser
    },
    errorHandlerHook: {hook(): void {}}, // hook,
    loggingHook: {hook(): void {}}, // hook,
} satisfies Routes;

export const myValidApi = registerRoutes(routes);
```

#### Execution path for: `users/getUser`

```mermaid
graph LR;
  A(authorizationHook) --> B(userOnlyHook) --> C{{getUser}} --> E(errorHandlerHook) --> D(loggingHook)
```

#### Execution path for: `pets/getPets`

```mermaid
graph LR;
  A(authorizationHook) --> B{{getPet}} --> E(errorHandlerHook) --> C(loggingHook)
```

**_To guarantee the correct execution order of hooks and routes, the properties of the router CAN NOT BE numeric or digits only._**  
An error will thrown when adding routes with `Router.addRoutes`. More info about order of properties in javascript objects [here](https://stackoverflow.com/questions/5525795/does-javascript-guarantee-object-property-order) and [here](https://www.stefanjudis.com/today-i-learned/property-order-is-predictable-in-javascript-objects-since-es2015/).

```ts
// examples/invalid-definition-order.routes.ts

import {Routes, registerRoutes} from '@mionkit/router';

// prettier-ignore
const invalidRoutes = {
    authorizationHook: {hook(): void {}}, // hook
    1: {
        // invalid (this would execute before the authorizationHook)
        userOnlyHook: {hook(): void {}}, // hook
        getUser: (): null => null, // route: users/getUser
    },
    '2': {
        // invalid (this would execute before the authorizationHook)
        getPet: (): null => null, // route: users/getUser
    },
    errorHandlerHook: {hook(): void {}}, // hook,
    loggingHook: {hook(): void {}}, // hook,
} satisfies Routes;

export const myInvalidApi = registerRoutes(invalidRoutes); // throws an error
```

## `Handling errors`

All errors thrown within Routes/Hooks will be catch and handled, as there is no concept of logger within the router, errors are not automatically logged.

> We recommend returning errors instead throwing them as the returned error type can be inferred by the clients.

For every error thrown/returned within the Routes/Hooks two types of errors are generated, a Public and a Private error.

- Public errors (`PublicError`): Are returned in the `context.response.body[routeName]` or `context.response.body[hookName]` and only contain a generic message and a status code (information that can be safely accessed by the clients).
- Private errors (`RouteError`): are stored in the `context.request.internalErrors`These errors also contains the stack trace and the rest of properties of any regular js Error. These errors should be managed by any logger hook or similar to be persisted.
- Both `PublicError` & `RouteError` can be serialized, and unlike regulars error in JS preserve the `message` property when stringified using JSON.

#### `RouteError`

mion provides the `RouteError` class to help with the creation and serialization of errors, response status code etc... It also automatically generates a shared uuid when `RouterOptions.autoGenerateErrorId = true` so same error can be traced between returned public error and internal error that contains all stack trace an any sensitive information.

Throwing any generic `Error` will generate an `HTTP 500 Internal Server Error` response.

```ts
// examples/error-handling.routes.ts

import {RouteError, StatusCodes} from '@mionkit/core';
import type {Pet} from './myModels';
import {myApp} from './myApp';

export const getPet = async (ctx, id: string): Promise<Pet | RouteError> => {
  try {
    const pet = await myApp.db.getPet(id);
    if (!pet) {
      // Only statusCode and publicMessage will be returned in the response.body
      const statusCode = StatusCodes.BAD_REQUEST;
      const publicMessage = `Pet with id ${id} can't be found`;
      // either return or throw are allowed
      return new RouteError({statusCode, publicMessage});
    }
    return pet;
  } catch (dbError) {
    const statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    const publicMessage = `Cant fetch data.`;
    /*
     * Only statusCode and publicMessage will be returned in the response.body.
     *
     * Full RouteError containing dbError message and stacktrace will be added
     * to ctx.request.internalErrors, so it can be logged or managed after
     */
    return new RouteError({statusCode, publicMessage, originalError: dbError as Error});
  }
};

export const alwaysError = (): void => {
  /*
   * this will generate a public 500 error with an 'Unknown Error' message.
   *
   * Full RouteError containing dbError message and stacktrace will be added
   * to ctx.request.internalErrors, so it can be logged or managed after
   */
  throw new Error('This error will generate a public 500 error with a generic message');
};
```

## `Routes & Hooks Config`

#### Routes Configuration

```ts
// src/types.ts#L41-L53

/** Route definition */
export interface RouteDef<Context extends CallContext = CallContext, Ret = any> {
  /** description of the route, mostly for documentation purposes */
  description?: string;
  /** Overrides global enableValidation */
  enableValidation?: boolean;
  /** Overrides global enableSerialization */
  enableSerialization?: boolean;
  /** Overrides global useAsyncCallContext */
  useAsyncCallContext?: boolean;
  /** Route Handler */
  route: Handler<Context, Ret>;
}
```

#### Hooks Configuration

```ts
// src/types.ts#L55-L82

interface HookBase {
  /** Executes the hook even if an error was thrown previously */
  forceRunOnError?: boolean;
  /** Enables returning data in the responseBody,
   * hooks must explicitly enable returning data */
  canReturnData?: boolean;
  /** Description of the route, mostly for documentation purposes */
  description?: string;
  /** Overrides global enableValidation */
  enableValidation?: boolean;
  /** Overrides global enableSerialization */
  enableSerialization?: boolean;
  /** Overrides global useAsyncCallContext */
  useAsyncCallContext?: boolean;
}

/** Hook definition, a function that hooks into the execution path */
export interface HookDef<Context extends CallContext = CallContext, Ret = any> extends HookBase {
  /** Hook handler */
  hook: Handler<Context, Ret>;
}

/** Header Hook definition, used to handle header params */
export interface HeaderHookDef<Context extends CallContext = CallContext, Ret = any> extends HookBase {
  /** the name of the header in the request/response */
  headerName: string;
  headerHook: HeaderHandler<Context, Ret>;
}
```

#### Raw Hook Configuration

```ts
// src/types.ts#L84-L95

/**
 * Raw hook, used only to access raw request/response and modify the call context.
 * Can not declare extra parameters.
 */
export interface RawHookDef<
  Context extends CallContext = CallContext,
  RawReq extends RawRequest = RawRequest,
  RawResp = any,
  Opts extends RouterOptions<RawReq> = RouterOptions<RawReq>
> {
  rawHook: RawHookHandler<Context, RawReq, RawResp, Opts>;
}
```

#### Extending Route and Hook Types

Your application might need to add some extra metadata to every route or hook, to keep types working you can extend the `Route` and `Hook` types as follows:

```ts
// examples/extending-routes-and-hooks.routes.ts

import {Route, HookDef} from '@mionkit/router';
import {myApp} from './myApp';

type MyRoute = Route & {doNotFail: boolean};
type MyHook = HookDef & {shouldLog: boolean};

const someRoute: MyRoute = {
  doNotFail: true,
  route: (): void => {
    if (someRoute.doNotFail) {
      // do something
    } else {
      throw {statusCode: 400, message: 'operation failed'};
    }
  },
};

const someHook: MyHook = {
  shouldLog: false,
  hook: (): void => {
    if (someHook.shouldLog) {
      myApp.cloudLogs.log('hello');
    } else {
      // do something else
    }
  },
};
```

## `Call Context`

The `CallContext` contains all the data related to the ongoing call. Most of the data within the `CallContext` is marked as read only, this is because it is not recommended modifying the context manually just the `shared` object. Instead route/hook handlers should just return a value or throw an error.

It is still possible to modify it (the context is not a real Immutable js object). It is always passed as the first parameter to the routes/hooks handlers.

This is an obvious statement but to avoid memory issues you should never store a reference to the context or any of it's properties, the context is passed to every handler so there should be no reason to do so.

```ts
// examples/don-not-store-context.ts

import {HeaderHookDef, Routes, registerRoutes} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

let currentSharedData: any = null;

const authorizationHook = {
  headerName: 'Authorization',
  async headerHook(ctx, token: string): Promise<void> {
    const me = await getAuthUser(token);
    if (!isAuthorized(me)) throw {code: 401, message: 'user is not authorized'};
    ctx.shared.auth = {me}; // user is added to ctx to shared with other routes/hooks

    // THIS IS WRONG! DO NOT STORE THE CONTEXT!
    currentSharedData = ctx.shared;
  },
} satisfies HeaderHookDef;

const wrongSayHello = (ctx): string => {
  // this is wrong! besides currentContext might have changed, it might be also causing memory problems
  return `hello ${currentSharedData?.shared?.auth}`;
};

const sayHello = (ctx): string => {
  return `hello ${ctx.shared.auth}`;
};

const routes = {
  authorizationHook, // header: Authorization
  wrongSayHello,
  sayHello,
} satisfies Routes;

export const apiSpec = registerRoutes(routes);
```

#### Call Context Type

```ts
// src/types.ts#L185-L195

/** The call Context object passed as first parameter to any hook or route */
export type CallContext<SharedData = any> = {
  /** Route's path after internal transformation*/
  readonly path: string;
  /** Router's own request object */
  readonly request: Request;
  /** Router's own response object */
  readonly response: Response;
  /** shared data between handlers (route/hooks) and that is not returned in the response. */
  shared: SharedData;
};
```

#### Extending the CallContext

```ts
// examples/using-context.routes.ts

import {registerRoutes, initRouter} from '@mionkit/router';
import {someDbDriver} from 'someDbDriver';
import {cloudLogs} from 'MyCloudLogLs';
import type {CallContext, Routes} from '@mionkit/router';
import type {APIGatewayEvent} from 'aws-lambda';
import type {Pet} from 'MyModels';

const myApp = {cloudLogs, db: someDbDriver};
const shared = {auth: {me: null}};
const getSharedData = (): typeof shared => shared;

type SharedData = ReturnType<typeof getSharedData>;
type Context = CallContext<SharedData>;

const getMyPet = async (ctx: Context): Promise<Pet> => {
  // use of ctx inside handlers
  const user = ctx.shared.auth.me;
  const pet = myApp.db.getPetFromUser(user);
  myApp.cloudLogs.log('pet from user retrieved');
  return pet;
};

const routes = {getMyPet} satisfies Routes;
initRouter({sharedDataFactory: getSharedData});
export const apiSpec = registerRoutes(routes);
```

## `Automatic Serialization and Validation`

mion uses [Deepkit's runtime types](https://deepkit.io/) to automatically [validate](https://docs.deepkit.io/english/validation.html) request params and [serialize/deserialize](https://docs.deepkit.io/english/serialization.html) request/response data.

Thanks to Deepkit's magic the type information is available at runtime and the data can be auto-magically Validated and Serialized. For more information please read deepkit's documentation:

- Request [Validation](https://docs.deepkit.io/english/validation.html)
- Response/Request [Serialization/Deserialization](https://docs.deepkit.io/english/serialization.html)

#### Request Validation examples

<table>
<tr><th>Code</th><th>POST Request <code>/users/getUser</code></th></tr>
<tr>
<td>

```ts
// examples/get-user-request.routes.ts

import {Routes, registerRoutes} from '@mionkit/router';
import type {User} from 'MyModels';

const getUser = async (ctx, entity: {id: number}): Promise<User> => {
  const user = await ctx.db.getUserById(entity.id);
  return user;
};

const routes = {
  users: {
    getUser, // api/users/getUser
  },
} satisfies Routes;

export const apiSpec = registerRoutes(routes);
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

#### Configuring Eslint to enforce explicit types in router files:

Declaring explicit types everywhere can be a bit annoying, so you could suffix your route filles with `.routes.ts` and add bellow eslint config to your project, (the important part here is the `overrides` config).

<!-- `Router.addRoutes` will fail if parameter types or return types are not defined and `enableValidation` or `enableSerialization` are enabled. -->

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parserOptions: {
    project: ['./tsconfig.json', './packages/*/tsconfig.json'],
  },
  overrides: [
    {
      files: ['**/*.routes.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },
  ],
};
```

## `Router Options`

```ts
// src/constants.ts#L37-L66

export const DEFAULT_ROUTE_OPTIONS: Readonly<RouterOptions> = {
  /** Prefix for all routes, i.e: api/v1.
   * path separator is added between the prefix and the route */
  prefix: '',

  /** Suffix for all routes, i.e: .json.
   * No path separator is added between the route and the suffix */
  suffix: '',

  /** Function that transforms the path before finding a route */
  pathTransform: undefined,

  /** Enables automatic parameter validation */
  enableValidation: true,

  /** Enables automatic serialization/deserialization */
  enableSerialization: true,

  /** Reflection and Deepkit Serialization-Validation options */
  reflectionOptions: DEFAULT_REFLECTION_OPTIONS,

  /** Custom body parser, defaults to Native JSON */
  bodyParser: JSON,

  /** set to true to generate router spec for clients.  */
  getPublicRoutesData: process.env.GENERATE_ROUTER_SPEC === 'true',

  /** Set true to automatically generate and id for every error.  */
  autoGenerateErrorId: false,
};
```

#### Reflection Options

```ts
// ../runtype/src/constants.ts#L10-L33

/** Reflection and Deepkit Serialization-Validation options */
export const DEFAULT_REFLECTION_OPTIONS: Readonly<ReflectionOptions> = {
  /**
   * Deepkit Serialization Options
   * !! We Don't recommend to enable soft conversion as json is used to send and receive data and already have support for basic javascript types
   * Soft conversion is only useful when parameters are sent only as strings like url query params or http headers
   * @link https://docs.deepkit.io/english/serialization.html#serialisation-options
   * */
  serializationOptions: {
    loosely: false, // Soft conversion disabled by default
  },

  /**
   * Deepkit custom serializer
   * @link https://docs.deepkit.io/english/serialization.html#serialisation-custom-serialiser
   * */
  customSerializer: undefined,

  /**
   * Deepkit Serialization Options
   * @link https://docs.deepkit.io/english/serialization.html#_naming_strategy
   * */
  serializerNamingStrategy: undefined,
};
```

## `Full Working Example`

Application

```ts
// examples/full-example.app.ts

import {RouteError, StatusCodes} from '@mionkit/core';
import {registerRoutes, initRouter, Route} from '@mionkit/router';
import type {CallContext, HeaderHookDef, HookDef, RawHookDef, Routes} from '@mionkit/router';
import type {APIGatewayEvent} from 'aws-lambda';

export interface User {
  id: number;
  name: string;
  surname: string;
}

export type NewUser = Omit<User, 'id'>;

export const memoryStoreService = {
  usersStore: new Map<number, User>(),
  createUser: (user: NewUser): User => {
    const id = memoryStoreService.usersStore.size + 1;
    const newUser: User = {id, ...user};
    memoryStoreService.usersStore.set(id, newUser);
    return newUser;
  },
  getUser: (id: number): User | undefined => memoryStoreService.usersStore.get(id),
  updateUser: (user: User): User | null => {
    if (!memoryStoreService.usersStore.has(user.id)) return null;
    memoryStoreService.usersStore.set(user.id, user);
    return user;
  },
  deleteUser: (id: number): User | null => {
    const user = memoryStoreService.usersStore.get(id);
    if (!user) return null;
    memoryStoreService.usersStore.delete(id);
    return user;
  },
};

// user is authorized if token === 'ABCD'
export const myAuthService = {
  isAuthorized: (token: string): boolean => token === 'ABCD',
  getIdentity: (token: string): User | null => (token === 'ABCD' ? ({id: 0, name: 'admin', surname: 'admin'} as User) : null),
};
export const myApp = {
  store: memoryStoreService,
  auth: myAuthService,
};
export const shared = {
  me: null as any as User,
};
export const getSharedData = (): typeof shared => shared;

export type SharedData = ReturnType<typeof getSharedData>;
export type Context = CallContext<SharedData>;
```

Routes

```ts
// examples/full-example.routes.ts

import {RouteError, StatusCodes} from '@mionkit/core';
import {registerRoutes, initRouter} from '@mionkit/router';
import type {HeaderHookDef, RawHookDef, Routes} from '@mionkit/router';
import {Context, NewUser, getSharedData, myApp} from './full-example.app';
import {User} from '@mionkit/codegen/src/test/myApi.types';

const getUser = (ctx: Context, id: number): User => {
  const user = myApp.store.getUser(id);
  if (!user) throw {statusCode: 200, message: 'user not found'};
  return user;
};

const createUser = (ctx: Context, newUser: NewUser): User => myApp.store.createUser(newUser);

const updateUser = (ctx: Context, user: User): User => {
  const updated = myApp.store.updateUser(user);
  if (!updated) throw {statusCode: 200, message: 'user not found, can not be updated'};
  return updated;
};

const deleteUser = (ctx: Context, id: number): User => {
  const deleted = myApp.store.deleteUser(id);
  if (!deleted) throw {statusCode: 200, message: 'user not found, can not be deleted'};
  return deleted;
};

const auth = {
  headerName: 'Authorization',
  canReturnData: false,
  headerHook: (ctx: Context, token: string): void => {
    if (!myApp.auth.isAuthorized(token)) throw {statusCode: StatusCodes.FORBIDDEN, message: 'Not Authorized'} as RouteError;
    ctx.shared.me = myApp.auth.getIdentity(token) as User;
  },
} satisfies HeaderHookDef;

const log = {
  rawHook: (context): void => console.log('rawHook', context.path),
} satisfies RawHookDef;

const routes = {
  private: {hook: (): null => null},
  auth,
  users: {
    get: getUser, // api/v1/users/get
    create: createUser, // api/v1/users/create
    update: updateUser, // api/v1/users/update
    delete: deleteUser, // api/v1/users/delete
  },
  log,
} satisfies Routes;

initRouter({sharedDataFactory: getSharedData, prefix: 'api/v1'});
export const apiSpec = registerRoutes(routes);
export type ApiSpec = typeof apiSpec;
```

## &nbsp;

_[MIT](../../LICENSE) LICENSE_
