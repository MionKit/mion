<script setup lang="ts">
// One gate (a compiler, a check) drawn as a wall, which each CardLane passes or is stopped at.
import {provide} from 'vue';
import {GATE_KEY, type Gate, nextStep} from './shared.ts';

const props = withDefaults(defineProps<{gate: string; outcome?: string}>(), {outcome: ''});
defineSlots<{default(): unknown}>();
if (!props.gate.trim()) throw new Error('CardLanes: the gate needs a name');
const step = nextStep();
provide<Gate>(GATE_KEY, {name: props.gate, step});
</script>

<template>
  <div class="cc-lanes">
    <i class="cc-wall" data-cc="wall" :style="step"></i>
    <div class="cc-lanes-head" data-cc="fade" :style="step">
      <span class="cc-gate-name" data-check="one-line">{{ gate }}</span
      ><span v-if="outcome" class="cc-outcome" data-check="one-line">{{ outcome }}</span>
    </div>
    <slot />
  </div>
</template>
