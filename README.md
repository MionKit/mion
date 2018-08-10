<p align="center">
  <img alt='API DS, The APi Dashboard' src='https://raw.githubusercontent.com/apids/apids/master/logo/public/logox150-inverse.png'>
</p>
<p align="center">
  <strong>API DS is Framework and Admin Dashboard to build and manage REST APIs</strong>
</p>

---
API DS is build on top of standard technologies like [json-schema](http://json-schema.org/) and [Open Api](https://www.openapis.org/).

## Features

- Build APIs using [Node.js](https://nodejs.org/en/) and [Typescript](https://www.typescriptlang.org/).
- Models editor.
- [Open API](https://www.openapis.org/) editor and automatic Typescript code generation.
- Default User, Groups and Assets Models and Rest Endpoints.
- Simple Access Control List.
- Automatic Server & Client side validation.
- built for performance.

## Architecture

Models definition                            | API Definition                  | Typescript Models            | REST Server 
-------------------------------------------- | ------------------------------- | -----------------------------| -----------
Models are defined using [json-schemas](http://json-schema.org/) and custom properties to configure persistence | Open-API Definition files are automatically generated using the Models.  | Typescript code and .tsd definition files are automatically generated from the Open-API definition files. | A lightweight server is implemented using [Zeit's Micro](https://github.com/zeit/micro). this can be customized to support microservices architecture.

## Tools
API DS takes a completely different approach than traditional frameworks and offers a Web interface to define Models and the REST API.

Web Dashboard | Code Generation
------------- | ---------------
Models are defined using JSON-schema and the REST API is defined using Open-API definition files, but the integrated Dashboard simplifies this process trillions of times for developer's joy. | The Models defined in JSON-schemas are translated to TypeORM models and and the REST Endpoints are translated to microservices defined using Zeit/Micro library 


## Quick Start
Install apids
```sh
npm install apids
```
To create your first project fork the [apids-starter](https://github.com/apids/apids-strater) repo.


## Contributing

You are welcome to open issues and pull request! 👍   
Please run [prettier](https://github.com/prettier/prettier) before submitting your pull request. 
```sh
npm run prettier
```

---

*Powered by*   
![node.js](https://github.com/apids/apids/blob/master/logo/other_logos/node.png?raw=true) &nbsp;&nbsp;
![Typescript](https://github.com/apids/apids/blob/master/logo/other_logos/ts.png?raw=true) &nbsp;&nbsp;
![typeORM](https://github.com/apids/apids/blob/master/logo/other_logos/typeorm.png?raw=true) &nbsp;&nbsp;
![Open Api](https://github.com/apids/apids/blob/master/logo/other_logos/open-api.png?raw=true) &nbsp;&nbsp;
![vue.js](https://github.com/apids/apids/blob/master/logo/other_logos/vue.js.png?raw=true) &nbsp;&nbsp;
