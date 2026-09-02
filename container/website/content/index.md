---
seo:
  title: TypeScript APIs and runtime types
  description: Type safe full stack APIs and runtime types generated from your TypeScript, built for speed and a smooth developer experience.
  image: /banners/mion-v2-website-banner.png
pageClass: home-page
---

::gradient-bg
---
angle: 70
opacity: 0.2
blur: 150px
---
::

::div{data-site="rpc" class="home-subsite"}
  :::u-page-section
  ---
  class: home-features home-subsite-card
  ---
  #title
  RPC framework<br>Full stack APIs at the speed of light

  #body
    ::::div{class="home-intro"}
    Write a plain TypeScript function, and it is an API route. Params and results are validated and serialized for you, and the client calls remote routes like local async functions, with full types and autocompletion.

      :::::div{class="home-links"}
        ::::::u-button
        ---
        color: primary
        size: lg
        to: /rpc/introduction/about-mion-rpc
        icon: icon-park-outline:book-one
        ---
        Learn more about the RPC framework
        ::::::
      :::::
    ::::

    ::::div{class="home-split home-split--code"}
      :::::twoslash-code
      ---
      path: packages/examples/src/_homepage/home-rpc-server.ts
      title: server.ts
      ---
      :::::

      :::::twoslash-code
      ---
      path: packages/examples/src/_homepage/home-rpc-client.ts
      title: client.ts
      ---
      :::::
    ::::
  :::
::

::div{data-site="runtypes" class="home-subsite"}
  :::u-page-section
  ---
  class: home-features home-subsite-card
  ---
  #body
    ::::div{class="home-split home-split--top"}
      :::::div{class="home-pitch"}
      ## RunTypes<br>One type, many functions

      Your validator already knows the exact shape of your data. RunTypes turns that same knowledge into validation, JSON and binary serialization, mock data and reflection, generated at build time straight from your TypeScript types. No schemas, no drift.

        ::::::div{class="home-links"}
          :::::::u-button
          ---
          color: primary
          size: lg
          to: /runtypes/introduction/about-mion-runtypes
          icon: icon-park-outline:book-one
          ---
          Read the RunTypes docs
          :::::::
        ::::::
      :::::

      :::::twoslash-code
      ---
      path: packages/examples/src/_homepage/home-run-types.ts
      title: run-types.ts
      ---
      :::::
    ::::
  :::
::

::div{data-site="benchmarks" class="home-subsite"}
  :::u-page-section
  ---
  class: home-features home-subsite-card
  ---
  #body
    ::::div{class="home-split home-split--top"}
      :::::div{class="home-pitch"}
      ## Performance from the ground up!

      Speed and memory efficiency are a design goal, measured from the first commit. Validation and serialization are compiled at build time, so your app imports no runtime library for them: smaller bundles, faster cold starts and less memory, which makes mion a natural fit for edge and serverless runtimes. The RPC server is benchmarked against express, fastify, hono and friends, and RunTypes against the fastest validators. Every number is generated on deploy from the code in this repository.

        ::::::div{class="home-links"}
          :::::::u-button
          ---
          color: primary
          size: lg
          to: /benchmarks/introduction/mion-benchmarks
          icon: i-lucide-gauge
          ---
          See the benchmarks
          :::::::
        ::::::
      :::::

      :::::div{class="home-bench-column"}
      :home-bench-table{servers="servers-hello-world" validation="validation"}
      :::::
    ::::
  :::
::
