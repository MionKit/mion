<script setup lang="ts">
// Never animated: the empty frame shows the reader a block is there before its content plays.
withDefaults(defineProps<{file?: string}>(), {file: ''});
</script>

<template>
  <div class="cc-win">
    <div class="cc-bar">
      <i class="cc-dot" style="background: #ff5f57"></i><i class="cc-dot" style="background: #febc2e"></i
      ><i class="cc-dot" style="background: #28c840"></i><span v-if="file" class="cc-file">{{ file }}</span>
    </div>
    <div class="cc-body"><slot /></div>
  </div>
</template>
