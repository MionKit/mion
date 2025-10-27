---
seo:
  title: mion - Full Stack APIs at the speed of light
  description: mion is a lightweight typescript framework designed to build Full Stack APIs, 
    That fully typed client and automatic validation and serialization out of the box.
    You Frontend can use the APIs as if they were local functions.
  image: https://mion.io/banners/mion-website-banner-1-2.png
---

:ellipsis{right=0px width=75% blur=150px}

::u-page-hero{class="home-hero"}
#title
Full Stack APIs<br/> :typed-title 

<!-- :icon{name="icon-park-outline:flash-payment"} -->

#description
## mion is a lightweight framework designed to build APIs that are type-safe, with automatic validation and serialization out of the box.

#links
  :::u-button
  ---
  color: neutral
  size: xl
  to: /introduction/quick-start
  trailing-icon: i-lucide-arrow-right
  ---
  Quick Start
  :::

  :::u-button
  ---
  color: neutral
  icon: simple-icons-github
  size: xl
  to: https://github.com/MionKit/mion
  variant: outline
  ---
  Star us on Github
  :::
::

::u-page-section
#title
Features

#root
:ellipsis{left=0px width=40rem top=10rem blur=140px}

#features
  :::u-page-feature
  ---
  icon: icon-park-outline:rectangular-circular-separation
  ---
  #title
  [RPC like](./1.introduction/1.about-mion.md#rpc-like)

  #description
  RPC like architecture for simpler and easier to consume APIs.
  Just use remote methods as any other local async method.
  :::

  :::u-page-feature
  ---
  icon: icon-park-outline:code-computer
  ---
  #title
  [Fully Typed Client](./2.docs/4.client.md)

  #description
  Fully typed client with static type checking, autocompletion, automatic validation and serialization.
  :::

  :::u-page-feature
  ---
  icon: icon-park-outline:flash-payment
  ---
  #title
  [Fast](./4.benchmarks/1.hello-world.md)

  #description
  Quick cold starts and a simple in-memory map for route lookup makes mion extremely fast.
  :::

  :::u-page-feature
  ---
  icon: icon-park-outline:protect
  ---
  #title
  [Automatic Validation](./2.docs/7.validation-and-serialization.md)

  #description
  mion uses `@deepkit/type` library that makes types available at runtime.
  This allows validation without any extra boilerplate required.
  :::

  :::u-page-feature
  ---
  icon: icon-park-outline:text
  ---
  #title
  [Automatic Serialization](./2.docs/7.validation-and-serialization.md)

  #description
  Out of the box serialization of native objects like Date, Map or Class, etc. Any JS object can be directly serialized to JSON.
  :::

  :::u-page-feature
  ---
  icon: simple-icons:typescript
  ---
  #title
  End To End Type Safety

  #description
  You can easily refactor your API and changes will be safely picked by the client or
  validate data directly on the client.
  :::

  :::u-page-feature
  ---
  icon: icon-park-outline:play
  ---
  #title
  Write Once Run Everywhere

  #description

  :platform-tiles 
  Run mion APIs in [Node.js](./3.platforms/1.node-js.md), [Bun](./3.platforms/2.bun.md) or Serverless platforms like [Aws Lambda](./3.platforms/1.aws-lambda.md) and [Google cloud functions](./3.platforms/1.google-cloud-functions.md).
  :::
::




[&nbsp;]{style="padding-bottom: 6rem;"}
