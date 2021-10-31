<p align="center">
  <img alt='API DS, The APi Dashboard' src='./assets/public/logox150-inverse.png?raw=true'>
</p>
<p align="center">
  <strong>API DS is a set of tools to build REST APIs using 
    <a href='https://nodejs.org/' target='_blank'>Node</a>,
    <a href='https://www.typescriptlang.org/' target='_blank'>Typescript</a> and
    <a href='https://www.fastify.io/' target='_blank'>Fastify</a>.
  </strong><br/>
   It is build on top of standards like 
<a href='http://json-schema.org/' target='_blank'>Json Schema</a>
and <a href='https://www.openapis.org' target='_blank'>Open Api</a>.<br/>
</p>

---

<p align=center>
<img src="https://img.shields.io/travis/apids/apids.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
<img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
<img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

&nbsp;

## Features

**Automatic code generation.**

- Automatic [Open Api](https://www.openapis.org/) spec files generation.
- Automatic Typescript Models generation.
- Automatic server code generation.
- Automatic Server & Client side validation from Json schemas and Api spec files.

**API DS starter project**

- Default User, Groups and Assets Models and Rest Endpoints.
- Simple Access Control List.

**Web Dashboard (Coming Later)**

- Models editor.
- [Open API](https://www.openapis.org/) editor.

&nbsp;

## Workflow

![workflow](./assets/public/workflow.png?raw=true)

<!-- prettier-ignore-start -->
| ⓵ Models Definition | ⓶ Typescript | ⓷ API Spec Files | ⓸ Fastify Server |
| ------------------ | -------------- | ----------------- | ----------- |
| Models are defined using [Json Schema](http://json-schema.org/). Optionally  custom properties can be used to configure persistence. | Typescript models are automatically generated from the Json Schema Models. | Open-API Definition files with basic crud operations are automatically generated from the Json Shchema Models. | A [Fastify](https://www.fastify.io/) lightweight server implementation is automatically  generated from the Api spec files, the Types and Json Schemas. |
<!-- prettier-ignore-end -->

> **Json Schema vs Open API Schemas**  
> Due to the nature of Models defined for persistence there are some divergences between json schema specification and Open-API specification. These divergances can be found [here!](https://github.com/OAI/OpenAPI-Specification/blob/OpenAPI.next/versions/3.0.0.md#schemaObject)

&nbsp;

## Command line tool

API DS heavily relies on code generation during development time. Use the the generate command to generate artifacts.

```shell
## generate Api spec files
apids g rest

## generate Typescript models
apids g types

## generate Fastify server files
apids g fastify

## generate all artifacts in one go (api spec, types and server files)
apisds g
```

&nbsp;

## Web dashboard (coming later)

The integrated web dashboard simplifies the process of generate and edit json schemas and the Open-Api spec files.

&nbsp;

## Quick start

Install API DS

```sh
npm install apids
```

To create your first project fork the [apids-starter](https://github.com/apids/apids-strater) repo.

&nbsp;

## Contributing

You are welcome to open issues and pull request! 👍

**Monorepo:**  
This project is a monorepo managed using [lerna](https://lerna.js.org/) and npm [workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces). (`npm >= 7` required)

```sh
npm i lerna -g
```

Each package of this monorepo is compiled and tested individually.

```sh
cd packages/cli
```

**Typescript compiling:**

```sh
npm run dev
```

**Unit testing using Jest:**  
Tests are implemented using Jest and must be written in typescript . ts-jest is used tu automatically
run ts files without need to precompile to js.

```sh
npm run dev:test
```

**ESLint and Prettier:**  
All pull request must pass ESLint and [prettier](https://github.com/prettier/prettier) before being merged.  
Run bellow command to automatically format all typescript files and check Lint errors.

```sh
npm run format && npm run lint
```

**Build:**

```
npm run build
```

## &nbsp;

_Powered by:_

![node.js](./assets/other_logos/node.png?raw=true) &nbsp;&nbsp;
![Typescript](./assets/other_logos/ts.png?raw=true) &nbsp;&nbsp;
![Open Api](./assets/other_logos/open-api.png?raw=true) &nbsp;&nbsp;
![Fastify](./assets/other_logos/fastify.js.png?raw=true) &nbsp;&nbsp;

_License: [MIT](./LICENSE)_
