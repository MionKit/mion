<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png">
    <img alt='mion, a mikro kit for Typescript Serverless APIs' src='https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png'>
  </picture>
</p>
<p align="center">
  <strong>Browser client for mion Apps.
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mionkit/client`

Browser client for mion Apis

## Work in progress 🛠️

initializing

```ts
import type {MyApiSpec} from 'MyApi';
import {User} from 'models';
import {ApiOptions} from 'MyApi'; // we need a way to include prefix, suffix and possibly some other stuff
import {MionErrors} from '@mionkit/core';
import {initMionClient} from '@mionkit/client';

client = initMionClient<MyApiSpec>();

const userId = 56;
client.getUser
  .call(userId)
  .then((user: User) => {
    console.log(`Hello ${user.firstName} how you doing today?`);
  })
  .catch((error: RouteError) => {
    if (error.name === MionErrors.NOT_FOUND) console.log('error not found');
  });
```

_[MIT](../../LICENSE) LICENSE_
