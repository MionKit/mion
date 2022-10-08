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


# `@mikrokit/router`

MikroKit Router uses **Remote Procedure Call** style routing, unlike traditional REST apis it does not use `GET`, `PUT`, `POST` and `DELETE` methods, everything is transmitted using `HTTP POST` method and data is sent/received in the request/response `BODY`.

**_This router can be used as an standalone router and does not requires to use the full [MikroKit Framework](https://github.com/MikroKit/MikroKit)_**


### Rpc VS Rest

| RPC Like Request                                               | REST Request                                            | Description     |
| -------------------------------------------------------------- | ------------------------------------------------------- | --------------- |
| POST `http://myapi.com/users/get`<br>BODY `{"id":1}`           | GET `http://myapi.com/users/1`<br>BODY `NONE`           | Get user by id  |
| POST `http://myapi.com/users/create`<br>BODY `{"name":"John"}` | POST `http://myapi.com/users`<br>BODY `{"name":"John"}` | Create new user |
| POST `http://myapi.com/users/delete`<br>BODY `{"id":1}`        | DELETE `http://myapi.com/users/1`<br>BODY `NONE`        | Delete user     |
| POST `http://myapi.com/users/getAll`<br>BODY `NONE`            | GET `http://myapi.com/users` <br>BODY `NONE`            | Get All users   |

Please have a look to this great Presentation for more info about each different type of API and the pros and cons of each one:  
[Nate Barbettini – API Throwdown: RPC vs REST vs GraphQL, Iterate 2018](https://www.youtube.com/watch?v=IvsANO0qZEg)


## The router

Blazing fast router **based in plain javascript objects** so no magic required and no need to manually declare router names. Thanks to the rpc style there is no need for parameters or regular expression parsing when finding a route, just a simple object in memory with all the routes on it, can't get faster than that.

Routes are defined using a plain javascript object, where every field is a route, this also eliminates naming collisions.

This router uses [Deepkit](https://deepkit.io/) runtime types to automatically [validate](https://docs.deepkit.io/english/validation.html) the data send in the request and [serialize](https://docs.deepkit.io/english/serialization.html) the data send in the response.


## Declaring routes

```js
import {mikroKitRouter} from '@mikrokit/router';

const sayHello = (name: string) => {
  return `Hello ${name}.`;
};

const sayHello2 = (name1: string, name2: string) => {
  return `Hello ${name1} and ${name2}.`;
};

const options = { prefix: 'api/' };

const routes = {
  sayHello, // api/sayHello
};

mikroKitRouter.addRoutes(routes, options);
```

### Passing function parameters

The function parameters are passed in the request body in a field with the same name as the called function and must be passed as an array or value if there is only one parameter.


```yml
# HTTP REQUEST
URL: https://my.api.com/api/sayHello
Method: POST

# POST REQUEST 1 BODY (single parameter)
{
  "sayHello": "John"
}

# POST REQUEST 2 BODY (multiple parameters in order)
{
  "sayHello2": ["Adan", "Eve"]
}
```

### Reading function response

The response gets also returned in a field with the same name as the called function

```yml
# HTTP RESPONSE
URL: https://my.api.com/api/sayHello

# POST RESPONSE 1 BODY
{
  "sayHello": "Hello John."
}

# POST RESPONSE 2 BODY
{
  "sayHello2": "Hello Adan and Eve."
}
```

## Automatic Validation and Serialization

Thanks to Deepkit's magic the type information is available at runtime and the data is auto-magically Validated and Serialized. For mor information please read deepkit's documentation:

* Request [Validation](https://docs.deepkit.io/english/validation.html)
* Response [Serialization](https://docs.deepkit.io/english/serialization.html)


### Request Validation examples

```js
import {mikroKitRouter} from '@mikrokit/router';

interface Entity {
  id: number;
};

const getUser = async (entity: Entity) => {
  const user = await db.users.getById(entity.id);
  return user;
};

const options = { prefix: 'api/' };

const routes = {
  users: {
    getUser, // api/users/getUser
  }
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
  functionName: 'sayMyName', // renaming the function name
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
