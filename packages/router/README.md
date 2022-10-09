<p align="center">
  <img alt='MikroKit, The APi Dashboard' width="" src='../../assets/public/bannerx90.png?raw=true'>
</p>
<p align="center">
  <strong>RPC Like router with automatic Validation and Serialization
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/travis/mikrokit/mikrokit.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mikrokit/router`

MikroKit Router uses **Remote Procedure Call** style routing, unlike traditional REST apis it does not use `GET`, `PUT`, `POST` and `DELETE` methods, everything is transmitted using `HTTP POST` method and data is sent/received in the request/response `BODY`.

**_This router can be used as an standalone router and does not requires to use the full [MikroKit Framework](https://github.com/MikroKit/MikroKit)_**

### Rpc VS Rest

| RPC Like Request                                            | REST Request                            | Description     |
| ----------------------------------------------------------- | --------------------------------------- | --------------- |
| POST `/users/get`<br>BODY `{"params":[{"id":1}]}`           | GET `/users/1`<br>BODY `NONE`           | Get user by id  |
| POST `/users/create`<br>BODY `{"params":[{"name":"John"}]}` | POST `/users`<br>BODY `{"name":"John"}` | Create new user |
| POST `/users/delete`<br>BODY `{"params":[{"id":1}]}`        | DELETE `/users/1`<br>BODY `NONE`        | Delete user     |
| POST `/users/getAll`<br>BODY `{}`                           | GET `/users` <br>BODY `NONE`            | Get All users   |

Please have a look to this great Presentation for more info about each different type of API and the pros and cons of each one:  
[Nate Barbettini – API Throwdown: RPC vs REST vs GraphQL, Iterate 2018](https://www.youtube.com/watch?v=IvsANO0qZEg)

## The router

Blazing fast router **based in plain javascript objects** so no magic required and no need to manually declare router names. Thanks to the rpc style there is no need for parameters or regular expression parsing when finding a route, just a simple object in memory with all the routes on it, can't get faster than that.

Routes are defined using a plain javascript object, where every field is a route, this also eliminates naming collisions.

This router uses [Deepkit](https://deepkit.io/) runtime types to automatically [validate](https://docs.deepkit.io/english/validation.html) the data send in the request and [serialize](https://docs.deepkit.io/english/serialization.html) the data send in the response.

## Declaring routes

Routes are defined using a plain javascript object, where every property is a route.

```js
import {mikroKitRouter} from '@mikrokit/router';

const sayHello = (name: string) => {
  return `Hello ${name}.`;
};

const sayHello2 = (name1: string, name2: string) => {
  return `Hello ${name1} and ${name2}.`;
};

const options = {prefix: 'api/'};

const routes = {
  sayHello, // api/sayHello
  sayHello2, // api/sayHello2
};

mikroKitRouter.addRoutes(routes, options);
```

### Request & Response

The function parameters are passed in the request body in the `params` field, must be an Array with the same order and types as the parameters in the called function.

The response data gets returned in the `response` field.

| POST REQUEST     | Request Body                   | Response Body                         |
| ---------------- | ------------------------------ | ------------------------------------- |
| `/api/sayHello`  | `{"params": ["John"] }`        | `{"response": "Hello John."}`         |
| `/api/sayHello2` | `{"params": ["Adan", "Eve"] }` | `{"response": "Hello Adan and Eve."}` |

## Hooks

A route might require some extra data like authorization, preconditions, postprocessing, etc... To support this just declare an especial type of function called a `hook function`.

Hooks can use the `routeContext` to share data with other routes and hooks. The return value will be ignored unless `canReturnData` is set to true in the `@hook` decorator.

```js
import {mikroKitRouter, hook} from '@mikrokit/router';
import {decodeToken} from './myAuth';
import {formatErrors} from './myErrorUtils';

interface Entity {
  id: number;
}

const apiOptions = {prefix: 'api/'};

@hook({
  stopNormalExecutionOnError: true,
  fieldName: 'Authorization',
  inHeader: true, // MikroKit framework never uses headers, but this is still and option in this router
})
const authorizationHook = async (token: string) => {
  const user = decodeToken(token);
  const isAuthorized = await routeContext.db.auth.isAuthorized(user.id);
  if (!isAuthorized) { throw {code: 401, message: 'user is not authorized'}; }
  routeContext.user = user; // user is added to routeContext to shared with other routes/hooks
  return user; // ignored, it wont do nothing
};

const getUser = async (entity: Entity) => {
  const user = await routeContext.db.users.getById(entity.id);
  return user;
};

// the hook does not have any parameters, no field is required in the request body
@hook({
  forceExecutionOnError: true,
  fieldName: 'errors'
  canReturnData: true,
})
const errorHandlerHook = () => {
  const errors = routeContext.errors;
  if (errors.length) {
    return formatErrors(errors);
    routeContext.response = null; // delete any possible previous data from the route
  }
}


/* the function does not have any parameters and doesn't return anything
 * so there is no field in the request/response body */
@hook({ forceExecutionOnError: true})
const loggingHook = () => {
  const errors = routeContext.errors;
  if (errors.length) this.logger.error(errors);
  else this.logger.log({{
    route: routeContext.request.path,
    params: routeContext.request.params
  }});
}


const routes = {
  // if `fieldName` would not have been set in the hook, then the `fieldName` would be : api/authorizationHook
  authorizationHook, // fieldName: Authorization (in the header as configured in the hook)
  users: {
    getUser, // fieldName: api/users/getUser
  },
  loggingHook, // no fieldName and always executed
};

mikroKitRouter.addRoutes(routes, apiOptions);
```

## Execution Order

The order in which `routes` and `hook functions` are added to the router is important as they will be executed in the same order they where declared. hooks wont generate any route and can't be called alone, they are just added to the router to indicate the exact point on where the hook is executed. An execution path is generated for every route.

**_To guarantee the correct execution order of hooks and routes, <span style="color:orange">the properties of the router CAN NOT BE numeric or digits only.</span>_** An error will thrown when adding routes with `mikroKitRouter.addRoutes`. More info about javascript properties order [here](https://stackoverflow.com/questions/5525795/does-javascript-guarantee-object-property-order) and [here](https://www.stefanjudis.com/today-i-learned/property-order-is-predictable-in-javascript-objects-since-es2015/).

```js
const routes = {
  authorizationHook, // hook
  users: {
    userOnlyHook // hook
    getUser, // route: users/getUser
  },
  pets: {
    getPet, // route: users/getUser
  }
  errorHandlerHook, // hook, forceExecutionOnError = true
  loggingHook, // hook, forceExecutionOnError = true
};

const invalidRoutes = {
  authorizationHook, // hook
  1: { // invalid (this would execute before the authorizationHook)
    getFoo, // route
  },
  '2': { // invalid (this would execute before the authorizationHook)
    getBar, // route
  }
}

mikroKitRouter.addRoutes(routes);
mikroKitRouter.addRoutes(invalidRoutes); // throws an error
```

`route: users/getUser`

```mermaid
graph LR;
  A(authorizationHook) --> B(userOnlyHook) --> C{{getUser}} --> E(errorHandlerHook) --> D(loggingHook)
```

`pets/getPets`

```mermaid
graph LR;
  A(authorizationHook) --> B{{getPet}} --> E(errorHandlerHook) --> C(loggingHook)
```

## Automatic Validation and Serialization

Thanks to Deepkit's magic the type information is available at runtime and the data is auto-magically Validated and Serialized. For mor information please read deepkit's documentation:

- Request [Validation](https://docs.deepkit.io/english/validation.html)
- Response [Serialization](https://docs.deepkit.io/english/serialization.html)

### Request Validation examples

```js
import {mikroKitRouter} from '@mikrokit/router';

interface Entity {
  id: number;
}

const getUser = async (entity: Entity) => {
  const user = await routeContext.db.users.getById(entity.id);
  return user;
};

const options = {prefix: 'api/'};

const routes = {
  users: {
    getUser, // api/users/getUser
  },
};

mikroKitRouter.addRoutes(routes, options);
```

```yml
# HTTP REQUEST
URL: https://my.api.com/api/users/getById
Method: POST

# VALID REQUEST BODY
{
  "getUser": [ {"id" : 1} ]
}

# INVALID REQUEST BODY (user.id is not a number)
{
  "getUser": [ {"id" : "1"} ]
}

# INVALID REQUEST BODY (missing parameter user.id)
{
  "getUser": [ {"ID" : 1} ]
}
```

## Route metadata

Routes can be customized using the `@route` decorator.

```js
import {mikroKitRouter, route} from '@mikrokit/router';

@route({
  fieldName: 'sayMyName', // renaming the function name
  validateField: 'name', // field name used to identify the function's parameters data
  serializeField: 'name', // field name used to identify the function's returned data
})
const sayHello = (name: string) => {
  return `Your name is ${name}.`;
};

const options = { prefix: 'api/' };

const routes = {
  sayHello, // api/sayMyName
};

mikroKitRouter.addRoutes(routes, options);
```

```yml
# HTTP REQUEST (route is api/sayMyName instead api/sayHello )
URL: https://my.api.com/api/sayMyName
Method: POST

# POST REQUEST BODY (function parameters read from "name" instead "sayHello")
{
  "name": "Adan"
}

# POST RESPONSE BODY (function parameters read from "name" instead "sayHello")
{
  "name": "Your name is Adan"
}
```

## &nbsp;

_[MIT](../../LICENSE) LICENSE_
