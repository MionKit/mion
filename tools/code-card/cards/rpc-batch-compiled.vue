<script setup lang="ts">
// The batch page's inputFrom example (batch-input-from.ts), names shortened to fit. The id is made up.
const batch = {
  code: [
    'const map = inputFrom(order, (o) => o!.userId);',
    'const user = routes.users.getById(map.asArg());',
    'batch([order, user]).call();',
  ],
  id: 'b_7Kq2',
  routes: ['orders.getById', 'users.getById'],
  mapper: '(o) => o!.userId',
  result: '[[order], [user]]',
};
const scenes = [{scene: 'build'}, {scene: 'run'}];
</script>

<template>
  <CardFrame subtitle="The build gives each batch an id. At run time only the id travels." badge="@mionjs/client">
    <template #title>Batches compile <em>at build time</em></template>
    <CardWindow file="batch.ts">
      <CardLoop v-slot="{item}" :items="scenes" hold="7s" :still="1">
        <CardBatchCompile v-bind="{...batch, ...item}" />
      </CardLoop>
    </CardWindow>
  </CardFrame>
</template>
