<script setup lang="ts">
// The getUser route of the rpc home example; the client checks params before sending (validateParams, on by default).
const calls = [
  {call: `routes.getUser('1234')`, client: 'validation-error', server: 'no request sent', stopped: true},
  {call: 'routes.getUser(1234)', client: 'valid, sent', server: 'checked again, route runs', result: 'User | null'},
];
</script>

<template>
  <CardFrame kind="mini">
    <template #title>Client &amp; Server <em>Validation</em></template>
    <CardLoop v-slot="{item}" :items="calls" :still="1">
      <CardValidationCall v-bind="item" />
    </CardLoop>
  </CardFrame>
</template>
