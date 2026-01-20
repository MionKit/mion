<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  code: {
    type: String,
    required: true,
  },
  lang: {
    type: String,
    default: 'ts',
  },
})

// Clean up the code - remove leading/trailing whitespace per line while preserving structure
const cleanCode = computed(() => {
  const lines = props.code.split('\n')
  // Find minimum indentation (ignoring empty lines)
  const minIndent = lines
    .filter(line => line.trim().length > 0)
    .reduce((min, line) => {
      const indent = line.match(/^(\s*)/)?.[1]?.length || 0
      return Math.min(min, indent)
    }, Infinity)

  // Remove common indentation
  return lines
    .map(line => line.slice(minIndent === Infinity ? 0 : minIndent))
    .join('\n')
    .trim()
})

// Use useAsyncData for server-side rendering
const { data, status, error } = await useAsyncData(
  `twoslash-${cleanCode.value.slice(0, 50)}`,
  () => $fetch('/api/twoslash', {
    method: 'POST',
    body: {
      code: cleanCode.value,
      lang: props.lang,
    },
  }),
  {
    watch: [cleanCode],
  }
)
</script>

<template>
  <div class="twoslash-container">
    <div v-if="status === 'pending'" class="twoslash-loading">
      Loading...
    </div>
    <div v-else-if="error" class="twoslash-error">
      Error: {{ error.message }}
    </div>
    <div v-else-if="data?.html" v-html="data.html" class="twoslash-code" />
  </div>
</template>

<style>
.twoslash-container {
  margin: 1rem 0;
}

.twoslash-loading {
  padding: 1rem;
  background: var(--prose-code-block-backgroundColor, #1e1e1e);
  border-radius: var(--radii-md, 0.375rem);
  color: var(--prose-code-block-color, #d4d4d4);
}

.twoslash-error {
  padding: 1rem;
  background: #fee;
  border-radius: var(--radii-md, 0.375rem);
  color: #c00;
}

.twoslash-code {
  border-radius: var(--radii-md, 0.375rem);
  overflow: hidden;
}

.twoslash-code pre {
  margin: 0;
  padding: 1rem;
}

.twoslash-code .shiki {
  padding: 1rem;
  border-radius: var(--radii-md, 0.375rem);
}

/* Dark mode overrides for twoslash popups */
:root.dark {
  --twoslash-popup-bg: #1e1e1e;
  --twoslash-popup-color: #d4d4d4;
  --twoslash-border-color: #444;
}
</style>

