---
seo:
  title: mion - Full Stack APIs at the speed of light
  description: mion is a lightweight typescript framework designed to build Full Stack APIs, 
    And offer the best developer experience.
  image: https://mion.io/banners/mion-website-banner-1-2.png
---

:ellipsis{right=0px width=75% blur=150px}

::u-page-hero{class="home-hero"}
#title
Full Stack APIs<br/> :typed-title 

<!-- :icon{name="icon-park-outline:flash-payment"} -->

#description
## mion is a lightweight framework designed to build APIs that are type-safe, and offer the best developer experience.

#links
  :::u-button
  ---
  color: primary
  size: xl
  to: /introduction/about-mion
  icon: icon-park-outline:book-one
  ---
  Read the Docs
  :::

  :::u-button
  ---
  color: neutral
  icon: simple-icons-github
  size: xl
  to: https://github.com/MionKit/mion
  variant: outline
  ---
  Give us Star
  :::
::

::u-page-section
#title
Features

#root
:ellipsis{left=0px width=40rem top=10rem blur=140px}

#body
  :::u-page-grid
    ::::u-page-card
    ---
    icon: icon-park-outline:rectangular-circular-separation
    ---
    #title
    [RPC like](./1.introduction/1.about-mion.md#rpc-like)
    #description
    RPC like architecture for simpler and easier to consume APIs.
    Just use remote methods as any other local async method.
    ::::

    ::::u-page-card
    ---
    icon: icon-park-outline:code-computer
    ---
    #title
    [Fully Typed Client](./2.client/0.client-overview.md)
    #description
    Fully typed client with static type checking, autocompletion, automatic validation and serialization.
    ::::

    ::::u-page-card
    ---
    icon: icon-park-outline:flash-payment
    ---
    #title
    [Fast](./4.benchmarks/1.hello-world.md)
    #description
    Quick cold starts and a simple in-memory map for route lookup makes mion extremely fast.
    ::::

    ::::u-page-card
    ---
    icon: icon-park-outline:protect
    ---
    #title
    [Automatic Validation](./2.server/7.validation-and-serialization.md)
    #description
    Out of the box validation of Remote function parameters and return types.
    Full type safety without needed for schema libraries, just from Typescript types.
    ::::

    ::::u-page-card
    ---
    icon: icon-park-outline:text
    ---
    #title
    [Automatic Serialization](./2.server/7.validation-and-serialization.md)
    #description
    Out of the box serialization of native objects like Date, Map or Class, all of them can be directly serialized to JSON.
    ::::

    ::::u-page-card
    ---
    icon: simple-icons:typescript
    title: End To End Type Safety
    ---
    #title
    [End To End Type Safety](./4.run-types/0.overview.md)

    #description
    You can easily refactor your API and changes will be safely picked by the client or
    validate data directly on the client.
    ::::

    ::::u-page-card
    ---
    class: group sm:col-span-2 lg:col-span-3 text-center flex flex-col items-center justify-center
    ---
    #title
    [Write Once Run Everywhere](./3.platforms/0.overview.md)

    #description

    :platform-tiles

    Run mion APIs in [Node.js](./3.platforms/1.node-js.md), [Bun](./3.platforms/2.bun.md) or Serverless platforms like [Aws Lambda](./3.platforms/1.aws-lambda.md) and [Google cloud functions](./3.platforms/1.google-cloud-functions.md).
    ::::
  :::
::




[&nbsp;]{style="padding-bottom: 6rem;"}
