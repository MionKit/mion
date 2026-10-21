<script setup lang="ts">
const jit = [
  {label: 'schema object', value: 'z.object({…})'},
  {label: 'string of code', value: '"return …"'},
  {label: 'made into a function', value: 'new Function(…)'},
];
const runTypes = [
  {label: 'TypeScript type', value: 'type User'},
  {label: 'compiled at build time', value: 'createValidateFn<User>()'},
];
</script>

<template>
  <CardFrame
    subtitle="Ahead-of-time TypeScript compilers can't compile code an app builds from strings while it runs."
    footer="Early TypeScript AOT compilers: scriptc, Porffor, Perry, Bun's AOT mode. All experimental."
    badge="@mionjs/run-types"
    step="0.8s"
  >
    <template #title>JIT validators <em>won't be enough</em></template>
    <CardWindow file="compile to a native binary">
      <CardLanes gate="AOT compiler" outcome="In the binary">
        <CardLane
          label="JIT validators, like Zod 4"
          detail="build their code while the app runs"
          :steps="jit"
          packet='"…"'
          result="not compiled"
          note="slow path, or stops working"
          stopped
        />
        <CardLane
          label="RunTypes"
          detail="builds its code before the app starts"
          :steps="runTypes"
          packet="isUser"
          result="native code"
          note="compiled into the binary"
        />
      </CardLanes>
    </CardWindow>
  </CardFrame>
</template>
