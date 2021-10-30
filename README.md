<p align="center">
  <img alt='API DS, The APi Dashboard' src='https://raw.githubusercontent.com/apids/apids/master/logo/public/logox150-inverse.png'>
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

## Architecture

<!-- prettier-ignore-start -->
| Models Definition  | API Definition | Typescript Models | REST Server |
| ------------------ | -------------- | ----------------- | ----------- |
| Models are defined using [json-schemas](http://json-schema.org/) and custom properties to configure persistence | Open-API Definition files are automatically generated using the Models. | Typescript code and .tsd definition files are automatically generated from the Open-API definition files. | A lightweight server is implemented using [Fastify](https://www.fastify.io/). this can be customized to support serverless architecture. |
<!-- prettier-ignore-end -->

**Json Schema vs Open API Schemas**  
Due to the nature of Models defined for persistence there are some divergences between json schema specification and Open-API specification. These divergances can be found here:  
https://github.com/OAI/OpenAPI-Specification/blob/OpenAPI.next/versions/3.0.0.md#schemaObject

## Developer Tools

API DS heavily relies on code generation during development time.  
Bellow is the typical development workflow:

1. Write your model definitions using json schema
2. Automatically generate Open Api spec files from your models
   ```
   apids g rest
   ```
3. Automatically generate your typescript models from json schema
   ```
   apids g types
   ```
4. Edit and customize your open api spec files.
5. Automatically generate your fastify server files from your json schemas and open api spec files
   ```
   apids g fastify
   ```

Execute all steps in one (generate api spec, types and server files)

```
apids g
```

## Web Dashboard (Coming Later)

The integrated web dashboard simplifies the process of generate and edit json schemas and the Open-Api spec files.

## Quick Start

Install API DS

```sh
npm install apids
```

To create your first project fork the [apids-starter](https://github.com/apids/apids-strater) repo.

## Contributing

You are welcome to open issues and pull request! 👍

**TSLint and prettier:**  
All pull request must pass TSLint and [prettier](https://github.com/prettier/prettier) before being merged.  
Run bellow command to automatically format all typescript files and check Lint errors.

```sh
npm run format-ts && npm run lint
```

**Testing using Jest and Typescript:**  
Tests are implemented using Jest and must be written in typescript or tsx. ts-jest is used tu automatically
run ts files without need to precompile to js.

## &nbsp;

_Powered by:_

![node.js](https://github.com/apids/apids/blob/master/logo/other_logos/node.png?raw=true) &nbsp;&nbsp;
![Typescript](https://github.com/apids/apids/blob/master/logo/other_logos/ts.png?raw=true) &nbsp;&nbsp;
![Open Api](https://github.com/apids/apids/blob/master/logo/other_logos/open-api.png?raw=true) &nbsp;&nbsp;
![Fastify](https://github.com/apids/apids/blob/master/logo/other_logos/fastify.js.png?raw=true) &nbsp;&nbsp;

_License: [MIT](./LICENSE)_
