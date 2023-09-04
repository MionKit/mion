

<script setup>
const props = defineProps({
  id: {
    type: String,
    required: true,
  },
});

const typeId = `type-${props.id}`;
</script>

<template>
  <div :id="typeId" class="mion-type">
    <div class="type-name">
      <slot name="name" />
    </div>
    <div class="code">
      <slot name="code" />
    </div>
  </div>
</template>

<style scoped>
.mion-type {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-2);
  border-radius: var(--radii-lg);
  border: 1px solid var(--elements-border-primary-static);
  background: var(--elements-backdrop-background);
  -webkit-backdrop-filter: var(--elements-backdrop-filter);
  backdrop-filter: var(--elements-backdrop-filter);
  margin-bottom: var(--space-8);
}

.code:deep(p),
.code:deep(.alert) {
  font-size: var(--text-sm-fontSize);
  margin: var(--space-4) 0;
}

.type-name:deep(p) {
  display: inline;
  padding: 1rem;
  color: var(--prose-a-code-color-static);
  border-width: var(--prose-a-code-border-width);
  border-style: var(--prose-a-code-border-style);
  border-color: var(--prose-a-code-border-color-static);
  font-family: var(--typography-font-code);
  border-radius: var(--prose-code-inline-borderRadius);
  padding: var(--prose-code-inline-padding);
  margin-left: 1px;
  margin-right: 1px;
  font-size: var(--prose-code-inline-fontSize);
  font-weight: var(--prose-code-inline-fontWeight);
  color: var(--prose-code-inline-color);
  background-color: var(--prose-code-inline-backgroundColor);
}

.code:deep(.prose-code) {
  margin: 0;
  border-radius: 0;
  border: none;
  background: transparent;
  backdrop-filter: none;
  margin-top: var(--space-4);
}

.code:deep(.prose-code > pre) {
  padding: 0;
}

.code:deep(code) {
  font-size: var(--fontSize-xs);
}
</style>