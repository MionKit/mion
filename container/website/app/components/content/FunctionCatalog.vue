<script setup lang="ts">
import {computed, ref} from 'vue';
import catalog from './go-generated/functions-catalog.json';

interface FunctionEntry {
  /** The name a marker calls this function by. */
  name: string;
  /** The short name the emitted code uses. A separate vocabulary on purpose. */
  tag?: string;
  group: string;
  doc: string;
  /** The createX export that compiles it, absent for the value-level pieces. */
  factory?: string;
  /** The compile-time options bag that refines it, absent when it takes none. */
  options?: string;
  /** For the JSON pair: the strategy values the options bag accepts. */
  variants?: string[];
  rejectCircularRefs?: boolean;
}

interface Group {
  key: string;
  label: string;
  description: string;
}

const groups = catalog.groups as Group[];
const functions = catalog.functions as FunctionEntry[];

const query = ref('');
const group = ref('all');
const needle = computed(() => query.value.trim().toLowerCase());

/** Every text an entry carries, joined once, so the search matches any word of it. */
const haystack = new Map(
  functions.map((entry) => [
    entry.name,
    [entry.name, entry.tag, entry.doc, entry.factory, entry.options, ...(entry.variants ?? [])]
      .filter(Boolean)
      .join('\n')
      .toLowerCase(),
  ]),
);

function matches(entry: FunctionEntry): boolean {
  if (group.value !== 'all' && entry.group !== group.value) return false;
  return !needle.value || (haystack.get(entry.name)?.includes(needle.value) ?? false);
}

const sections = computed(() =>
  groups
    .map((entry) => ({...entry, entries: functions.filter((fn) => fn.group === entry.key && matches(fn))}))
    .filter((entry) => entry.entries.length > 0),
);

const shownCount = computed(() => functions.filter(matches).length);
const filtered = computed(() => needle.value !== '' || group.value !== 'all');

function clearFilters(): void {
  query.value = '';
  group.value = 'all';
}
</script>

<template>
  <div class="fns">
    <div class="fns-search">
      <input
        v-model="query"
        type="search"
        class="fns-search__input"
        placeholder="Search any text, e.g. validate, binary or strategy"
        aria-label="Search compiled functions"
      />
      <span class="fns-search__count">{{ shownCount }} of {{ functions.length }} functions</span>
    </div>

    <div class="fns-filters" role="group" aria-label="Filter by kind">
      <button type="button" :class="['fns-filters__group', {'is-active': group === 'all'}]" @click="group = 'all'">All</button>
      <button
        v-for="entry in groups"
        :key="entry.key"
        type="button"
        :class="['fns-filters__group', {'is-active': group === entry.key}]"
        @click="group = group === entry.key ? 'all' : entry.key"
      >
        {{ entry.label }}
      </button>
    </div>

    <p v-if="filtered && shownCount === 0" class="fns-empty">
      Nothing matches. <button type="button" class="fns-empty__clear" @click="clearFilters">Clear the filters</button>
    </p>

    <section v-for="section in sections" :key="section.key" class="fns-section">
      <h2 :id="section.key" class="fns-section__title">{{ section.label }}</h2>
      <p class="fns-section__desc">{{ section.description }}</p>

      <article v-for="entry in section.entries" :id="entry.name" :key="entry.name" class="fns-entry">
        <header class="fns-entry__head">
          <a :href="`#${entry.name}`" class="fns-entry__name">{{ entry.name }}</a>
          <code v-if="entry.factory" class="fns-entry__factory">{{ entry.factory }}()</code>
          <code v-else class="fns-entry__factory fns-entry__factory--none">getRTFunction</code>
        </header>

        <p class="fns-entry__doc">{{ entry.doc }}</p>

        <dl class="fns-entry__meta">
          <template v-if="entry.options">
            <dt>Options</dt>
            <dd>
              <code>{{ entry.options }}</code>
              <span v-if="entry.variants?.length"> ({{ entry.variants.join(', ') }})</span>
            </dd>
          </template>
          <template v-if="entry.rejectCircularRefs">
            <dt>Guards cycles</dt>
            <dd>Accepts <code>rejectCircularRefs</code></dd>
          </template>
          <template v-if="entry.tag">
            <dt>Emitted as</dt>
            <dd><code>{{ entry.tag }}</code></dd>
          </template>
        </dl>
      </article>
    </section>
  </div>
</template>

<style scoped>
.fns {
  margin-top: 1rem;
}

.fns-search {
  position: sticky;
  top: 4rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  background: var(--ui-bg);
}

.fns-search__input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  background: var(--ui-bg-elevated);
  font: inherit;
}

.fns-search__count {
  flex-shrink: 0;
  color: var(--ui-text-muted);
  font-size: 0.85rem;
}

.fns-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1.5rem;
}

.fns-filters__group {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.fns-filters__group.is-active {
  background: var(--ui-bg-elevated);
  color: inherit;
}

.fns-empty {
  color: var(--ui-text-muted);
}

.fns-empty__clear {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.fns-section__title {
  margin-top: 2rem;
}

.fns-section__desc {
  margin-top: 0.25rem;
  color: var(--ui-text-muted);
}

.fns-entry {
  padding: 0.9rem 0;
  border-top: 1px solid var(--ui-border);
}

.fns-entry__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.6rem;
}

.fns-entry__name {
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  text-decoration: none;
}

.fns-entry__factory {
  font-size: 0.85rem;
  color: var(--ui-text-muted);
}

.fns-entry__factory--none::before {
  content: 'no factory, use ';
}

.fns-entry__doc {
  margin: 0.4rem 0 0;
}

.fns-entry__meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.15rem 0.75rem;
  margin: 0.5rem 0 0;
  color: var(--ui-text-muted);
  font-size: 0.85rem;
}

.fns-entry__meta dt {
  font-weight: 500;
}

.fns-entry__meta dd {
  margin: 0;
}
</style>
