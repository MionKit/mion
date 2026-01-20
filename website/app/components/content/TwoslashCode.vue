<script setup lang="ts">
const props = defineProps({
  code: {
    type: String,
    required: false,
    default: '',
  },
  lang: {
    type: String,
    default: 'ts',
  },
  path: {
    type: String,
    required: false,
    default: '',
  },
  /**
   * Controls how type hovers are displayed:
   * - 'all': Show type hovers for all identifiers (default)
   * - 'explicit': Only show explicit twoslash annotations (// ^?, // ^|, errors, etc.)
   */
  hoverMode: {
    type: String as () => 'all' | 'explicit',
    default: 'all',
  },
})

/**
 * Clean up code - remove common leading indentation while preserving structure
 */
function cleanCode(code: string): string {
  if (!code) return ''

  const lines = code.split('\n')
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
}

// Build the request body - either pass path (server reads file) or code directly
const getRequestBody = () => {
  const base = { lang: props.lang, hoverMode: props.hoverMode }
  if (props.path) {
    // Let the server read the file
    return { ...base, path: props.path }
  } else {
    // Pass code directly (cleaned)
    return { ...base, code: cleanCode(props.code) }
  }
}

// Create a unique cache key (include hoverMode to differentiate cached results)
const cacheKey = props.path
  ? `twoslash-path-${props.path}-${props.hoverMode}`
  : `twoslash-code-${props.code.slice(0, 50)}-${props.hoverMode}`

// Use useAsyncData for server-side rendering
const { data, status, error } = await useAsyncData(
  cacheKey,
  () => $fetch('/api/twoslash', {
    method: 'POST',
    body: getRequestBody(),
  })
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
  padding: 0.5rem;
  background: var(--prose-code-block-backgroundColor, #1e1e1e);
  border-radius: var(--radii-md, 0.375rem);
  color: var(--prose-code-block-color, #d4d4d4);
}

.twoslash-error {
  padding: 0.5;
  background: #fee;
  border-radius: var(--radii-md, 0.375rem);
  color: #c00;
}

.twoslash-code {
  border-radius: var(--radii-md, 0.375rem);
}

.twoslash-code .twoslash {
  padding: 12px;
  padding-left: 6px;
}

.twoslash-code .shiki {
  border-radius: var(--radii-md, 0.375rem);
  
}

.twoslash-code .shiki code {
  display: block;
}

/* Ensure empty lines (intentional blank lines in source) have proper height */
.twoslash-code .shiki .line:empty::before {
  content: ' ';
}

.twoslash-code .shiki .line {
  display: block;
}

/* Dark mode: Use Shiki's dark theme CSS variables */
:root.dark .twoslash-code .shiki,
:root.dark .twoslash-code .shiki span {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
}

/* Twoslash hover token - ensure popups stay within bounds */
.twoslash-code .twoslash-hover {
  position: relative;
}

/* Twoslash popup styling */
.twoslash-code .twoslash-popup-container {
  background: var(--prose-code-block-backgroundColor, #f6f8fa);
  border: 1px solid var(--prose-code-block-border-color, #e1e4e8);
  border-radius: var(--radii-sm, 0.25rem);
  padding: 0;
  letter-spacing: -0.01rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  /* Keep popup within viewport */
  left: 0;
  right: auto;
}



:root.dark .twoslash-code .twoslash-popup-arrow {
  background: var(--shiki-dark-bg, #1e1e1e);
}

:root.light .twoslash-code .twoslash-popup-arrow {
  background: var(--shiki-light-bg, #1e1e1e);
}

:root.dark .twoslash-code .twoslash-popup-container,
:root.dark .twoslash-code .twoslash-completion-cursor .twoslash-completion-list {
  background: var(--shiki-light-bg, #1e1e1e);
  border-color: #444;
}
</style>

