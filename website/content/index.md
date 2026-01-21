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
---
class: home-features
---

#title
Mion Features

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
  class: sm:grid-cols-2 lg:grid-cols-3 home-code-cards
  ---
    ::::card
    ---
    class: sm:col-span-2 lg:col-span-1 home-card
    ---
    ### RPC *<sup>Like</sup>*
    [RPC architecture](/introduction/about-mion#rpc-like) for simpler and easier to consume APIs.
    Just use remote methods as any other local async method.
    ::::

    ::::twoslash-code
    ---
    path: packages/examples/src/_homepage/home-server.ts
    title: router.ts
    class: sm:col-span-2 lg:col-span-2
    ---
    ::::

    ::::card
    ---
    class: sm:col-span-2 lg:col-span-1 home-card
    ---
    ### Fully Typed Client
    [Fully typed client](/client/client-overview) with static type checking, autocompletion, automatic validation and serialization.
    ::::

    ::::twoslash-code
    ---
    path: packages/examples/src/_homepage/home-client.ts
    title: client.ts
    class: sm:col-span-2 lg:col-span-2
    ---
    ::::

    ::::card
    ---
    class: sm:col-span-2 lg:col-span-1
    ---
    ### RunTypes <sup>©</sup>
    mion use [RunTypes](/run-types/overview) behinds the scene to generate JIT-compiled validation and serialization functions directly from TypeScript types.

    RunTypes supports advanced [type formats](/run-types/type-formats) and can be used as a standalone library.

    <br>

    [No schemas libraries needed — Typescript is the single source of truth.]{.text-highlighted}
    ::::

    ::::twoslash-code
    ---
    path: packages/examples/src/_homepage/home-run-types.ts
    title: run-types.ts
    class: sm:col-span-2 lg:col-span-2
    ---
    ::::

    ::::card
    ---
    to: /platforms/overview
    class: sm:col-span-2 lg:col-span-3 text-center
    ---
    ### Write Once Run Everywhere
    :platform-tiles
    Run mion APIs in [Node.js](/platforms/node-js), [Bun](/platforms/bun) or Serverless platforms like [Aws Lambda](/platforms/aws-lambda) and [Google cloud functions](/platforms/google-cloud-functions).
    ::::
  :::

  ## Performance

  ::::card
  ---
  class: sm:col-span-2 lg:col-span-1 text-center
  ---
  
  :::::stylish-list
  ---
  type: check
  ---
  - [RPC-style routing]{.text-highlighted} - No URL parsing or regex matching, just direct in-memory Map lookup
  - [JIT-compiled validation/serialization]{.text-highlighted} - RunTypes generates optimized functions at startup
  - [Fast cold starts]{.text-highlighted} - Load routes in demand, no need to load all routes and jit functions at startup
  - [Lightweight architecture]{.text-highlighted} - Simple request/response handling
  :::::

  ::::div{class="lg:col-span-2"}
  #### [Hello World Benchmarks (Req/S)](/benchmarks/hello-world)
  :bench-chart{id='hello-requests'}
  ::::
  ::::
::




[&nbsp;]{style="padding-bottom: 6rem;"}

<!-- code-import-timestamp 1768967601993 -->
