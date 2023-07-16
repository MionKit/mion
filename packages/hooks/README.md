<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png">
    <img alt='mion, a mikro kit for Typescript Serverless APIs' src='https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png'>
  </picture>
</p>
<p align="center">
  <strong>common hooks for mion apps
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mionkit/hooks`

Common hooks for mion apps

## Description

This library include common hooks required for mion router and apps.

#### Notes

- All existing hooks are indirectly tested by the libraries using them so there are no unit test for them.
- runtime reflection is enabled for this package so hooks are compiled with run types metadata

### Issues

Seems like methods are not generating runtime types, so only arrow function and functions supported

**Invalid Hook definition:** seems that deepkit is not correctly generating the types when using methods.

```ts
const sayHello = {
  hook(app, ctx, name: string) {
    return `hello ${name}`;
  },
};
```

**Valid Hook definition:** using arrow functions or regular functions work

```ts
const sayHello = {
  hook: (app, ctx, name: string) => {
    return `hello ${name}`;
  },
};

const sayHello2 = {
  hook: function (app, ctx, name: string) {
    return `hello ${name}`;
  },
};
```

- ***

[MIT LICENSE](../../LICENSE)
