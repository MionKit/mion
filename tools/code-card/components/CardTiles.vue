<script setup lang="ts">
// A row of big-number tiles, 1 to 4; four make a 2x2 grid.
import {Comment, Fragment, type VNode} from 'vue';

const slots = defineSlots<{default(): VNode[]}>();
const MAX_TILES = 4;

const flat = (nodes: VNode[]): VNode[] =>
  nodes.flatMap((node) => (node.type === Fragment ? flat(node.children as VNode[]) : node.type === Comment ? [] : [node]));

// Counted while rendering, where reading a slot is allowed.
function countClass(tiles: VNode[]): string {
  const count = flat(tiles).length;
  if (count < 1 || count > MAX_TILES) throw new Error(`CardTiles: holds 1 to ${MAX_TILES} CardTile, got ${count}`);
  return `cc-count-${count}`;
}
</script>

<template>
  <div class="cc-tiles" :class="countClass(slots.default?.() ?? [])"><slot /></div>
</template>
