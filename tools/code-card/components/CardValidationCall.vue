<script setup lang="ts">
// One route call, top to bottom: the call, the client's check, the server's check, then what comes back.
// A failed client check stops it: the server row stays empty. Inside a CardLoop the beats play in turn.
const props = withDefaults(
  defineProps<{
    /** Code, one line: the call as written in the client. */
    call: string;
    /** Code, one line: what the client's check gives (an error type when stopped). */
    client: string;
    /** A few words on the server row: what it does, or why nothing reached it. */
    server: string;
    /** The client check fails, so nothing is sent. */
    stopped?: boolean;
    /** Code, one line: the typed result that comes back. */
    result?: string;
  }>(),
  {stopped: false, result: ''}
);
for (const key of ['call', 'client', 'server'] as const) if (!props[key].trim()) throw new Error(`CardValidationCall: needs a ${key}`);
if (props.stopped && props.result) throw new Error('CardValidationCall: a stopped call sends nothing, so it has no result');

// When each beat starts, as a fraction of the item's turn in a CardLoop.
const at = (start: number, until?: number) => ({'--cc-at': start, ...(until === undefined ? {} : {'--cc-until': until})});
const CALL = 0.04;
const CLIENT = 0.22;
const SERVER = 0.4;
const RESULT = 0.58;
const mark = props.stopped ? 'cc-vc-bad' : 'cc-vc-ok';
</script>

<template>
  <div class="cc-vc" :class="{'cc-vc-stopped': stopped}">
    <i class="cc-vc-track"><i data-cc-at="grow" :style="at(CALL, stopped ? CLIENT : SERVER)"></i></i>
    <span class="cc-vc-label">call</span><i class="cc-vc-dot" data-cc-at :style="at(CALL)"></i
    ><code class="cc-vc-chip" data-cc-at :style="at(CALL)" data-check="one-line">{{ call }}</code>
    <span class="cc-vc-label">client</span><i :class="`cc-vc-dot ${mark}`" data-cc-at :style="at(CLIENT)"></i
    ><code :class="`cc-vc-chip ${mark}`" data-cc-at :style="at(CLIENT)" data-check="one-line"
      ><b>{{ stopped ? '✕' : '✓' }}</b>{{ client }}</code
    >
    <span class="cc-vc-label">server</span><i :class="`cc-vc-dot ${stopped ? '' : 'cc-vc-ok'}`" data-cc-at :style="at(SERVER)"></i
    ><span :class="`cc-vc-chip cc-vc-say ${stopped ? 'cc-vc-none' : 'cc-vc-ok'}`" data-cc-at :style="at(SERVER)" data-check="one-line"
      ><b v-if="!stopped">✓</b>{{ server }}</span
    >
    <span v-if="result" class="cc-vc-result" data-cc-at :style="at(RESULT)" data-check="one-line"
      >typed result: <b>✓</b> <code>{{ result }}</code></span
    >
  </div>
</template>
