<script setup lang="ts">
// One label / value row of a CardFacts list.
import {nextStep} from './shared.ts';

defineProps<{label: string; value: string}>();
const step = nextStep();
</script>

<template>
  <div class="cc-fact" data-cc="rise" data-check="one-line" :style="step">
    <span>{{ label }}</span><b>{{ value }}</b>
  </div>
</template>
