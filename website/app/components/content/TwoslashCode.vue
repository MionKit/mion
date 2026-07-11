<script lang="ts">
// Import Nuxt UI prose/pre theme for terminal window styling
import theme from '#build/ui/prose/pre'
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { useClipboard } from '@vueuse/core'
import { tv } from 'tailwind-variants'

/**
 * Type definition for the prose/pre UI slots.
 * Each method returns a class string and optionally accepts variant props or class overrides.
 */
interface ProsePreSlots {
  root: (props?: { filename?: boolean; class?: string | string[] }) => string
  header: (props?: { class?: string | string[] }) => string
  filename: (props?: { class?: string | string[] }) => string
  icon: (props?: { class?: string | string[] }) => string
  copy: (props?: { class?: string | string[] }) => string
  base: (props?: { class?: string | string[] }) => string
}

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
   * Title to display in the terminal window header (like a filename)
   */
  title: {
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

// Get app config for icons
const appConfig = useAppConfig()

/**
 * Compute UI classes using Nuxt UI's tv utility with the prose/pre theme.
 *
 * How Tailwind Variants (tv) works:
 * 1. `tv(config)` creates a "variant function" from a config with slots/variants
 * 2. Calling the variant function (e.g., `tv(config)()`) returns an object
 *    where each slot becomes a method that generates class strings
 * 3. Slot methods accept variant props (e.g., `{ filename: true }`) to apply conditional styles
 *
 * Why computed?
 * - `appConfig.ui?.prose?.pre` is reactive - if it changes, UI should re-render
 * - Without computed, changes to app config wouldn't trigger updates
 *
 * The `extend` option merges our base theme with any custom overrides from app config.
 */
const ui = tv({ extend: tv(theme) })() as ProsePreSlots;

// Copy functionality using VueUse
const { copy, copied } = useClipboard()

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

// Get the raw code for copy functionality
const rawCode = computed(() => {
  if (props.code) {
    return cleanCode(props.code)
  }
  return ''
})

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
  : `mion-two-slash-code-${props.code.slice(0, 50)}-${props.hoverMode}`

// Use useAsyncData for server-side rendering
const { data, status, error } = await useAsyncData(
  cacheKey,
  () => $fetch('/api/twoslash', {
    method: 'POST',
    body: getRequestBody(),
  })
)

// Extract plain text code from the rendered HTML for copy functionality
const codeForCopy = computed(() => {
  if (rawCode.value) {
    return rawCode.value
  }
  // If we loaded from path, extract text from the HTML
  if (data.value?.html) {
    // Create a temporary element to extract text content
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = data.value.html
    return tempDiv.textContent || ''
  }
  return ''
})

// Handle copy - needs to work on both client and server
const handleCopy = () => {
  if (import.meta.client) {
    copy(codeForCopy.value)
  }
}
</script>

<template>
  <div :class="[ui.root({ filename: !!title }), 'mion-two-slash']">
    <!-- Terminal window header with title tab -->
    <div v-if="title" :class="ui.header()" class="mion-two-slash-header">
      <div class="mion-two-slash-tab">
        <UIcon name="i-vscode-icons-file-type-typescript" :class="ui.icon()" />
        <span :class="ui.filename()">{{ title }}</span>
      </div>
    </div>

    <!-- Copy button -->
    <UButton
      v-if="data?.html"
      :icon="copied ? appConfig.ui?.icons?.copyCheck || 'i-lucide-check' : appConfig.ui?.icons?.copy || 'i-lucide-copy'"
      color="neutral"
      variant="ghost"
      size="xs"
      aria-label="Copy code"
      :class="ui.copy()"
      class="copy-mion-code-btn"
      tabindex="-1"
      @click="handleCopy"
    />

    <!-- Loading state -->
    <div v-if="status === 'pending'" class="mion-two-slash-loading">
      Loading...
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="mion-two-slash-error">
      Error: {{ error.message }}
    </div>

    <!-- Twoslash rendered code -->
    <div v-else-if="data?.html" v-html="data.html" class="mion-two-slash-code" :class="{'with-title': title}"/>
  </div>
</template>

<style>
/* Loading state */
.mion-two-slash-loading {
  padding: 0.75rem 1rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.875rem;
  line-height: 1.5rem;
  border: 1px solid var(--ui-border-muted);
  background-color: var(--ui-bg-muted);
  border-radius: calc(var(--ui-radius) * 1.5);
  color: var(--ui-text-muted);
  box-sizing: border-box;
}

/* Error state */
.mion-two-slash-error {
  padding: 0.75rem 1rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.875rem;
  line-height: 1.5rem;
  border: 1px solid rgb(239 68 68 / 0.5);
  background-color: rgb(254 242 242);
  border-radius: calc(var(--ui-radius) * 1.5);
  color: rgb(220 38 38);
}

:root.dark .mion-two-slash-error {
  background-color: rgb(127 29 29 / 0.3);
  color: rgb(248 113 113);
}

.mion-two-slash-header {
  padding-top: 0;
  padding-left: 1rem;
  padding-right: 1rem;
  padding-bottom: 0;
}

/* Tab styling for the filename header */
.mion-two-slash-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background-color: var(--ui-bg-muted);
  margin-bottom: -1px;
  position: relative;
  border-top: 1px solid var(--ui-primary);
  margin-top: -1px;
}

.copy-mion-code-btn {
  top: 7px;
}

/* Twoslash code container */
.mion-two-slash-code .shiki {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.875rem;
  line-height: 1.5rem;
  border: none;
  background-color: var(--ui-bg-muted);
  border-radius: calc(var(--ui-radius) * 1.5);
  padding: 0.75rem 1rem;
  overflow-x: visible;
  margin: 0;
}

.mion-two-slash-code.with-title .shiki {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.mion-two-slash-code .twoslash-meta-line,
.mion-two-slash-code .twoslash-tag-line {
  max-width: 100%;
  text-wrap-mode: wrap;
}

.mion-two-slash-code .shiki code {
  display: block;
}

/* Ensure empty lines have proper height */
.mion-two-slash-code .shiki .line:empty::before {
  content: ' ';
}

.mion-two-slash-code .shiki .line {
  display: block;
  max-width: 100%;
}

/* Dark mode: Use Shiki's dark theme CSS variables */
:root.dark .mion-two-slash-code .shiki,
:root.dark .mion-two-slash-code .shiki span {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
}

/* Twoslash hover token - ensure popups stay within bounds */
.mion-two-slash-code .twoslash-hover {
  position: relative;
}

/* Twoslash popup styling */
.mion-two-slash-code .twoslash-popup-code {
  border-radius: calc(var(--ui-radius) * 1.5);
  box-shadow: 0 0 8px 0 #99db3580;
  padding: 0;
  letter-spacing: -0.01rem;
  left: 0;
  right: auto;
  overflow: hidden;
}

.mion-two-slash-code .twoslash-completion-cursor  .twoslash-completion-list {
  border-radius: calc(var(--ui-radius) * 1.5);
  box-shadow: 0 0 8px 0 #99db3580;
}

/* Popup arrow styling */
:root.dark .mion-two-slash-code .twoslash-popup-arrow {
  background: var(--shiki-dark-bg, #1e1e1e);
}

:root.light .mion-two-slash-code .twoslash-popup-arrow {
  background: var(--shiki-light-bg, #ffffff);
}

/* Dark mode popup container */
:root.dark .mion-two-slash-code .twoslash-popup-container,
:root.dark .mion-two-slash-code .twoslash-completion-cursor .twoslash-completion-list {
  background: var(--shiki-dark-bg, #1e1e1e);
  border-color: var(--color-green-700);
}

/* Light mode popup container */
:root.light .mion-two-slash-code .twoslash-popup-container,
:root.light .mion-two-slash-code .twoslash-completion-cursor .twoslash-completion-list {
  background: var(--shiki-light-bg, #ffffff);
  border-color: var(--color-green-700);
}
</style>

