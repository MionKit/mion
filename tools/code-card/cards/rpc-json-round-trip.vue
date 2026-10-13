<script setup lang="ts">
// Wire forms as a real route sends them (a route returning these values, encoded by @mionjs/router).
const values = [
  {type: 'Map<string, number>', wire: '[["a",1]]', lost: 'empty {}'},
  {type: 'Set<string>', wire: '["admin"]', lost: 'empty {}'},
  {type: 'Date', wire: '"2024-02-02T02:02:02.000Z"', lost: 'a string'},
  {type: 'bigint', wire: '"9007199254740993"', lost: 'throws TypeError'},
  {type: 'Temporal.PlainDate', wire: '"2024-02-02"', lost: 'a string'},
];
</script>

<template>
  <CardFrame kind="mini">
    <template #title>JSON <em>Round Trip</em></template>
    <CardLoop v-slot="{item}" :items="values">
      <CardRoundTrip v-bind="item" />
    </CardLoop>
  </CardFrame>
</template>
