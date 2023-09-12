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

# `@mionkit/router`

🚀 Lightweight and fast HTTP router with automatic validation and serialization out of the box.

Thanks to it's RPC routing style is quite performant as there is no need to parse URLs or match regular expressions when finding a route. Just a direct mapping from url to the route handler.

mion Router uses a **Remote Procedure Call** style routing, unlike traditional routers it does not rely on `GET`, `PUT`, `POST`, or any other http method to to identify the route. The router only supports sending/receiving data as json in the body or in http headers. No query params support or any other xml or data formats other than json.

These architectural limitations make it suitable for modern APIs and grants some advantages over other routers that need to support many more features.

## Check Out The [Website And Documentation](http://mion.io) 📚

[![mion-website-banner](https://raw.githubusercontent.com/MionKit/mion/master/assets/public/mion-website-banner.png)](http://mion.io)

---

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

#### Extending the CallContext

```ts
// examples/using-context.routes.ts

import {registerRoutes, initRouter} from '@mionkit/router';
import {myApp} from './myApp';
import type {CallContext, Routes} from '@mionkit/router';
import type {Pet, User} from './myModels';

interface SharedData {
  myUser: User | null;
  // ... other shared data properties
}
const initSharedData = (): SharedData => ({myUser: null});

type MyContext = CallContext<SharedData>;
const getMyPet = async (ctx: MyContext): Promise<Pet> => {
  const user = ctx.shared.myUser;
  const pet = myApp.db.getPetFromUser(user);
  return pet;
};

const routes = {getMyPet} satisfies Routes;
initRouter({sharedDataFactory: initSharedData});
export const apiSpec = registerRoutes(routes);
```

## &nbsp;

_[MIT](../../LICENSE) LICENSE_
