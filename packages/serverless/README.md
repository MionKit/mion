<p align="center">
  <img alt='MikroKit, The APi Dashboard' width="" src='../../assets/public/bannerx90.png?raw=true'>
</p>
<p align="center">
  <strong>Mikrokit Server... less.
  </strong>
</p>
<p align=center>
  <img src="https://img.shields.io/travis/mikrokit/mikrokit.svg?style=flat-square&maxAge=86400" alt="Travis" style="max-width:100%;">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mikrokit/serverless`

[MikroKit Router](../router/README.md) is agnostic about the server or serverless environment it is used. It could be used on aws lambda, azure functions, a simple http server, etc... Thick package contains a collection serverless handlers and a basic http server based in the MikroKit Router.

## AWS Lambda

## Azure Functions

## Google Cloud Functions

## HTTP Server

This is a limited http server, only supports application/json, does not support multipart/form-data, no websocket or streams, it waits for the request end 'event' before calling the route. it is suited only for modern APis where not to large request/response data us used. No file upload support neither, Applications can use third party File Storage services for this.

## &nbsp;

_[MIT](../../LICENSE) LICENSE_
