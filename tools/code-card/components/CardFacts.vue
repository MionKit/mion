<script setup lang="ts">
// A compact 2-column list of CardFact rows.
defineSlots<{default(): unknown}>();
</script>

<template>
  <div class="cc-facts"><slot /></div>
</template>
