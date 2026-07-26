# @ts-runtypes/core

**Compile-time runtime types for TypeScript 7 / typescript-go (tsgo).**

TypeScript throws your types away before your code ever runs. RunTypes reads them
first, at build time, and hands the runtime back what it lost: validators, JSON and
binary (de)serializers, mock data, and reflection.

This is the runtime package: the sentinel markers the compiler looks for, plus the
small helper runtime the generated code calls into. It has **zero dependencies**.
The build-time half lives in
[`@ts-runtypes/devtools`](https://www.npmjs.com/package/@ts-runtypes/devtools).

## Install

```bash
pnpm add @ts-runtypes/core
pnpm add -D @ts-runtypes/devtools
```

Then wire the plugin into your bundler (Vite shown; Rollup, Rolldown, webpack,
Rspack, and esbuild are also supported) and point it at your `tsconfig.json`:

```ts
// vite.config.ts
import {defineConfig} from 'vite';
import runtypes from '@ts-runtypes/devtools/vite';

export default defineConfig({
  plugins: [runtypes({tsconfig: 'tsconfig.json'})],
});
```

## Usage

Write a normal TypeScript type and ask for a validator. The build generates a real,
specialized function for it, so there is no schema to declare and no reflection at
run time:

```ts
import {createValidateFn, createGetValidationErrorsFn} from '@ts-runtypes/core';

type User = {
  id: number;
  name: string;
  email: string;
  roles: ('admin' | 'user')[];
};

const isUser = createValidateFn<User>();

const data: unknown = JSON.parse('{"id":1,"name":"Ada","email":"ada@x.io","roles":["admin"]}');
if (isUser(data)) {
  // data is narrowed to User here.
  console.log(data.name);
}

// Need the reasons, not just a yes/no?
const getUserErrors = createGetValidationErrorsFn<User>();
```

The same type drives more than validation:

- **Serialization** — `createJsonEncoderFn` / `createJsonDecoderFn`,
  `createBinaryEncoderFn` / `createBinaryDecoderFn`.
- **Reflection** — `getRunTypeId`, `getRunType`.
- **Mock data** — `createMockDataFn`.
- **Schema interop** — the Standard Schema surface under `@ts-runtypes/core/schema`.
- **Formats** — the built-in `TypeFormat` catalog under `@ts-runtypes/core/formats`.

## Documentation

Full guides, the factory reference, and benchmarks live at
**[runtypes.pages.dev](https://runtypes.pages.dev/)**.

- [Quick start](https://runtypes.pages.dev/introduction/quick-start)
- [Configuration](https://runtypes.pages.dev/introduction/configuration)
- [Source and issues](https://github.com/MionKit/ts-run-types)

## Status

Experimental.

## License

Proprietary — all rights reserved. No use, copying, or distribution without prior
written authorization. See
[LICENSE](https://github.com/MionKit/ts-run-types/blob/main/LICENSE).
