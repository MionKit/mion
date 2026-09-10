<script setup lang="ts">
import {computed, ref} from 'vue';
import catalog from './go-generated/diagnostics-catalog.json';

interface CodeEntry {
  code: string;
  subsystem: string;
  /** The three-way level: did the build produce the code, and does it work. */
  level: 'error' | 'runtimeError' | 'warning';
  /** The level's two-way label form, what a tsc-shaped build line prints. */
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

type Level = CodeEntry['level'];

const query = ref('');
const level = ref<Level | 'all'>('all');
const family = ref('all');
const needle = computed(() => query.value.trim().toLowerCase());

const familyLabel = new Map(subsystems.map((subsystem) => [subsystem.key, subsystem.label]));

/** Every text an entry carries, joined once, so the search matches any word of it. */
const haystack = new Map(
  codes.map((entry) => [
    entry.code,
    [entry.code, familyLabel.get(entry.subsystem), entry.headline, entry.summary, entry.detail, entry.example, entry.fix]
      .filter(Boolean)
      .join('\n')
      .toLowerCase(),
  ]),
);

function matches(entry: CodeEntry): boolean {
  if (level.value !== 'all' && entry.level !== level.value) return false;
  if (family.value !== 'all' && entry.subsystem !== family.value) return false;
  return !needle.value || (haystack.get(entry.code)?.includes(needle.value) ?? false);
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
const filtered = computed(() => needle.value !== '' || level.value !== 'all' || family.value !== 'all');

function clearFilters(): void {
  query.value = '';
  level.value = 'all';
  family.value = 'all';
}

/** Escape HTML, then turn `backtick spans` into inline <code>. Input is our own prose. */
function withInlineCode(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
}

const levelLabel: Record<Level, string> = {error: 'Error', runtimeError: 'RuntimeError', warning: 'Warning'};

/** Badge class suffixes have to be valid CSS identifiers, so camelCase becomes a dash. */
const levelClass: Record<Level, string> = {error: 'error', runtimeError: 'runtime', warning: 'warning'};

const levelOptions: Level[] = ['error', 'runtimeError', 'warning'];
</script>

<template>
  <div class="diag">
    <div class="diag-search">
      <input
        v-model="query"
        type="search"
        class="diag-search__input"
        placeholder="Search any text, e.g. VL010, symbol or bigint"
        aria-label="Search diagnostics"
      />
      <span class="diag-search__count">{{ shownCount }} of {{ codes.length }} codes</span>
    </div>

    <div class="diag-filters">
      <div class="diag-filters__levels" role="group" aria-label="Filter by level">
        <button type="button" :class="['diag-filters__level', {'is-active': level === 'all'}]" @click="level = 'all'">All levels</button>
        <button
          v-for="option in levelOptions"
          :key="option"
          type="button"
          :class="['diag-filters__level', {'is-active': level === option}]"
          @click="level = level === option ? 'all' : option"
        >
          <span :class="['diag-badge', `diag-badge--${levelClass[option]}`]">{{ levelLabel[option] }}</span>
        </button>
      </div>
      <select v-model="family" class="diag-filters__family" aria-label="Filter by feature">
        <option value="all">All features</option>
        <option v-for="subsystem in subsystems" :key="subsystem.key" :value="subsystem.key">{{ subsystem.label }}</option>
      </select>
    </div>

    <section v-for="subsystem in sections" :key="subsystem.key" class="diag-section">
      <h2 :id="subsystem.key" class="diag-section__title">{{ subsystem.label }}</h2>
      <p class="diag-section__desc">{{ subsystem.description }}</p>

      <article v-for="entry in subsystem.entries" :id="entry.code" :key="entry.code" class="diag-entry">
        <header class="diag-entry__head">
          <a :href="`#${entry.code}`" class="diag-entry__code">{{ entry.code }}</a>
          <span :class="['diag-badge', `diag-badge--${levelClass[entry.level]}`]">{{ levelLabel[entry.level] }}</span>
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

    <p v-if="sections.length === 0" class="diag-empty">
      No codes match.
      <button v-if="filtered" type="button" class="diag-empty__clear" @click="clearFilters">Clear the search and filters</button>
    </p>
  </div>
</template>

<style scoped>
.diag {
  margin-top: 1rem;
}

.diag-search {
  position: sticky;
  top: 4rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  background: var(--ui-bg);
}

.diag-search__input {
  flex: 1;
  padding: 0.55rem 0.85rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  background: var(--ui-bg-elevated);
  color: inherit;
  font-size: 0.95rem;
}

.diag-search__input:focus {
  outline: none;
  border-color: var(--color-brand-500);
}

.diag-search__count {
  font-size: 0.8rem;
  color: var(--ui-text-muted);
  white-space: nowrap;
}

.diag-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-top: 0.5rem;
}

.diag-filters__levels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.diag-filters__level {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-muted);
  font-size: 0.8rem;
  cursor: pointer;
}

.diag-filters__level:hover {
  border-color: var(--color-brand-500);
}

.diag-filters__level.is-active {
  border-color: var(--color-brand-500);
  background: color-mix(in srgb, var(--color-brand-500) 15%, transparent);
  color: inherit;
}

.diag-filters__family {
  margin-left: auto;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  background: var(--ui-bg-elevated);
  color: inherit;
  font-size: 0.85rem;
}

.diag-filters__family:focus {
  outline: none;
  border-color: var(--color-brand-500);
}

.diag-section {
  margin-top: 2.5rem;
}

.diag-section__title {
  scroll-margin-top: 6rem;
}

.diag-section__desc {
  margin-top: 0.25rem;
  color: var(--ui-text-muted);
}

.diag-entry {
  margin-top: 1.25rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.6rem;
  background: color-mix(in oklab, var(--ui-bg-elevated) 60%, transparent);
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
  color: var(--color-brand-500);
}

.diag-entry__headline {
  margin: 0.7rem 0 0;
  padding: 0.6rem 0.8rem;
  border-radius: 0.45rem;
  background: var(--ui-bg);
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
  background: var(--ui-bg);
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
  color: var(--ui-text-muted);
}

.diag-entry__example,
.diag-entry__fix {
  margin: 0;
  padding: 0.6rem 0.8rem;
  border-radius: 0.45rem;
  background: var(--ui-bg);
  overflow-x: auto;
}

.diag-entry__example {
  border-left: 2px solid var(--color-amber-500, var(--color-yellow-500));
}

.diag-entry__fix {
  border-left: 2px solid var(--color-brand-500);
}

.diag-entry__more {
  margin-top: 0.7rem;
}

.diag-entry__more summary {
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--ui-text-muted);
}

.diag-entry__more pre {
  margin-top: 0.5rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.45rem;
  background: var(--ui-bg);
  overflow-x: auto;
}

.diag-empty {
  margin-top: 2rem;
  color: var(--ui-text-muted);
}

.diag-empty__clear {
  margin-left: 0.5rem;
  color: var(--color-brand-500);
  text-decoration: underline;
  cursor: pointer;
}
</style>
