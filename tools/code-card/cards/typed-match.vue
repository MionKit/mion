<script setup lang="ts">
import code from './typed-match.snippet.ts?raw';
</script>

<template>
  <CardFrame
    subtitle="Match unknown data by type. The runtime check is generated at build time."
    footer="No schemas to keep in sync. Just TypeScript."
    badge="@mionjs/run-types"
  >
    <template #title><em>Typed match</em> coming soon to run-types</template>
    <CardWindow file="feed.ts">
      <CardCode :code="code" highlight="11-12" />
    </CardWindow>
  </CardFrame>
</template>
