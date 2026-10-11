<script setup lang="ts">
import {computed, ref} from 'vue';
import {REPLACED_LIBRARIES} from '~/utils/replacedLibraries';

// Libraries on one side, the mion logo on the other: hovering, focusing or tapping a
// library shows, over the logo, what mion does in its place.
const activeName = ref<string | null>(null);
const active = computed(() => REPLACED_LIBRARIES.find((library) => library.name === activeName.value));
</script>

<template>
  <div class="vertical-integration" :class="{'is-active': active}">
    <ul class="vi-libraries" @mouseleave="activeName = null">
      <li v-for="library in REPLACED_LIBRARIES" :key="library.name">
        <button
          type="button"
          class="vi-library"
          :class="{'is-current': activeName === library.name}"
          :aria-pressed="activeName === library.name"
          @mouseenter="activeName = library.name"
          @focus="activeName = library.name"
          @blur="activeName = null"
          @click="activeName = library.name"
        >
          <svg v-if="library.icon" class="vi-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="library.icon" /></svg>
          <span v-else class="vi-icon vi-badge" aria-hidden="true">TB</span>
          <span class="vi-name">{{ library.name }}</span>
        </button>
      </li>
    </ul>

    <svg class="vi-link" viewBox="0 0 48 24" aria-hidden="true"><path d="M3 12h42M9 6l-6 6 6 6M39 6l6 6-6 6" /></svg>

    <div class="vi-stage" aria-live="polite">
      <MionLogo class="vi-logo" />
      <Transition name="vi-fade" mode="out-in">
        <div v-if="active" :key="active.name" class="vi-text">
          <span class="vi-role">{{ active.role }} · instead of {{ active.name }}</span>
          <p>{{ active.text }}</p>
        </div>
        <p v-else class="vi-hint">Hover a library to see what mion does instead.</p>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.vertical-integration {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 3rem minmax(0, 1.1fr);
  align-items: center;
  gap: 1rem;
  text-align: left;
}

.vi-libraries {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.vi-library {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.85rem 0.25rem 0.6rem;
  border: 1px solid transparent;
  border-radius: 0.75rem;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition:
    color 0.2s,
    background-color 0.2s,
    border-color 0.2s;
}

.vi-library:hover,
.vi-library.is-current {
  color: var(--ui-primary);
  border-color: color-mix(in srgb, var(--ui-primary) 35%, transparent);
  background: color-mix(in srgb, var(--ui-primary) 8%, transparent);
}

.vi-icon {
  width: 2rem;
  height: 2rem;
  fill: currentColor;
}

.vi-badge {
  display: grid;
  place-items: center;
  border: 2px solid currentColor;
  border-radius: 0.4rem;
  font-family: var(--font-mono, monospace);
  font-size: 0.7rem;
  font-weight: 700;
}

.vi-name {
  font-size: 0.75rem;
}

.vi-link {
  width: 100%;
  fill: none;
  stroke: var(--ui-primary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.is-active .vi-link {
  opacity: 1;
}

.vi-stage {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 13rem;
  padding: 1.5rem;
}

.vi-logo {
  width: min(100%, 11rem);
  height: auto;
  color: var(--ui-text-highlighted);
  transition:
    opacity 0.3s,
    filter 0.3s;
}

.is-active .vi-logo {
  opacity: 0.1;
  filter: blur(2px);
}

.vi-text,
.vi-hint {
  position: absolute;
  inset: auto 1rem;
  margin: 0;
  text-align: center;
}

.vi-hint {
  bottom: 0;
  font-size: 0.75rem;
  color: var(--ui-text-dimmed);
}

.vi-role {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-primary);
}

.vi-text p {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.5;
  color: var(--ui-text-highlighted);
}

.vi-fade-enter-active,
.vi-fade-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}

.vi-fade-enter-from,
.vi-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (max-width: 768px) {
  .vertical-integration {
    grid-template-columns: 1fr;
  }

  .vi-link {
    width: 3rem;
    margin: 0 auto;
    transform: rotate(90deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .vi-library,
  .vi-logo,
  .vi-fade-enter-active,
  .vi-fade-leave-active {
    transition: none;
  }
}
</style>
