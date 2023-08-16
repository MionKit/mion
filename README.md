<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/public/logo-dark.svg?raw=true">
    <source media="(prefers-color-scheme: light)" srcset="./assets/public/logo.svg?raw=true">
    <img alt='mion, a mikro kit for Typescript Serverless APIs' src='./assets/public/logo.svg?raw=true' width="403" height="150">
  </picture>
</p>

<p align="center">
  <strong>mion : Typescript Apis at the speed of light 🚀</strong><br/>
</p>

<p align=center>
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

mion is a lightweight TypeScript-based framework designed for building serverless APIs. It aims to provide a great developer experience and is optimized for serverless environments. With mion, you can quickly build APIs that are type-safe, with automatic validation and serialization out of the box.

## Why Another Framework?

Serverless applications have different requirements compared to conventional server apps.
There are not many frameworks that offer type-safe APIs with automatic validation and serialization by default.
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

## Opinionated Approach

mion is designed for a specific scenario—APIs that work exclusively with JSON data. The framework prioritizes quick development, lightweight execution, and minimal abstractions. It follows a convention-over-configuration approach and focuses on performance and developer experience.

## Routing

mion's router is lightweight and fast. Unlike traditional routers, it uses a Remote Procedure Call (RPC) style of routing. All requests are transmitted using the HTTP POST method, and data is sent and received in JSON format via the request body and headers. mion's router leverages a simple in-memory map for route lookup, making it extremely fast.

Apis are composed of Routes and Hooks. Routes are methods that can be called remotely from the client and have an specific url, while hooks are auxiliary methods that get's executed before or after a route.

To learn more about the router, refer to the [Router Documentation](./packages/router/).

## Automatic Serialization & Validation

mion utilizes [Deepkit's runtime types](https://deepkit.io/) for automatic validation and serialization. Deepkit's magic enables type information to be available at runtime, allowing for automatic validation and serialization of data.

By leveraging runtime types, mion offers advanced capabilities such as request validation and response/request serialization that topically involves using more than one framework. Please consult Deepkit's documentation for installation instructions and more information on these features.

## Type Safe Apis

![type safes apis](https://raw.githubusercontent.com/MionKit/mion/master/assets/public/type-safe-apis.gif)

## Quick Start

#### Server

Install dependencies:

```bash
npm install --save-dev @deepkit/type-compiler
npm install @mionkit/router
```

Depending if you using the server or serverless version

```bash
# http server
npm install @mionkit/http

# serverless
npm install @mionkit/serverless
```

Set up Deepkit runtime types by enabling reflection in your tsconfig.json file. For detailed instructions, refer to the [Deepkit Runtime Types Installation](https://docs.deepkit.io/english/runtime-types.html#runtime-types-installation) guide.

#### Client

Install dependencies:

```bash
npm install @mionkit/client
```

#### Base Project

You can also use the mion base project as a starting point by running `npx degit https://github.com/MionKit/mion-base``.

## Contributing

Contributors and maintainers are welcome 👍

Mion's philosophy is simplicity, so we don't want to add many features or abstractions, as an open source project we want to keep tha features we have to maintain to a minimum, that said contributions to mion are encouraged! Please open issues and submit pull requests for any improvements or bug fixes.

The project is organized as a monorepo using npm workspaces, NX, and Lerna. Each package within the monorepo is compiled and tested individually using TypeScript and Jest.

## Powered by:

- [Typescript](https://www.typescriptlang.org/)
- [Deepkit](https://deepkit.io/)
  <!-- - [Serverless Framework](https://www.serverless.com/)  -->
  <!-- - [AWS Cognito](https://aws.amazon.com/cognito/) -->
  <!-- - [Postgres.js](https://github.com/porsager/postgres) -->

<!-- ![powered by: deepkit, serverless, mion](./assets/public/tech-stack-830x100.png?raw=true) &nbsp;&nbsp; -->

---

_License: [MIT](./LICENSE)_
