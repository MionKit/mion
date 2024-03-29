<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/public/logo-dark.svg?raw=true">
    <source media="(prefers-color-scheme: light)" srcset="./assets/public/logo.svg?raw=true">
    <img alt='mion, a mikro kit for Typescript Serverless APIs' src='./assets/public/logo.svg?raw=true' width="403" height="150">
  </picture>
</p>

<p align=center>
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# mion : Type Safe APIs at the speed of light 🚀

mion is a lightweight TypeScript-based framework designed for building serverless APIs. It aims to provide a great developer experience and is optimized for serverless environments. With mion, you can quickly build APIs that are type-safe, with automatic validation and serialization out of the box.

## Check Out The [Website And Documentation](http://mion.io) 📚

[![mion-website-banner](https://raw.githubusercontent.com/MionKit/mion/master/assets/public/mion-website-banner.png)](http://mion.io)

## Why Another Framework?

Serverless applications have different requirements compared to conventional server apps and there are not many frameworks that offer type-safe APIs with automatic validation and serialization by default.

mion addresses these challenges by offering a lightweight and opinionated framework focused on simplicity and developer experience.

## Features

| Status | Name                        | Description                                                   |
| ------ | --------------------------- | ------------------------------------------------------------- |
| ✅     | RPC-like Router             | Provides an RPC-style router for handling API requests        |
| ✅     | Automatic Validation        | Automatically validates data received by the API              |
| ✅     | Automatic Serialization     | Automatically serializes data sent by the API                 |
| ✅     | AWS Lambda Handler          | Seamless integration with AWS Lambda for serverless execution |
| ✅     | HTTP Server                 | Includes an HTTP server module for handling API requests      |
| ✅     | Automatic TypeScript Client | Fully typed client without need of compilation                |

## Opinionated Approach (Aka: RPC Like)

mion is designed with a Remote Procedure Call (RPC) style and works exclusively with JSON data. The framework prioritizes quick development, fast startups, and minimal abstractions. It follows a convention-over-configuration approach and focuses on performance and developer experience.

## Fast

We have prioritized and tracked performance during the development of the framework, we even have many discarded features and experiments when there was a performance degradation compared to previous versions. Our goal is to have similar performance to fastify which we consider the gold standard in node.js frameworks!

For full benchmarks and comparison against other frameworks please visit the [benchmarks repo](https://github.com/MionKit/Benchmarks).  
We know! benchmarks are just benchmarks, but if you don't keep performance in mind you end up like express 😅

- [Performance and Memory](https://github.com/MionKit/Benchmarks)
- [Cold starts](https://github.com/MionKit/Benchmarks/blob/master/COLD-STARTS.md)
- [Mion options](https://github.com/MionKit/Benchmarks/blob/master/MION-OPTIONS.md)

## Routing

mion's router is lightweight and fast. Unlike traditional routers, it uses a Remote Procedure Call (RPC) style of routing. The Http method is not relevant, there are no parameters in the Url and data is sent and received in JSON format via the request body or headers. mion's router leverages a simple in-memory map for route lookup, making it extremely fast.

Apis are composed of Routes and Hooks. Routes are methods that can be called remotely from the client and have an specific url, while hooks are auxiliary methods that get's executed before or after a route.

To learn more about the router, refer to the [Router Documentation](./packages/router/).

## Automatic Serialization & Validation

mion utilizes [Deepkit's runtime types](https://deepkit.io/) for automatic validation and serialization. Deepkit's magic enables type information to be available at runtime, allowing for automatic validation and serialization of data.

By leveraging runtime types, mion offers advanced capabilities such as request validation and response/request serialization that typically involves using multiple framework and loads of code or boilerplate to be manually written by developers.

## Type Safe Apis

![type safes apis](https://raw.githubusercontent.com/MionKit/mion/master/assets/public/type-safe-apis.gif)

Thats it 👆, thats all you need to write a Fully Type Safe Api and Client &nbsp; 🚀  
All parameters and return values will also be automatically validated and serialized without any extra code required.

## Contributing

Contributors and maintainers are welcome 👍

Mion's philosophy is simplicity, so we don't want to add many features! As an small open source project we want to keep it simple and keep features to maintain at a minimum, that said contributions to mion are encouraged! Please open issues and submit pull requests for any improvements or bug fixes.

The project is organized as a monorepo using npm workspaces, NX, and Lerna. Each package within the monorepo is compiled and tested individually using TypeScript and Jest.

### Publishing

To publish packages we need to make sure the packages are built first.

```sh
npm run build
npx lerna version --no-private
npx lerna publish from-package --no-private
```

## Powered by:

- [Typescript](https://www.typescriptlang.org/)
- [Deepkit](https://deepkit.io/)
- [@MaJerez](https://github.com/M-jerez)
  <!-- - [Serverless Framework](https://www.serverless.com/)  -->
  <!-- - [AWS Cognito](https://aws.amazon.com/cognito/) -->
  <!-- - [Postgres.js](https://github.com/porsager/postgres) -->

<!-- ![powered by: deepkit, serverless, mion](./assets/public/tech-stack-830x100.png?raw=true) &nbsp;&nbsp; -->

---

_License: [MIT](./LICENSE)_
