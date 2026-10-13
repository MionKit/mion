<script lang="ts">
// Nuxt UI's prose/pre theme: the same classes a plain code block gets
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
   * - 'explicit' (default): only the annotations written in the code (// ^?, // ^|,
   *   errors, @annotate); nothing appears on hover.
   * - 'all': a type hover on every identifier as well.
   */
  hoverMode: {
    type: String as () => 'all' | 'explicit',
    default: 'explicit',
  },
})

const appConfig = useAppConfig()

// Built the way Nuxt UI's own ProsePre builds it, so this block looks like every other code block.
const ui = computed(() => tv({ extend: tv(theme), ...(appConfig.ui?.prose?.pre || {}) })() as ProsePreSlots)

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
  : `rt-two-slash-code-${props.code.slice(0, 50)}-${props.hoverMode}`

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
    <!-- File name, plain text at the top of the panel -->
    <div v-if="title" :class="ui.header()">
      <span :class="ui.filename()">{{ title }}</span>
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
    <div v-else-if="data?.html" v-html="data.html" class="rt-two-slash-code" :class="{'with-title': title}"/>
  </div>
</template>

<style>
/* Loading state */
.mion-two-slash-loading {
  padding: 0.75rem 1rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.875rem;
  line-height: 1.5rem;
  border: 1px solid var(--ui-border);
  background-color: var(--mion-panel-bg);
  border-radius: var(--mion-panel-radius);
  color: var(--ui-text-muted);
  box-sizing: border-box;
}

/* Error state */
.mion-two-slash-error {
  padding: 0.75rem 1rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.875rem;
  line-height: 1.5rem;
  /* no dark-mode override: --ui-error flips shade per mode itself */
  border: 1px solid color-mix(in srgb, var(--ui-error) 50%, transparent);
  background-color: color-mix(in srgb, var(--ui-error) 10%, var(--mion-panel-bg));
  border-radius: var(--mion-panel-radius);
  color: var(--ui-error);
}

.copy-mion-code-btn {
  top: 7px;
}

/* Twoslash code container */
.rt-two-slash-code .shiki {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.875rem;
  line-height: 1.5rem;
  border: 1px solid var(--ui-border);
  /* !important beats the background Shiki writes inline on the pre */
  background-color: var(--mion-panel-bg) !important;
  border-radius: var(--mion-panel-radius);
  padding: 0.75rem 1rem;
  /* long lines scroll inside the block: with hovers off nothing hangs outside it,
     the query and completion boxes sit inside the lines they annotate */
  overflow-x: auto;
  margin: 0;
}

.rt-two-slash-code.with-title .shiki {
  border-top: 0;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.rt-two-slash-code .twoslash-meta-line,
.rt-two-slash-code .twoslash-tag-line {
  max-width: 100%;
  text-wrap-mode: wrap;
}

.rt-two-slash-code .shiki code {
  display: block;
}

/* Tag lines mirror the prose alerts (app.config `ui.prose.callout`); selectors outrank twoslash's per-type rules. */
.rt-two-slash-code .shiki code .twoslash-tag-line {
  --mion-tag-color: var(--ui-info);
  background-color: color-mix(in srgb, var(--mion-tag-color) 12%, var(--mion-panel-bg));
  border-left: 4px solid var(--mion-tag-color);
  border-radius: var(--ui-radius);
  color: var(--ui-text);
}
.rt-two-slash-code .shiki code .twoslash-tag-error-line {
  --mion-tag-color: var(--ui-error);
}
.rt-two-slash-code .shiki code .twoslash-tag-warn-line {
  --mion-tag-color: var(--ui-warning);
}
.rt-two-slash-code .shiki code .twoslash-tag-annotate-line {
  --mion-tag-color: var(--ui-success);
}
/* deeper on light, lighter on dark, like the prose alert icons; beats the dark `.shiki span` rule below */
:root .rt-two-slash-code .shiki .twoslash-tag-line .twoslash-tag-icon {
  color: color-mix(in oklab, var(--mion-tag-color) 75%, var(--ui-text-highlighted)) !important;
}

/* Ensure empty lines have proper height */
.rt-two-slash-code .shiki .line:empty::before {
  content: ' ';
}

.rt-two-slash-code .shiki .line {
  display: block;
  max-width: 100%;
}

/* Dark mode: Use Shiki's dark theme colours; tokens sit on the panel surface */
:root.dark .rt-two-slash-code .shiki,
:root.dark .rt-two-slash-code .shiki span {
  color: var(--shiki-dark) !important;
}

:root.dark .rt-two-slash-code .shiki span {
  background-color: transparent !important;
}

/* Twoslash hover token - ensure popups stay within bounds */
.rt-two-slash-code .twoslash-hover {
  position: relative;
}

/* Twoslash popup styling */
.rt-two-slash-code .twoslash-popup-code {
  border-radius: var(--mion-panel-radius);
  box-shadow: 0 0 8px 0 color-mix(in srgb, var(--color-brand-400) 50%, transparent);
  padding: 0;
  letter-spacing: -0.01rem;
  left: 0;
  right: auto;
  overflow: hidden;
}

.rt-two-slash-code .twoslash-completion-cursor  .twoslash-completion-list {
  border-radius: var(--mion-panel-radius);
  box-shadow: 0 0 8px 0 color-mix(in srgb, var(--color-brand-400) 50%, transparent);
}

.rt-two-slash-code .twoslash-popup-arrow {
  background: var(--mion-panel-bg);
}

.rt-two-slash-code .twoslash-popup-container,
.rt-two-slash-code .twoslash-completion-cursor .twoslash-completion-list {
  background: var(--mion-panel-bg);
  border-color: var(--color-brand-700);
}
</style>

