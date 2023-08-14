<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png">
    <img alt='mion, a mikro kit for Typescript Serverless APIs' src='https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png'>
  </picture>
</p>
<p align="center">
  <strong>Fully typed client for mion Apis
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mionkit/client`

Modern client for mion Apis:

- Strongly typed apis with autocompletion ans static type checking.
- Fully typed list of remote methods with it's parameters and return values.
- Automattic Validation and Serialization out of the box.
- Local Validation (no need to make a server request to validate parameters)
- Prefill request data to persist across multiple calls.
- No compilation needed

## Setting up the server

To be able to use the client the server must register a couple of routes required by the client to request remote methods metadata for validation and serialization. This routes are part of the `@mionkit/commons` package.

It is also required to export the **type** of the registered routes in the server.

```ts
// examples/server.routes.ts

import {PublicError} from '@mionkit/core';
import {Routes, registerRoutes} from '@mionkit/router';
import {clientRoutes} from '@mionkit/common';
import {Logger} from 'Logger';

export type User = {id: string; name: string; surname: string};
export type Order = {id: string; date: Date; userId: string; totalUSD: number};
const routes = {
  auth: {
    headerName: 'authorization',
    headerHook: (ctx, token: string): void | PublicError => {
      if (!token) return new PublicError({statusCode: 401, message: 'Not Authorized', name: ' Not Authorized'});
    },
  },
  users: {
    getById: (ctx, id: string): User | PublicError => ({id, name: 'John', surname: 'Smith'}),
    delete: (ctx, id: string): string | PublicError => id,
    create: (ctx, user: Omit<User, 'id'>): User | PublicError => ({id: 'USER-123', ...user}),
  },
  orders: {
    getById: (ctx, id: string): Order | PublicError => ({id, date: new Date(), userId: 'USER-123', totalUSD: 120}),
    delete: (ctx, id: string): string | PublicError => id,
    create: (ctx, order: Omit<Order, 'id'>): Order | PublicError => ({id: 'ORDER-123', ...order}),
  },
  utils: {
    sum: (ctx, a: number, b: number): number => a + b,
    sayHello: (ctx, user: User): string => `Hello ${user.name} ${user.surname}`,
  },
  log: {
    forceRunOnError: true,
    hook: (ctx): any => {
      Logger.log(ctx.path, ctx.request.headers, ctx.request.body);
    },
  },
} satisfies Routes;

// init server or serverless router
// initHttpRouter(...);
// initAwsLambdaRouter(...);

// register routes and exporting the type of the Api to be used by client
const myApi = registerRoutes(routes);
export type MyApi = typeof myApi;

// register routes required by client, (these routes serve metadata, for validation and serialization)
registerRoutes(clientRoutes);
```

## Using the client

To use the client we just need to import the **type** of the registered routes, and initialize the client.

The `methods` object returned when initializing the client is a fully typed `RemoteApi`` object that contains all the remote methods with parameter types and return values.

```ts
// examples/client.ts

import {initClient} from '@mionkit/client';

// importing type only from server
import type {MyApi} from './server.routes';
import {ParamsValidationResponse} from '@mionkit/runtype';

const port = 8076;
const baseURL = `http://localhost:${port}`;
const {methods, client} = initClient<MyApi>({baseURL});

// prefills the token for any future requests, value is stored in localStorage
await methods.auth('myToken-XYZ').prefill();

// calls sayHello route in the server
const sayHello = await methods.utils.sayHello({id: '123', name: 'John', surname: 'Doe'}).call();
console.log(sayHello); // Hello John Doe

// calls sumTwo route in the server
const sumTwoResp = await methods.utils.sum(5, 2).call();
console.log(sumTwoResp); // 7

// validate parameters locally without calling the server
const validationResp: ParamsValidationResponse = await methods.utils
  .sayHello({id: '123', name: 'John', surname: 'Doe'})
  .validate();
console.log(validationResp); // {hasErrors: false, totalErrors: 0, errors: []}
```

#### Fully Typed Client

![autocomplete](./assets/autocomplete.gif)

## Handling Errors

When a remote route call fails, it always throws a `PublicError` this can be the error from the route or any other error thrown from the route's hooks.

All the `methods` operations: `call`, `validate`, `prefill`, `removePrefill` are async and throw a `PublicError` if something fails including validation and serialization.

As catch blocks are always of type `any`, the Type guard `isPublicError` can be used to check the correct type of the error.

```ts
// examples/handling-errors.ts

import {initClient} from '@mionkit/client';

// importing type only from server
import type {MyApi} from './server.routes';
import {isPublicError, PublicError} from '@mionkit/core';

const port = 8076;
const baseURL = `http://localhost:${port}`;
const {methods, client} = initClient<MyApi>({baseURL});

try {
  // calls sayHello route in the server
  const sayHello = await methods.utils.sayHello({id: '123', name: 'John', surname: 'Doe'}).call();
  console.log(sayHello); // Hello John Doe
} catch (error: PublicError | any) {
  // in this case the request has failed because the authorization hook is missing
  console.log(error); // {statusCode: 400, name: 'Validation Error', message: `Invalid params for Route or Hook 'auth'.`}

  if (isPublicError(error)) {
    // ... handle the error as required
  }
}

try {
  // Validation throws an error when validation fails
  const sayHello = await methods.utils.sayHello(null as any).validate();
  console.log(sayHello); // Hello John Doe
} catch (error: PublicError | any) {
  console.log(error); // { statusCode: 400, name: 'Validation Error', message: `Invalid params ...`, errorData : {...}}
}
```

_[MIT](../../LICENSE) LICENSE_
