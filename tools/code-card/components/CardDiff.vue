<script setup lang="ts">
// GitHub's diffstat line: +added −removed and five squares in their ratio.
import {isCount, nextStep, toNumber} from './shared.ts';

const props = defineProps({
  added: {type: [String, Number], required: true, validator: isCount},
  removed: {type: [String, Number], required: true, validator: isCount},
  label: {type: String, default: ''},
});

const added = toNumber(props.added);
const total = added + toNumber(props.removed);
const green = total === 0 ? 0 : Math.round((added / total) * 5);
const squares = Array.from({length: 5}, (_, i) => (total === 0 ? 'cc-none' : i < green ? 'cc-add' : 'cc-del'));
const step = nextStep();
</script>

<template>
  <div class="cc-diff" data-cc="rise" :style="step">
    <span v-if="label" class="cc-what">{{ label }}</span><span class="cc-add">+{{ String(props.added) }}</span
    ><span class="cc-del">−{{ String(props.removed) }}</span>
    <span class="cc-squares"
      ><i v-for="(kind, i) in squares" :key="i" :class="kind" data-cc="fade" :style="{...step, '--cc-sub': i + 2}"></i
    ></span>
  </div>
</template>
