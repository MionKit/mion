<script setup>
import VueWriter from 'vue-writer';
const titles = [
  'At The Speed Of Light ⚡',
  'Are Safe To Refactor',
  'Are Developer Friendly',
  'Are Not Rest APIs',
  'Are Serverless Ready',
  'Are Made For SaaS',
];
</script>

<template>
  <span class="typed-title">
    <VueWriter :array="titles" :delay="4000" :erase-speed="20" :type-speed="50" caret="underscore" />
  </span>
</template>

<style>
.typed-title {
  min-height: 3.2rem;
  min-width: 1rem;
}
.is-typed {
  display: inline;
}
.is-typed span.underscore {
  display: inline-flex;
  width: 2rem;
  height: 0.4rem;
  align-items: flex-end;
  background-color: var(--elements-text-primary-color-static);
  animation: blink 1.5s infinite;
  margin-left: 0.5rem;
}
.is-typed span.cursor.typing {
  animation: none;
}
@keyframes blink {
  49% {
    background-color: var(--elements-text-primary-color-static);
  }
  50% {
    background-color: transparent;
  }
  99% {
    background-color: transparent;
  }
}

@media screen and (max-width: 600px) {
  .typed-title {
    min-height: 2.8rem;
    display: block;
    width: 100%;
  }
  .is-typed {
    font-size: 1.5rem;
  }
  .is-typed span.underscore {
    display: none;
  }
}
</style>
