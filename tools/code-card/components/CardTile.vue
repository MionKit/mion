<script setup lang="ts">
// One big number in the accent gradient, its label under it.
import {isTileValue, nextStep} from './shared.ts';

defineProps({
  value: {type: String, required: true, validator: isTileValue},
  label: {type: String, required: true},
});
const step = nextStep();
</script>

<template>
  <div class="cc-tile" data-cc="rise" :style="step">
    <b data-check="one-line">{{ value }}</b><span>{{ label }}</span>
  </div>
</template>
