---
seo:
  title: TypeScript APIs and runtime types
  description: Type safe full stack APIs and runtime types generated from your TypeScript, built for speed and a smooth developer experience.
  image: /banners/mion-v2-website-banner.png
pageClass: home-page
---

::div{data-site="rpc" class="home-subsite"}
  :::u-page-section
  ---
  class: home-features home-subsite-block
  ---
  #title
  [RPC framework]{.title-tone}<br>Full stack APIs at the speed of light

  #body
    ::::div{class="home-intro"}
    Write a plain TypeScript function, and it is an API route. Params are validated, and params and results make the JSON round trip for you. The client calls remote routes like local async functions, with full types and autocompletion.

      :::::div{class="home-links"}
        ::::::u-button
        ---
        color: primary
        size: lg
        to: /rpc
        icon: icon-park-outline:book-one
        ---
        Learn more about the RPC framework
        ::::::
      :::::
    ::::

    ::::div{class="home-split home-split--code"}
      :::::twoslash-code
      ---
      path: packages/private-examples/src/_homepage/home-rpc-server.ts
      title: server.ts
      ---
      :::::

      :::::twoslash-code
      ---
      path: packages/private-examples/src/_homepage/home-rpc-client.ts
      title: client.ts
      ---
      :::::
    ::::
  :::
::

::div{data-site="runtypes" class="home-subsite"}
  :::u-page-section
  ---
  class: home-features home-subsite-block
  ---
  #body
    ::::div{class="home-split home-split--top"}
      :::::div{class="home-pitch"}
      ## [RunTypes]{.title-tone}<br>Bringing TypeScript to runtime

      Everything is generated at compile time, derived from your types:

        :home-runtypes-tiles

        ::::::div{class="home-links"}
          :::::::u-button
          ---
          color: primary
          size: lg
          to: /runtypes
          icon: icon-park-outline:book-one
          ---
          Read the RunTypes docs
          :::::::
        ::::::
      :::::

      :::::twoslash-code
      ---
      path: packages/private-examples/src/_homepage/home-run-types.ts
      title: run-types.ts
      ---
      :::::
    ::::
  :::
::

::div{data-site="benchmarks" class="home-subsite"}
  :::u-page-section
  ---
  class: home-features home-subsite-block
  ---
  #body
    ::::div{class="home-split home-split--top"}
      :::::div{class="home-pitch"}
      ## [Performance]{.title-tone} from the ground up!

      Speed and memory efficiency are a design goal, measured from the first commit. Validation and the JSON round trip are compiled at build time, so your app imports no runtime library for them: smaller bundles, faster cold starts and less memory, which makes mion a natural fit for edge and serverless runtimes. The RPC server is benchmarked against express, fastify, hono and friends, and RunTypes against the fastest validators. Every number is generated on deploy from the code in this repository.

        ::::::div{class="home-links"}
          :::::::u-button
          ---
          color: primary
          size: lg
          to: /benchmarks
          icon: i-lucide-gauge
          ---
          See the benchmarks
          :::::::
        ::::::
      :::::

      :home-bench-table{servers="servers-heavy-validation" validation="validation"}
    ::::
  :::
::

::div{data-site="runtypes" class="home-subsite"}
  :::u-page-section
  ---
  class: home-features home-subsite-block
  ---
  #body
    ::::div{class="home-split home-split--top"}
      :::::div{class="home-pitch"}
      ## [Tested]{.title-tone} to the highest standard

      Every function mion generates for you is tested, and so is the build step that writes them. The suite covers validation, JSON round trip, mock data and reflection, on every type shape we could think of.
      :::::

      :home-test-tiles
    ::::
  :::
::

<!-- code-import-timestamp 1788544325666 -->
