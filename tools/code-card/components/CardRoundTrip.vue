<script setup lang="ts">
// One value's JSON round trip, server to wire to client, then what plain JSON gives instead.
const props = withDefaults(
  defineProps<{
    /** Code, one line: shown on the server and again on the client. */
    type: string;
    /** Code, one line: the JSON on the wire. */
    wire: string;
    /** What plain JSON gives instead, a few words. */
    lost?: string;
    plain?: string;
  }>(),
  {lost: '', plain: 'plain JSON'}
);
for (const key of ['type', 'wire'] as const) if (!props[key].trim()) throw new Error(`CardRoundTrip: needs a ${key}`);

// When each beat starts, as a fraction of the item's turn in a CardLoop.
const at = (start: number, until?: number) => ({'--cc-at': start, ...(until === undefined ? {} : {'--cc-until': until})});
const SERVER = 0.04;
const WIRE = 0.22;
const CLIENT = 0.4;
const LOST = 0.58;
</script>

<template>
  <div class="cc-rt">
    <i class="cc-rt-track"><i data-cc-at="grow" :style="at(SERVER, CLIENT)"></i></i>
    <span class="cc-rt-label">server</span><i class="cc-rt-dot" data-cc-at :style="at(SERVER)"></i
    ><code class="cc-rt-chip" data-cc-at :style="at(SERVER)" data-check="one-line">{{ type }}</code>
    <span class="cc-rt-label">wire</span><i class="cc-rt-dot" data-cc-at :style="at(WIRE)"></i
    ><code class="cc-rt-chip cc-rt-wire" data-cc-at :style="at(WIRE)" data-check="one-line">{{ wire }}</code>
    <span class="cc-rt-label">client</span><i class="cc-rt-dot cc-rt-ok" data-cc-at :style="at(CLIENT)"></i
    ><code class="cc-rt-chip cc-rt-ok" data-cc-at :style="at(CLIENT)" data-check="one-line"><b>✓</b>{{ type }}</code>
    <span v-if="lost" class="cc-rt-lost" data-cc-at :style="at(LOST)" data-check="one-line"
      >{{ plain }}: <b>✕</b> {{ lost }}</span
    >
  </div>
</template>
