<script setup>
const props = defineProps({
  angle: {
    type: Number,
    default: 70,
  },
  opacity: {
    type: Number,
    default: 0.15,
  },
  top: {
    type: String,
    default: '0',
  },
  blur: {
    type: String,
    default: '150px',
  },
});
</script>

<template>
  <div
    class="gradient-bg"
    :style="{
      '--gradient-angle': `${angle}deg`,
      '--gradient-opacity': opacity,
      '--gradient-top': top,
      '--gradient-blur': blur,
    }"
  />
</template>

<style>
.gradient-bg {
  position: absolute;
  top: var(--gradient-top, 0);
  left: 0;
  right: 0;
  height: 100%;
  max-height: 800px;
  pointer-events: none;
  z-index: -1;
  overflow: hidden;
}

.gradient-bg::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -25%;
  right: -25%;
  bottom: 0;
  background: linear-gradient(
    var(--gradient-angle, 70deg),
    transparent 0%,
    color-mix(in srgb, var(--ui-saturated, #22c55e) 40%, transparent) 30%,
    color-mix(in srgb, var(--ui-saturated, #22c55e) 20%, transparent) 50%,
    transparent 70%
  );
  opacity: var(--gradient-opacity, 0.15);
  filter: blur(var(--gradient-blur, 150px));
  transform: rotate(-5deg);
}

/* Vertical fade to blend with body at the bottom */
.gradient-bg::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 50%;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    var(--ui-bg, var(--color-gray-50)) 100%
  );
  pointer-events: none;
}
</style>

