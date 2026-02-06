<script setup>
import { ref, onMounted, computed } from 'vue';
import { VueWriter } from 'vue-writer';

const props = defineProps({
  leading: {
    type: String,
    default: '',
  },
  suffix: {
    type: String,
    default: '',
  },
  titles: {
    type: Array,
    required: true,
  },
  level: {
    type: Number,
    default: 1,
    validator: (value) => value >= 1 && value <= 6,
  },
});

// Initial text shown during SSR (first item)
const initialText = computed(() => props.titles[0] || '');

// Reorder array for VueWriter: start from second item, put first item at the end
const vueWriterTitles = computed(() => [...props.titles.slice(1), props.titles[0]]);

// Track if we're mounted (client-side)
const isMounted = ref(false);

onMounted(() => {
  isMounted.value = true;
});
</script>

<template>
  <div class="typed-title-container">
    <component :is="`h${level}`" class="typed-title-heading">
      <span v-if="leading" class="typed-title-leading">{{ leading }}</span>
      <span class="typed-title">
        <!-- Show VueWriter only after mounting (client-side) -->
        <template v-if="isMounted">
          <VueWriter :array="vueWriterTitles" :delay="4000" :erase-speed="20" :type-speed="50" caret="underscore" />
        </template>
        <!-- Show static text during SSR -->
        <span v-else class="is-typed">
          <span class="typed">{{ initialText }}</span>
          <span class="underscore" />
        </span>
      </span>
      <span v-if="suffix" class="typed-title-suffix">{{ suffix }}</span>
    </component>
    <p v-if="$slots.description" class="typed-title-description">
      <slot name="description" />
    </p>
  </div>
</template>

<style scoped>
.typed-title-container {
  display: block;
  width: 100%;
  text-align: center;
}

/* Match u-page-hero title styling: text-5xl sm:text-7xl text-pretty tracking-tight font-bold text-highlighted */
.typed-title-heading {
  display: block;
  width: 100%;
  font-size: 3rem; /* text-5xl */
  line-height: 1.3;
  font-weight: 700; /* font-bold */
  text-wrap: pretty;
  color: var(--ui-text-highlighted, var(--color-gray-900));
}

@media (min-width: 640px) {
  .typed-title-heading {
    font-size: 4.5rem; /* sm:text-7xl */
  }
}

.typed-title-leading {
  --gradient-color: var(--ui-saturated);
  display: block;
  /* Gradient text effect - continuous left to right movement */
  background: linear-gradient(
    90deg,
    var(--gradient-color, #22c55e) 0%,
    color-mix(in srgb, var(--gradient-color, #22c55e) 55%, #60a5fa) 25%,
    var(--gradient-color, #22c55e) 50%,
    color-mix(in srgb, var(--gradient-color, #22c55e) 55%, #60a5fa) 75%,
    var(--gradient-color, #22c55e) 100%
  );
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 200% 100%;
  animation: gradient-flow 6s linear infinite;
}

@keyframes gradient-flow {
  0% {
    background-position: 0% center;
  }
  100% {
    background-position: -200% center;
  }
}

.typed-title {
  display: block;
  min-height: 1.2em;
  min-width: 1rem;
  font-size: 0.7em;
}

.typed-title-suffix {
  display: block;
}

/* Match u-page-hero description styling: text-lg sm:text-xl/8 text-muted mt-6 text-balance */
.typed-title-description {
  margin-top: 1.5rem; /* mt-6 */
  font-size: 1.5rem; /* text-lg */
  line-height: 1.75rem;
  text-wrap: balance;
}

@media (min-width: 640px) {
  .typed-title-description {
    font-size: 1.25rem; /* sm:text-xl */
    line-height: 2rem; /* /8 */
  }
}

:deep(.is-typed) {
  display: inline;
}

/* Style for both SSR fallback and VueWriter underscore caret */
:deep(.is-typed span.underscore),
.typed-title :deep(.is-typed span.underscore) {
  display: inline-flex;
  width: 0.8em;
  height: 0.08em;
  align-items: flex-end;
  background-color: var(--ui-primary, #4ade80);
  color: var(--ui-primary0, #4ade80);
  animation: blink 1.5s infinite;
  margin-left: 0.2em;
}

:deep(.is-typed span.cursor.typing) {
  animation: none;
}

@keyframes blink {
  0%, 49% {
    opacity: 1;
  }
  50%, 99% {
    opacity: 0;
  }
}

@media screen and (max-width: 600px) {
  .typed-title-heading {
    font-size: 2.5rem;
  }
  .typed-title-leading {
    padding-bottom: 0.5rem;
  }
  .typed-title {
    font-size: 1.5rem;
    
  }
  .is-typed span.underscore {
    display: none;
  }
}
</style>
