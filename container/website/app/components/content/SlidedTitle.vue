<!-- Hero title with a rotating second line: each title slides in from below, holds,
     and slides out through the top at the same speed, one after another, forever.
     The whole motion is CSS: one keyframe set per title count (the visible window is
     1/count of the cycle, so the percentages depend on the count and are written
     once per count into a <style> the component renders), driven by
     animation-delay per title. No timers, no per-frame script, so it never lags,
     and it keeps running while the tab is idle at no cost. Reduced motion shows
     the first title, still. Replaces the typewriter (TypedTitle), whose
     per-character loop stuttered on slow devices. -->
<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** The fixed first line, painted with the site accent gradient. */
    leading?: string
    /** The rotating second line, in this order. */
    titles: string[]
    /** Seconds each title stays fully visible. */
    hold?: number
    /** Seconds a title takes to slide in (and, separately, to slide out). */
    slide?: number
    /** Heading level of the rendered element. */
    level?: 1 | 2 | 3 | 4 | 5 | 6
  }>(),
  {leading: '', hold: 2.6, slide: 0.55, level: 1}
)

const count = computed(() => Math.max(props.titles.length, 1))
// one period per title: slide in + hold + slide out
const period = computed(() => props.slide * 2 + props.hold)
const total = computed(() => period.value * count.value)
const name = computed(() => `slided-title-${count.value}-${Math.round(props.slide * 100)}-${Math.round(props.hold * 100)}`)

// Keyframes in percent of the whole cycle: a title is on stage for 100/count of it.
// In and out take the same share (`s`), so every title moves at the same speed.
const keyframes = computed(() => {
  const pct = (seconds: number) => ((seconds / total.value) * 100).toFixed(3)
  const s = pct(props.slide)
  const p = pct(period.value)
  const out = pct(period.value - props.slide)
  return `@keyframes ${name.value}{0%{transform:translateY(110%);opacity:0}${s}%{transform:translateY(0);opacity:1}${out}%{transform:translateY(0);opacity:1}${p}%{transform:translateY(-110%);opacity:0}100%{transform:translateY(-110%);opacity:0}}`
})

// Rendered into <head> on the server too, so the first paint already animates.
useHead({style: [{key: name.value, innerHTML: keyframes}]})
</script>

<template>
  <div class="slided-title-container">
    <component
      :is="`h${level}`"
      class="slided-title-heading"
    >
      <span
        v-if="leading"
        class="slided-title-leading"
      >{{ leading }}</span>
      <span
        class="slided-title-stage"
        :style="{'--slided-count': count, '--slided-period': `${period}s`, '--slided-name': name}"
      >
        <span
          v-for="(title, index) in titles"
          :key="title"
          class="slided-title-item"
          :class="{'is-first': index === 0}"
          :style="{'--slided-index': index}"
          :aria-hidden="index === 0 ? undefined : 'true'"
        >{{ title }}</span>
      </span>
    </component>
    <p
      v-if="$slots.description"
      class="slided-title-description"
    >
      <slot name="description" />
    </p>
  </div>
</template>

<style scoped>
.slided-title-container {
  display: block;
  width: 100%;
  text-align: center;
}

/* Match u-page-hero title styling: text-5xl sm:text-7xl text-pretty tracking-tight font-bold text-highlighted */
.slided-title-heading {
  display: block;
  width: 100%;
  font-size: 3rem;
  line-height: 1.3;
  font-weight: 700;
  text-wrap: pretty;
  color: var(--ui-text-highlighted);
}

@media (min-width: 640px) {
  .slided-title-heading {
    font-size: 4.5rem;
  }
}

/* the fixed line: a continuous left-to-right sweep on the site accent */
.slided-title-leading {
  display: block;
  background: linear-gradient(
    90deg,
    var(--site-accent) 0%,
    color-mix(in srgb, var(--site-accent) 55%, var(--site-gradient-mix)) 25%,
    var(--site-accent) 50%,
    color-mix(in srgb, var(--site-accent) 55%, var(--site-gradient-mix)) 75%,
    var(--site-accent) 100%
  );
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 200% 100%;
  animation: slided-gradient-flow 6s linear infinite;
}

@keyframes slided-gradient-flow {
  0% {
    background-position: 0% center;
  }
  100% {
    background-position: -200% center;
  }
}

/* The stage is one line tall and clips: titles sit on top of each other in it and
   take turns. `clip-path` instead of overflow so the descenders and the emoji
   are not cut while a title is in place. */
.slided-title-stage {
  position: relative;
  display: block;
  height: 1.35em;
  font-size: 0.7em;
  line-height: 1.35;
  clip-path: inset(-0.1em 0 -0.15em 0);
}

.slided-title-item {
  position: absolute;
  inset: 0;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transform: translateY(110%);
  opacity: 0;
  will-change: transform, opacity;
  animation: var(--slided-name) calc(var(--slided-period) * var(--slided-count)) cubic-bezier(0.22, 1, 0.36, 1) infinite both;
  animation-delay: calc(var(--slided-index) * var(--slided-period));
}

/* A title's own slide-in should ease out and its slide-out ease in; one curve for
   both reads fine at this speed, and the same duration keeps in and out equal. */

.slided-title-description {
  margin-top: 1.5rem;
  font-size: 1.5rem;
  line-height: 1.75rem;
  text-wrap: balance;
}

@media (min-width: 640px) {
  .slided-title-description {
    font-size: 1.25rem;
    line-height: 2rem;
  }
}

/* Reduced motion: no sweep, no rotation, the first title stays in place. */
@media (prefers-reduced-motion: reduce) {
  .slided-title-leading {
    animation: none;
  }

  .slided-title-item {
    animation: none;
  }

  .slided-title-item.is-first {
    transform: none;
    opacity: 1;
  }
}

@media screen and (max-width: 600px) {
  .slided-title-heading {
    font-size: 2.5rem;
  }

  .slided-title-leading {
    padding-bottom: 0.5rem;
  }

  .slided-title-stage {
    font-size: 0.6em;
  }
}
</style>
