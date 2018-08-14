<p align="center">
  <img alt='API DS, The APi Dashboard' src='https://raw.githubusercontent.com/apids/apids/master/logo/public/logox150-inverse.png'>
</p>
<p align="center">
  <strong>API DS is Framework and Admin Dashboard to build and manage REST APIs</strong>.<br/>
   It is build on top of standards like 
<a href='http://json-schema.org/' target='_blank'>Json-Schema</a>
and <a href='https://www.openapis.org' target='_blank'>Open Api</a>
</p>

---

## Features

- Build APIs using [Node.js](https://nodejs.org/en/) and [Typescript](https://www.typescriptlang.org/).
- Models editor.
- [Open API](https://www.openapis.org/) editor.
- Automatic Typescript code generation.
- Default User, Groups and Assets Models and Rest Endpoints.
- Simple Access Control List.
- Automatic Server & Client side validation.
- Built for performance.

## Architecture

<!-- prettier-ignore-start -->
| Models Definition  | API Definition | Typescript Models | REST Server |
| ------------------ | -------------- | ----------------- | ----------- |
| Models are defined using [json-schemas](http://json-schema.org/) and custom properties to configure persistence | Open-API Definition files are automatically generated using the Models. | Typescript code and .tsd definition files are automatically generated from the Open-API definition files. | A lightweight server is implemented using [Zeit's Micro](https://github.com/zeit/micro). this can be customized to support microservices architecture. |
<!-- prettier-ignore-end -->

## Tools

API DS takes a completely different approach than traditional frameworks and offers a Web interface to define Models and the REST API.

<!-- prettier-ignore-start -->
| Web Dashboard | Code Generation |
|-------------- | --------------- |
| Models are defined using JSON-schema and the REST API is defined using Open-API definition files, but the integrated Dashboard simplifies this process trillions of times for developer's joy. | The Models defined in JSON-schemas are translated to TypeORM models and and the REST Endpoints are translated to microservices defined using Zeit/Micro library |
<!-- prettier-ignore-end -->

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

&nbsp;  
&nbsp;

---

_Powered by:_

![node.js](https://github.com/apids/apids/blob/master/logo/other_logos/node.png?raw=true) &nbsp;&nbsp;
![Typescript](https://github.com/apids/apids/blob/master/logo/other_logos/ts.png?raw=true) &nbsp;&nbsp;
![typeORM](https://github.com/apids/apids/blob/master/logo/other_logos/typeorm.png?raw=true) &nbsp;&nbsp;
![Open Api](https://github.com/apids/apids/blob/master/logo/other_logos/open-api.png?raw=true) &nbsp;&nbsp;
![vue.js](https://github.com/apids/apids/blob/master/logo/other_logos/vue.js.png?raw=true) &nbsp;&nbsp;

[MIT](./LICENSE) license.
