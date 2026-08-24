<script setup lang="ts">
import {computed, ref} from 'vue';
import catalog from './go-generated/diagnostics-catalog.json';

interface CodeEntry {
  code: string;
  subsystem: string;
  severity: 'error' | 'warning' | 'info';
  headline: string;
  detail: string | null;
  summary: string | null;
  example: string | null;
  fix: string | null;
}

interface Subsystem {
  key: string;
  label: string;
  description: string;
}

const subsystems = catalog.subsystems as Subsystem[];
const codes = catalog.codes as CodeEntry[];

const query = ref('');
const needle = computed(() => query.value.trim().toLowerCase());

/** Search runs over the code, the headline, and the written summary. */
function matches(entry: CodeEntry): boolean {
  const term = needle.value;
  if (!term) return true;
  return (
    entry.code.toLowerCase().includes(term) ||
    entry.headline.toLowerCase().includes(term) ||
    (entry.summary?.toLowerCase().includes(term) ?? false) ||
    (entry.detail?.toLowerCase().includes(term) ?? false)
  );
}

const sections = computed(() =>
  subsystems
    .map((subsystem) => ({
      ...subsystem,
      entries: codes.filter((entry) => entry.subsystem === subsystem.key && matches(entry)),
    }))
    .filter((subsystem) => subsystem.entries.length > 0),
);

const shownCount = computed(() => codes.filter(matches).length);

/** Escape HTML, then turn `backtick spans` into inline <code>. Input is our own prose. */
function withInlineCode(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
}

const severityLabel: Record<string, string> = {error: 'Error', warning: 'Warning', info: 'Info'};
</script>

<template>
  <div class="diag">
    <div class="diag-legend">
      <div class="diag-legend__card">
        <span class="diag-badge diag-badge--warning">Warning</span>
        <p>A safe, expected drop, and the build keeps going. Anything with no data form (a method, a function-valued property, a symbol key) is left out of the generated function.</p>
      </div>
      <div class="diag-legend__card">
        <span class="diag-badge diag-badge--error">Error</span>
        <p>The generated function would throw the moment you call it, so the build stops. A whole value has no data form, like a type that resolves to <code>never</code> or a bare <code>symbol</code>. Change the type.</p>
      </div>
    </div>

    <div class="diag-search">
      <input
        v-model="query"
        type="search"
        class="diag-search__input"
        placeholder="Search a code or a message, e.g. VL010 or symbol"
        aria-label="Search diagnostics"
      />
      <span class="diag-search__count">{{ shownCount }} of {{ codes.length }} codes</span>
    </div>

    <section v-for="subsystem in sections" :key="subsystem.key" class="diag-section">
      <h2 :id="subsystem.key" class="diag-section__title">{{ subsystem.label }}</h2>
      <p class="diag-section__desc">{{ subsystem.description }}</p>

      <article v-for="entry in subsystem.entries" :id="entry.code" :key="entry.code" class="diag-entry">
        <header class="diag-entry__head">
          <a :href="`#${entry.code}`" class="diag-entry__code">{{ entry.code }}</a>
          <span :class="['diag-badge', `diag-badge--${entry.severity}`]">{{ severityLabel[entry.severity] }}</span>
        </header>

        <pre class="diag-entry__headline"><code>{{ entry.headline }}</code></pre>

        <p v-if="entry.summary" class="diag-entry__summary" v-html="withInlineCode(entry.summary)" />

        <div v-if="entry.example" class="diag-entry__snippet">
          <span class="diag-entry__label">A type that triggers it</span>
          <pre class="diag-entry__example"><code>{{ entry.example }}</code></pre>
        </div>

        <div v-if="entry.fix" class="diag-entry__snippet">
          <span class="diag-entry__label">How to fix it</span>
          <pre class="diag-entry__fix"><code>{{ entry.fix }}</code></pre>
        </div>

        <details v-if="entry.detail" class="diag-entry__more">
          <summary>Full build message</summary>
          <pre><code>{{ entry.detail }}</code></pre>
        </details>
      </article>
    </section>

    <p v-if="sections.length === 0" class="diag-empty">No codes match “{{ query }}”.</p>
  </div>
</template>

<style scoped>
.diag {
  margin-top: 1rem;
}

.diag-legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.9rem;
  margin: 1rem 0 1.5rem;
}

@media (max-width: 640px) {
  .diag-legend {
    grid-template-columns: 1fr;
  }
}

.diag-legend__card {
  padding: 0.9rem 1rem;
  border: 1px solid var(--ui-border, #26262a);
  border-radius: 0.6rem;
  background: color-mix(in oklab, var(--ui-bg-elevated, #141416) 60%, transparent);
}

.diag-legend__card p {
  margin: 0.55rem 0 0;
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--ui-text-muted, #9aa0a6);
}

.diag-legend__card code {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.85em;
  padding: 0.05rem 0.3rem;
  border-radius: 0.3rem;
  background: var(--ui-bg, #0b0b0c);
}

.diag-search {
  position: sticky;
  top: 4rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  background: var(--ui-bg, #0b0b0c);
}

.diag-search__input {
  flex: 1;
  padding: 0.55rem 0.85rem;
  border: 1px solid var(--ui-border, #2a2a2e);
  border-radius: 0.5rem;
  background: var(--ui-bg-elevated, #141416);
  color: inherit;
  font-size: 0.95rem;
}

.diag-search__input:focus {
  outline: none;
  border-color: var(--color-green-500, #79af43);
}

.diag-search__count {
  font-size: 0.8rem;
  color: var(--ui-text-muted, #9aa0a6);
  white-space: nowrap;
}

.diag-section {
  margin-top: 2.5rem;
}

.diag-section__title {
  scroll-margin-top: 6rem;
}

.diag-section__desc {
  margin-top: 0.25rem;
  color: var(--ui-text-muted, #9aa0a6);
}

.diag-entry {
  margin-top: 1.25rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--ui-border, #26262a);
  border-radius: 0.6rem;
  background: color-mix(in oklab, var(--ui-bg-elevated, #141416) 60%, transparent);
  scroll-margin-top: 6rem;
}

.diag-entry__head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.diag-entry__code {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-weight: 600;
  font-size: 0.95rem;
  color: inherit;
  text-decoration: none;
}

.diag-entry__code:hover {
  color: var(--color-green-500, #79af43);
}

.diag-badge {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  border: 1px solid currentColor;
}

.diag-badge--error {
  color: var(--color-red-500, #ef4444);
}

.diag-badge--warning {
  color: var(--color-amber-500, var(--color-yellow-500, #f59e0b));
}

.diag-badge--info {
  color: var(--color-blue-500, #3b82f6);
}

.diag-entry__headline {
  margin: 0.7rem 0 0;
  padding: 0.6rem 0.8rem;
  border-radius: 0.45rem;
  background: var(--ui-bg, #0b0b0c);
  overflow-x: auto;
}

.diag-entry__headline code,
.diag-entry__fix code,
.diag-entry__example code,
.diag-entry__more code {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.diag-entry__summary {
  margin: 0.7rem 0 0;
  line-height: 1.6;
}

.diag-entry__summary :deep(code) {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.85em;
  padding: 0.05rem 0.3rem;
  border-radius: 0.3rem;
  background: var(--ui-bg, #0b0b0c);
}

.diag-entry__snippet {
  margin-top: 0.7rem;
}

.diag-entry__label {
  display: block;
  margin-bottom: 0.3rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ui-text-muted, #9aa0a6);
}

.diag-entry__example,
.diag-entry__fix {
  margin: 0;
  padding: 0.6rem 0.8rem;
  border-radius: 0.45rem;
  background: var(--ui-bg, #0b0b0c);
  overflow-x: auto;
}

.diag-entry__example {
  border-left: 2px solid var(--color-amber-500, var(--color-yellow-500, #f59e0b));
}

.diag-entry__fix {
  border-left: 2px solid var(--color-green-500, #79af43);
}

.diag-entry__more {
  margin-top: 0.7rem;
}

.diag-entry__more summary {
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--ui-text-muted, #9aa0a6);
}

.diag-entry__more pre {
  margin-top: 0.5rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.45rem;
  background: var(--ui-bg, #0b0b0c);
  overflow-x: auto;
}

.diag-empty {
  margin-top: 2rem;
  color: var(--ui-text-muted, #9aa0a6);
}
</style>
