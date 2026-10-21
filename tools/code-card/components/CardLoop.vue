<script setup lang="ts">
// Shows its items one at a time, in place, looping forever. card.css runs the loop; the PNG shows item `still` in full.
import {nextStep} from './shared.ts';

const props = withDefaults(
  defineProps<{
    /** One per turn, handed to the slot as `item`. */
    items: unknown[];
    /** How long each item stays, as a CSS time. */
    hold?: string;
    /** The item the PNG and reduced motion show. */
    still?: number;
  }>(),
  {hold: '4s', still: 0}
);
defineSlots<{default(props: {item: any; index: number}): unknown}>();
if (props.items.length < 2 || props.items.length > 8) throw new Error(`CardLoop: loops 2 to 8 items, got ${props.items.length}`);
if (!Number.isInteger(props.still) || props.still < 0 || props.still >= props.items.length)
  throw new Error(`CardLoop: still ${props.still} is not an item index`);

// The still frame: 90% into the still item's turn, every beat in.
const style = {...nextStep(), '--cc-loop-n': props.items.length, '--cc-loop-hold': props.hold, '--cc-loop-t': (props.still + 0.9) / props.items.length};
</script>

<template>
  <div class="cc-loop" :style="style">
    <div v-for="(item, i) in items" :key="i" class="cc-loop-item" :style="{'--cc-loop-i': i}"><slot :item="item" :index="i" /></div>
  </div>
</template>
