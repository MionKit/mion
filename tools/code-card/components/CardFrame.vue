<script setup lang="ts">
// The card wrapper: background, title (`<em>` = the accent gradient), subtitle, footer and badge.
import {provideSequence} from './shared.ts';

const props = withDefaults(
  defineProps<{
    subtitle?: string;
    footer?: string;
    badge?: string;
    /** `stats` = larger type, read as a phone-sized thumbnail. */
    kind?: 'code' | 'stats';
    /** Gap between two elements entering, as a CSS time. */
    step?: string;
    /** Duration of one element's entrance, as a CSS time. */
    speed?: string;
  }>(),
  {subtitle: '', footer: '', badge: '', kind: 'code'}
);
defineSlots<{title(): unknown; default(): unknown}>();

const nextStep = provideSequence();
const titleStep = nextStep();
const subtitleStep = props.subtitle ? nextStep() : undefined;
const timing = {...(props.step ? {'--cc-step': props.step} : {}), ...(props.speed ? {'--cc-speed': props.speed} : {})};
</script>

<template>
  <div class="code-card" :class="`cc-kind-${kind}`" :style="timing">
    <div class="stage">
      <div class="cc-title" data-cc="rise" data-check="one-line" :style="titleStep"><slot name="title" /></div>
      <div v-if="subtitle" class="cc-sub" data-cc="rise" :style="subtitleStep">{{ subtitle }}</div>
      <slot />
      <div v-if="footer || badge" class="cc-foot">
        <span v-if="footer">{{ footer }}</span>
        <span v-if="badge" class="cc-badge">{{ badge }}</span>
      </div>
    </div>
  </div>
</template>
