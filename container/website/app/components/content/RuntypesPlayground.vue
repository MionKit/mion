<script setup lang="ts">
// RuntypesPlayground - the MDC-facing entry for the embedded playground. The heavy
// Monaco + WASM UI lives in <PlaygroundStage> (a client-only component: it touches
// window / WebAssembly / Monaco, so it must never render during SSR). This wrapper
// keeps the docs-facing props API (type / operation / input / height) and shows a
// placeholder until the client component mounts.
//
// The playground fetches its host-built assets from /playground-app/ (the resolver
// WASM + the ts-runtypes source overlay), staged by
// container/website/scripts/build-playground.sh. If they are missing, the stage
// component surfaces its own error state.
withDefaults(
  defineProps<{
    // Initial TypeScript snippet (must define `MyType`). Omitted -> the stage's own seed type.
    type?: string;
    // Initial build function: validate | errors | jsonEncoder* | jsonDecoder* | binary* | graph.
    operation?: string;
    // Initial JS input for the chosen function.
    input?: string;
    // Min height reserved for the embedded playground (any CSS length).
    height?: string;
  }>(),
  {height: '520px'},
);
</script>

<template>
  <div class="rt-playground-embed" :style="{'--rt-pg-min-height': height}">
    <ClientOnly>
      <PlaygroundStage :type="type" :operation="operation" :input="input" :height="height" />
      <template #fallback>
        <p class="rt-playground-embed__status">
          Loading the playground. The resolver runs as WebAssembly (a few megabytes), so the first load takes a moment.
        </p>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.rt-playground-embed {
  margin: 1.5rem 0;
}
.rt-playground-embed__status {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: var(--rt-pg-min-height);
  margin: 0;
  padding: 10px 16px;
  color: var(--ui-text-muted, #8b949e);
  font-size: 13px;
  text-align: center;
}
</style>
