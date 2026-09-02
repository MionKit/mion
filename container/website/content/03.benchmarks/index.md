---
seo:
  title: mion benchmarks - RPC servers and RunTypes validation
  description: How fast the mion RPC server and RunTypes are, measured against other frameworks and validators on every deploy.
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
Benchmarks

#description
Two families, one rule: every number on these pages is generated on deploy, from the code in this repository, so it never drifts from the released version.

#links
  :::u-button
  ---
  color: primary
  size: xl
  to: /benchmarks/rpc/hello-world
  icon: icon-park-outline:lightning
  ---
  RPC servers
  :::

  :::u-button
  ---
  color: neutral
  size: xl
  to: /benchmarks/runtypes/validation
  icon: i-lucide-braces
  variant: outline
  ---
  RunTypes validation
  :::
::

::u-page-section
---
class: home-features
---
#title
RPC: requests per second

#description
A hello world route on mion (node, uWebSockets and bun) against express, fastify, hapi, hono, elysia and a bare node server. Routing and framework overhead only, no validation, so it is about as fast as each framework can get.

#body
:bench-chart{bench="servers-hello-world" metric="requests"}

[All rpc server benchmarks: hello world, light and heavy validation, payload sizes →](/benchmarks/rpc/hello-world)
::

::u-page-section
---
class: home-features
---
#title
RunTypes: validation throughput

#description
The fast is-valid check on the same types and payloads across the fastest validators. RunTypes also measures error reporting, JSON and binary serialization, compile time and correctness, all on their own pages.

#body
:::perf-bars
---
caption: Validation throughput, is-valid check (ops/sec, higher is better)
footnote: Zod has no fast is-valid path. It validates by parsing to errors, so its bar is the error-reporting result.
bars:
  - name: mion
    score: 40.6
    label: 40.6M
    highlight: true
  - name: typia
    score: 39.7
    label: 39.7M
  - name: typebox-Jit
    score: 38.2
    label: 38.2M
  - name: ajv-Jit
    score: 36.9
    label: 36.9M
  - name: zod
    score: 7.9
    label: 7.9M
    muted: true
---
:::

[All RunTypes benchmarks: validation, errors, serialization, compile time, correctness →](/benchmarks/runtypes/validation)
::
