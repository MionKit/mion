<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/public/bannerx90-dark.png?raw=true">
    <source media="(prefers-color-scheme: light)" srcset="../../assets/public/bannerx90.png?raw=true">
    <img alt='mion, a mikro kit for Typescript Serverless APIs' src='../../assets/public/bannerx90.png?raw=true'>
  </picture>
</p>
<p align="center">
  <strong>mion HTTP Server for quick Api development.
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/travis/mion/mion.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mion/compiled-app`

This is an app exported with included runtime types so cab be used in the [fastify-benchmarks](https://github.com/fastify/benchmarks) repo without using typescript

### Using the app externally:

```ts
// examples/use-externally.ts

import {initHttp, addRoutes, routes} from '@mion/compiled-app';

const options = {
  enableValidation: false,
  enableSerialization: false,
};

const {startHttpServer} = initHttp(options);

addRoutes(routes);

startHttpServer({port: 3000});
```

## &nbsp;

_[MIT](../../LICENSE) LICENSE_
