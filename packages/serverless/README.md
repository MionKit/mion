<p align="center">
  <img alt='MikroKit, The APi Dashboard' width="" src='../../assets/public/bannerx90.png?raw=true'>
</p>
<p align="center">
  <strong>Mikro but powerful server(less) for Api development.
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/travis/mikrokit/mikrokit.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mikrokit/serverless`

**_[MikroKit Router](../router/README.md) is an RPC like router oriented for Api development,_** &nbsp; but is agnostic about the server or serverless environment it is used. It could be used on aws lambda, azure functions, an http server, etc...

This package contains a collection bindings and a basic http server based in the MikroKit Router.

## AWS Lambda

## Azure Functions

## Google Cloud Functions

## Mikro Http

This is a limited http server, only supports `application/json` content type, does not support multipart/form-data, no websocket or streams, it waits for the request end 'event' before calling the route. No file upload support neither, Applications should use third party File Storage services for this.

**_It is suited only for modern APIs where not to large request/response data us used._**

## &nbsp;

_[MIT](../../LICENSE) LICENSE_
