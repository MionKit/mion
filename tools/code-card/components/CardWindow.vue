<script setup lang="ts">
// The editor window: three dots, a file name, then code or stats.
import {nextStep} from './shared.ts';

withDefaults(defineProps<{file?: string}>(), {file: ''});
const step = nextStep();
</script>

<template>
  <div class="cc-win" data-cc="rise" :style="step">
    <div class="cc-bar">
      <i class="cc-dot" style="background: #ff5f57"></i><i class="cc-dot" style="background: #febc2e"></i
      ><i class="cc-dot" style="background: #28c840"></i><span v-if="file" class="cc-file">{{ file }}</span>
    </div>
    <div class="cc-body"><slot /></div>
  </div>
</template>
