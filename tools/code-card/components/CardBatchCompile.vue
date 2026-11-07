<script setup lang="ts">
// One scene of a compiled batch for a CardLoop: `build` stores it on the server under an id, `run` sends only the id.
import {at} from './shared.ts';

const props = defineProps<{
  scene: 'build' | 'run';
  /** The client code holding the batch, 1 to 4 lines. */
  code: string[];
  /** The batch id, up to 8 characters. */
  id: string;
  /** The batch's routes, in run order. */
  routes: string[];
  /** The inline inputFrom mapper the build copies, one line of code. */
  mapper: string;
  /** What the single answer holds, one line of code. */
  result: string;
}>();
if (props.scene !== 'build' && props.scene !== 'run') throw new Error(`CardBatchCompile: scene is build or run, got "${props.scene}"`);
if (props.code.length < 1 || props.code.length > 4) throw new Error(`CardBatchCompile: code holds 1 to 4 lines, got ${props.code.length}`);
if (!props.code.join('').trim()) throw new Error('CardBatchCompile: the code is empty');
if (!/^\S{1,8}$/u.test(props.id)) throw new Error(`CardBatchCompile: id "${props.id}" needs 1 to 8 characters, no spaces`);
if (!props.routes.length || props.routes.some((route) => !route.trim())) throw new Error('CardBatchCompile: needs routes, each with a name');
for (const key of ['mapper', 'result'] as const) if (!props[key].trim()) throw new Error(`CardBatchCompile: needs a ${key}`);

const build = props.scene === 'build';
</script>

<template>
  <div class="cc-bc">
    <div class="cc-bc-steps">
      <b :class="{'cc-bc-now': build}">1 · Build time</b><i>→</i><b :class="{'cc-bc-now': !build}">2 · Run time</b
      ><span>{{ build ? 'once, when you build your app' : 'on every call, with the id from the build' }}</span>
    </div>
    <div class="cc-bc-cols">
      <span>{{ build ? 'client code' : 'client' }}</span><span>{{ build ? 'server build' : 'server' }}</span>
    </div>

    <div v-if="build" class="cc-bc-row">
      <div class="cc-bc-box cc-bc-code" data-cc-at :style="at(0.04)">
        <code v-for="(line, i) in code" :key="i" data-check="one-line">{{ line }}</code>
        <b class="cc-bc-id" data-cc-at :style="at(0.16)">id {{ id }}</b>
      </div>
      <div class="cc-bc-wire">
        <span class="cc-bc-say" data-cc-at :style="at(0.26)">build copies it</span>
        <div class="cc-bc-track">
          <i class="cc-bc-line" data-cc-at="grow" :style="at(0.26, 0.4)"></i
          ><span class="cc-bc-packet" data-cc-at="travel" :style="at(0.26, 0.42)"><b>{{ id }}</b></span>
        </div>
      </div>
      <div class="cc-bc-box cc-bc-table">
        <span class="cc-bc-head">batch table</span>
        <div class="cc-bc-entry" data-cc-at :style="at(0.42)">
          <b>{{ id }}</b><code data-check="one-line">{{ routes.join(' → ') }}</code>
        </div>
        <div class="cc-bc-entry" data-cc-at :style="at(0.52)">
          <span>mapper</span><code data-check="one-line">{{ mapper }}</code>
        </div>
      </div>
    </div>

    <div v-else class="cc-bc-row">
      <div class="cc-bc-side">
        <div class="cc-bc-box" data-cc-at :style="at(0.04)">
          <code data-check="one-line">POST /mion-batch?id={{ id }}</code><span>body: route inputs</span>
        </div>
        <div class="cc-bc-box cc-bc-ok" data-cc-at :style="at(0.66)">
          <code data-check="one-line">{{ result }}</code><span>one round trip</span>
        </div>
      </div>
      <div class="cc-bc-wire">
        <span class="cc-bc-say" data-cc-at :style="at(0.14)">only the id</span>
        <div class="cc-bc-track">
          <i class="cc-bc-line" data-cc-at="grow" :style="at(0.14, 0.28)"></i
          ><span class="cc-bc-packet" data-cc-at="travel" :style="at(0.14, 0.3)"><b>{{ id }}</b></span>
        </div>
        <div class="cc-bc-track cc-bc-back">
          <i class="cc-bc-line" data-cc-at="grow" :style="at(0.5, 0.64)"></i
          ><span class="cc-bc-packet" data-cc-at="travel" :style="at(0.5, 0.66)"><b>results</b></span>
        </div>
        <span class="cc-bc-say" data-cc-at :style="at(0.5)">one answer</span>
      </div>
      <div class="cc-bc-side">
        <div class="cc-bc-box cc-bc-ok" data-cc-at :style="at(0.3)">
          <code data-check="one-line"><b>✓</b>finds {{ id }}</code><span>in its batch table</span>
        </div>
        <div class="cc-bc-box" data-cc-at :style="at(0.4)">
          <code data-check="one-line">{{ routes.length > 1 ? `${routes.length} routes` : routes[0] }} + mapper</code
          ><span>run in one request</span>
        </div>
      </div>
    </div>
  </div>
</template>
