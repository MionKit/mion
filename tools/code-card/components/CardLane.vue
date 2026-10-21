<script setup lang="ts">
// One lane of CardLanes: its steps enter, a packet runs to the gate, then passes through or bounces off it.
import {inject} from 'vue';
import {GATE_KEY, type Gate, nextStep} from './shared.ts';

type Step = {label: string; value: string};
const props = withDefaults(
  defineProps<{
    label: string;
    detail?: string;
    /** 1 to 3 steps before the gate; `value` is code, one line. */
    steps: Step[];
    result: string;
    note?: string;
    /** The packet bounces off the gate and the lane greys out. */
    stopped?: boolean;
    /** What runs to the gate, a few characters. */
    packet?: string;
  }>(),
  {detail: '', note: '', stopped: false, packet: '●'}
);

const gate = inject<Gate | null>(GATE_KEY, null);
if (!gate) throw new Error(`CardLane "${props.label}": put it inside a CardLanes`);
if (props.steps.length < 1 || props.steps.length > 3)
  throw new Error(`CardLane "${props.label}": holds 1 to 3 steps, got ${props.steps.length}`);
for (const step of props.steps)
  if (!step.label?.trim() || !step.value?.trim()) throw new Error(`CardLane "${props.label}": every step needs a label and a value`);
if ([...props.packet].length > 8) throw new Error(`CardLane "${props.label}": packet "${props.packet}" is over 8 characters`);

// Beats in play order.
const head = nextStep();
const stepBeats = props.steps.map(() => nextStep());
const run = nextStep();
const hit = nextStep();
const end = nextStep();
</script>

<template>
  <div class="cc-lane" :class="{'cc-stopped': stopped}">
    <div class="cc-lane-name" data-cc="rise" :style="head">
      <b data-check="one-line">{{ label }}</b><span v-if="detail">{{ detail }}</span>
    </div>
    <div class="cc-lane-path" :data-cc="stopped ? 'dim' : undefined" :style="end">
      <div class="cc-lane-steps" :data-cc="stopped ? 'shake' : undefined" :style="hit">
        <div v-for="(step, i) in steps" :key="i" class="cc-step" data-cc="pop" :style="stepBeats[i]">
          <span>{{ step.label }}</span><code data-check="one-line">{{ step.value }}</code>
        </div>
        <div class="cc-lane-track">
          <i class="cc-lane-line" data-cc="grow" :style="run"></i
          ><span class="cc-packet" :data-cc="stopped ? 'bounce' : 'travel'" :style="run"
            ><b>{{ packet }}</b></span
          >
        </div>
      </div>
    </div>
    <div class="cc-gate">
      <i class="cc-gate-hit" data-cc="hit" :style="hit"></i>
      <b v-if="stopped" class="cc-stamp" data-cc="stamp" :style="hit">✕</b>
      <i v-else class="cc-gate-pass" data-cc="grow" :style="hit"></i>
    </div>
    <div class="cc-lane-end" data-cc="pop" :style="end">
      <b data-check="one-line">{{ result }}</b><span v-if="note">{{ note }}</span>
    </div>
  </div>
</template>
