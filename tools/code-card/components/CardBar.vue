<script setup lang="ts">
// One row: a grey bar for before, an olive bar for after, both scaled to the larger, plus the % change.
import {isAmount, nextStep, toNumber} from './shared.ts';

const props = defineProps({
  label: {type: String, required: true},
  before: {type: [String, Number], required: true, validator: isAmount},
  after: {type: [String, Number], required: true, validator: isAmount},
  unit: {type: String, default: ''},
});

const before = toNumber(props.before);
const after = toNumber(props.after);
if (before === 0 && after === 0) throw new Error(`CardBar "${props.label}": before and after are both 0`);
const top = Math.max(before, after);
// The floor keeps a tiny value visible as a sliver.
const width = (value: number) => `${Math.max((value / top) * 100, 0.8).toFixed(1)}%`;
const change = before === 0 ? undefined : Math.round(((after - before) / before) * 100);
const step = nextStep();
</script>

<template>
  <div class="cc-row" data-cc="rise" :style="step">
    <span class="cc-label" data-check="one-line">{{ label }}</span>
    <div class="cc-track">
      <i class="cc-before" :style="{width: width(before)}"></i
      ><i class="cc-after" data-cc="grow" :style="{width: width(after), ...step, '--cc-sub': 3}"></i>
    </div>
    <span class="cc-value"
      >{{ String(props.before) }} → <strong>{{ String(props.after) }}</strong>{{ unit ? ` ${unit}` : ''
      }}<em v-if="change !== undefined">{{ change > 0 ? '+' : '' }}{{ change }}%</em></span
    >
  </div>
</template>
