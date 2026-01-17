---
seo:
  title: mion - the definitive TypeScript framework for Full Stack APIs
  description: mion is the definitive TypeScript framework for Full Stack APIs, built for exceptional developer experience.
  image: https://mion.io/banners/mion-website-banner-1-2.png
pageClass: home-page
---

:home-page-body

::gradient-bg
---
angle: 70
opacity: 0.2
blur: 150px
---
::

::u-page-hero{class="home-hero"}
#header
  :::typed-title
  ---
  leading: "Typescript Full Stack APIs"
  titles:
    - 'At The Speed Of Light ⚡'
    - 'Are Safer To Refactor'
    - 'Are Developer Friendly'
    - 'Are Not RestFull APIs'
    - 'Are Serverless Ready'
    - 'Are Made For SaaS'
    - 'Are RPC like'
  ---
  #description
  mion is the definitive TypeScript framework for Full Stack APIs, built for exceptional developer experience.
  :::

#links
  :::u-button
  ---
  color: primary
  size: xl
  to: /introduction/about-mion
  icon: icon-park-outline:book-one
  class: btn-docs
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
:::gradient-bg
---
angle: 70
opacity: 0.15
top: 10rem
blur: 140px
---
:::

#body
  :::card-group
  ---
  class: lg:grid-cols-3
  ---
    ::::card
    ---
    title: RPC like
    to: /introduction/about-mion#rpc-like
    ---
    RPC like architecture for simpler and easier to consume APIs.
    Just use remote methods as any other local async method.
    ::::

    ::::card
    ---
    title: Fully Typed Client
    to: /client/client-overview
    ---
    Fully typed client with static type checking, autocompletion, automatic validation and serialization.
    ::::

    ::::card
    ---
    title: Fast
    to: /benchmarks/hello-world
    ---
    Quick cold starts and a simple in-memory map for route lookup makes mion extremely fast.
    ::::

    ::::card
    ---
    title: Automatic Validation
    to: /server/validation-and-serialization
    ---
    Out of the box validation of Remote function parameters and return types.
    Full type safety without needed for schema libraries, just from Typescript types.
    ::::

    ::::card
    ---
    title: Automatic Serialization
    to: /server/validation-and-serialization
    ---
    Out of the box serialization of native objects like Date, Map or Class, all of them can be directly serialized to JSON.
    ::::

    ::::card
    ---
    title: End To End Type Safety
    to: /run-types/overview
    ---
    You can easily refactor your API and changes will be safely picked by the client or
    validate data directly on the client.
    ::::

    ::::card
    ---
    title: Write Once Run Everywhere
    to: /platforms/overview
    class: sm:col-span-2 lg:col-span-3 text-center
    ---

    :platform-tiles

    Run mion APIs in [Node.js](/platforms/node-js), [Bun](/platforms/bun) or Serverless platforms like [Aws Lambda](/platforms/aws-lambda) and [Google cloud functions](/platforms/google-cloud-functions).
    ::::
  :::
::




[&nbsp;]{style="padding-bottom: 6rem;"}
