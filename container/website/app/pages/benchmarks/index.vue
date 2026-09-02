<!-- The benchmarks landing page: content/*.benchmarks/index.md through the shared SiteLanding. The
     wrapper carries the subsite's data-site in the markup itself, so the page paints in
     its own colours from the first frame of a client-side navigation, before the
     attribute on <html> (plugins/site-attr.ts, what the header reads) catches up. -->
<template>
  <div
    data-site="benchmarks"
    class="site-page"
  >
    <SiteLanding />
  </div>
</template>
