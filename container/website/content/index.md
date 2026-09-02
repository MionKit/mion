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

::u-page-hero{class="home-hero"}
#title
Your TypeScript types, at runtime and on the wire.

#description
mion turns the types you already write into fast APIs, validation, serialization and mock data. Pick the part you need.

#links
  :::u-button
  ---
  color: primary
  size: xl
  to: /rpc
  icon: icon-park-outline:lightning
  ---
  RPC
  :::

  :::u-button
  ---
  color: neutral
  size: xl
  to: /runtypes
  icon: i-lucide-braces
  variant: outline
  ---
  RunTypes
  :::

  :::u-button
  ---
  color: neutral
  size: xl
  to: /benchmarks
  icon: i-lucide-gauge
  variant: outline
  ---
  Benchmarks
  :::
::

::div{data-site="rpc" class="home-subsite"}
  :::u-page-section
  ---
  class: home-features
  ---
  #title
  RPC: full stack APIs at the speed of light

  #description
  Write a plain TypeScript function, and it is an API route. Params and results are validated and serialized for you, and the client calls remote routes like local async functions, with full types and autocompletion.

  #links
    ::::u-button
    ---
    color: primary
    size: lg
    to: /rpc
    icon: icon-park-outline:book-one
    ---
    Read the RPC docs
    ::::

    ::::u-button
    ---
    color: neutral
    size: lg
    to: /rpc/introduction/quick-start
    icon: i-lucide-rocket
    variant: outline
    ---
    Quick start
    ::::
  :::
::

::div{data-site="runtypes" class="home-subsite"}
  :::u-page-section
  ---
  class: home-features
  ---
  #title
  RunTypes: one type, many functions

  #description
  Your validator already knows the exact shape of your data. RunTypes turns that same knowledge into validation, JSON and binary serialization, mock data and reflection, generated at build time straight from your TypeScript types. No schemas, no drift.

  #links
    ::::u-button
    ---
    color: primary
    size: lg
    to: /runtypes
    icon: icon-park-outline:book-one
    ---
    Read the RunTypes docs
    ::::

    ::::u-button
    ---
    color: neutral
    size: lg
    to: /runtypes/introduction/quick-start
    icon: i-lucide-rocket
    variant: outline
    ---
    Quick start
    ::::

    ::::u-button
    ---
    color: neutral
    size: lg
    to: /runtypes/playground
    icon: i-lucide-flask-conical
    variant: outline
    ---
    Playground
    ::::
  :::
::

::div{data-site="benchmarks" class="home-subsite"}
  :::u-page-section
  ---
  class: home-features
  ---
  #title
  Benchmarks: numbers from this repository

  #description
  The RPC server measured against express, fastify, hono and friends, and RunTypes validation and serialization measured against the fastest validators. Every number is generated on deploy from the code in this repository.

  #links
    ::::u-button
    ---
    color: primary
    size: lg
    to: /benchmarks
    icon: i-lucide-gauge
    ---
    See the benchmarks
    ::::
  :::
::
