<script setup lang="ts">
import catalog from './go-generated/functions-catalog.json';

interface FunctionEntry {
  /** The name a marker calls this function by. */
  name: string;
  /** The short name the emitted code uses. A separate vocabulary on purpose. */
  tag?: string;
  doc: string;
  /** The createX export that compiles it. */
  factory: string;
  /** The compile-time options bag that refines it, absent when it takes none. */
  options?: string;
  /** The strategy values the options bag accepts. */
  variants?: string[];
  rejectCircularRefs?: boolean;
}

const functions = catalog.functions as FunctionEntry[];

/** The extra facts a row carries, as one sentence per row rather than a second table. */
function notes(entry: FunctionEntry): string[] {
  const out: string[] = [];
  if (entry.variants?.length) out.push(`${entry.options ?? 'strategy'}: ${entry.variants.join(', ')}`);
  else if (entry.options) out.push(`Takes ${entry.options}`);
  if (entry.rejectCircularRefs) out.push('Accepts rejectCircularRefs');
  return out;
}

/** Rows read alphabetically by the factory, so a factory's variants sit together. */
const rows = [...functions].sort((a, b) => a.factory.localeCompare(b.factory) || a.name.localeCompare(b.name));
</script>

<template>
  <table class="fns">
    <thead>
      <tr>
        <th>Factory</th>
        <th>Marker name</th>
        <th>What it does</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="entry in rows" :id="entry.name" :key="entry.name">
        <td><code>{{ entry.factory }}</code></td>
        <td><code>{{ entry.name }}</code></td>
        <td>
          {{ entry.doc }}
          <span v-for="note in notes(entry)" :key="note" class="fns__note">{{ note }}</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
/* Styled here rather than inherited: the site's prose table rules only reach tables the
   markdown parser generated, not a component's own. */
.fns {
  width: 100%;
  margin-top: 1rem;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.fns th,
.fns td {
  padding: 0.5rem 1rem 0.5rem 0;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--ui-border);
}

.fns th {
  font-weight: 600;
  white-space: nowrap;
}

/* The two name columns take only what they need, so the description gets the rest. */
.fns td:first-child,
.fns td:nth-child(2) {
  width: 1%;
  white-space: nowrap;
}

.fns__note {
  display: block;
  margin-top: 0.2rem;
  color: var(--ui-text-muted);
  font-size: 0.85rem;
}
</style>
