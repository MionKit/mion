---
seo:
  title: mion - the definitive TypeScript framework for Full Stack APIs
  description: mion is the definitive TypeScript framework for Full Stack APIs, built for exceptional developer experience.
  image: https://mion.io/banners/mion-v2-website-banner.png
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
  mion is the definitive TypeScript Framework **for Full Stack APIs**.   
  It offers **The best Developer Experience** for building Single Page Apps.
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
    ### RPC Like
    [RPC architecture](/introduction/about-mion#rpc-like) for simpler and easier to consume APIs.
    Just use remote methods as any other local async method.   
    mion is focused on offering the best developer experience.

    <br>
  
    [Fully validation adn serialization of params and results out of the box.](/server/validation)
    ::::

    ::::twoslash-code
    ---
    path: packages/examples/src/_homepage/home-server.ts
    title: mion-router.ts
    class: sm:col-span-2 lg:col-span-2
    ---
    ::::

    ::::card
    ---
    class: sm:col-span-2 lg:col-span-1 home-card
    ---
    ### Fully Typed Client
    [Fully typed client](/client/client-overview) that seamlessly bridges frontend and backend with static type checking, autocompletion, automatic validation and serialization.

    <br>
  
    Lightweight and framework-agnostic — use it with React, Vue, Svelte, or any frontend framework.
    ::::

    ::::twoslash-code
    ---
    path: packages/examples/src/_homepage/home-client.ts
    title: mion-client.ts
    class: sm:col-span-2 lg:col-span-2
    ---
    ::::

    ::::card
    ---
    class: sm:col-span-2 lg:col-span-1 home-card
    ---
    ### Routes Flows
    [Execute multiple routes in a single HTTP request](/client/client-flow). Batch API calls together, and Orchestrate router logic from the client.

    <br>

    ::note{class="text-sm"}
    [GraphQL-like data composition]{.text-highlighted} with the simplicity of RPC — resolve relationships in a single request using `serverMapFrom`.
    ::
    ::::

    ::::twoslash-code
    ---
    path: packages/examples/src/_homepage/home-mapFrom.ts
    title: mion-routesFlow.ts
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
    title: mion-run-types.ts
    class: sm:col-span-2 lg:col-span-2
    ---
    ::::

    ::::card
    ---
    class: sm:col-span-2 lg:col-span-1 home-card
    ---
    ### Drizzle ORM
    Auto-generate [Drizzle ORM](./drizzle-orm/drizzle-overview) table schemas directly from types using reflection.   
    [Simply extends your types with SQL/Drizzle specific configuration.]{.text-highlighted}   
    <br>
    [Keep DB and Validation/Serialization logic separated.]{.text-highlighted}
    ::::

    ::::twoslash-code
    ---
    path: packages/examples/src/_homepage/home-drizzle.ts
    title: mion-drizzle.ts
    class: sm:col-span-2 lg:col-span-2
    ---
    ::::

    ::::card
    ---
    to: /server/serialization#binary-serialization-in-detail
    class: sm:col-span-2 lg:col-span-1
    ---
    ### Binary Serialization 🚀
    [Our binary protocol is designed to support al Typescript features: unions, optional props, rest params, circular types and any type you can think about!]{.text-highlighted}
    
    Achieve smaller payloads and faster data transfer with automatic binary serialization for Dates, BigInts, Maps, Sets, and complex nested types.
    ::::

    ::::card
    ---
    class: sm:col-span-2 lg:col-span-2 text-center
    ---
    ### Write Once Run Everywhere
    ![Platforms](/platforms.png){.mx-auto}
    Run mion APIs in [Node.js](/platforms/node-js), [Bun](/platforms/bun) or Serverless platforms like [Aws Lambda](/platforms/aws-lambda), [Google Cloud Functions](/platforms/google-cloud-functions), [Cloudflare Workers](/platforms/cloudflare) and [Vercel](/platforms/vercel).
    ::::
  :::

  ## Seamless Integration

  ::::card
  ---
  class: sm:col-span-2 lg:col-span-3 text-center
  ---
  Most modern stacks are tools glued together — validation, routing, serialization, client generation — all wired manually. mion replaces that with a single integrated system, reducing boilerplate, inconsistencies, and maintenance overhead.
  <br>
  ![Seamless Integration](/tools.png){.mx-auto}
  ::::

  ## Solid Performance

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
  #### [Benchmarks (Req/S)](/benchmarks/heavy-validation)
  :bench-chart{id='update-requests'}
  ::::
  ::::
::




[&nbsp;]{style="padding-bottom: 6rem;"}

<!-- code-import-timestamp 1772230165065 -->
