<!-- The subsite switch in the header: ONE button naming the current subsite, in the
     subsite's accent colour, that opens a popup listing every subsite with its icon
     and a one-line intro (app/utils/subsites.ts). On the root landing, where there is
     no current subsite, the button reads "Explore" in a neutral colour. Each popup
     entry carries its own `data-site`, so the [data-site] bridge in mion.css paints
     it in that subsite's colours, the same way the intro blocks on the root landing
     get theirs. Rendered by AppHeaderCenter on every page. -->
<script setup lang="ts">
const route = useRoute()
const {subsite} = useSubsite()
const entries = computed(() => SUBSITES.map((entry) => ({...entry, active: isInSubsite(route.path, entry)})))
</script>

<template>
  <UPopover
    :content="{align: 'start', sideOffset: 6}"
    :ui="{content: 'subsite-menu-popup'}"
  >
    <UButton
      :label="subsite?.label ?? 'Explore'"
      :icon="subsite?.icon ?? 'i-lucide-compass'"
      trailing-icon="i-lucide-chevron-down"
      :color="subsite ? 'primary' : 'neutral'"
      variant="soft"
      class="subsite-menu-button"
      :class="{'subsite-menu-button--site': subsite}"
      aria-label="Switch between RPC, RunTypes and Benchmarks"
    />

    <template #content="{close}">
      <nav
        class="subsite-menu"
        aria-label="Subsites"
      >
        <NuxtLink
          v-for="entry in entries"
          :key="entry.id"
          :to="entry.path"
          :data-site="entry.id"
          class="subsite-menu-item"
          :class="{'is-active': entry.active}"
          :aria-current="entry.active ? 'page' : undefined"
          @click="close()"
        >
          <UIcon
            :name="entry.icon"
            class="subsite-menu-icon"
          />
          <span class="subsite-menu-text">
            <span class="subsite-menu-label">{{ entry.label }}</span>
            <span class="subsite-menu-desc">{{ entry.description }}</span>
          </span>
          <UIcon
            v-if="entry.active"
            name="i-lucide-check"
            class="subsite-menu-check"
          />
        </NuxtLink>
      </nav>
    </template>
  </UPopover>
</template>

<style scoped>
.subsite-menu-button {
  font-weight: 600;
  white-space: nowrap;
}

/* the current subsite reads in the same accent as the header word beside the logo */
.subsite-menu-button--site {
  color: var(--site-accent);
}

.subsite-menu {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  width: min(22rem, calc(100vw - 2rem));
  padding: 0.4rem;
}

.subsite-menu-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 0.7rem;
  padding: 0.6rem 0.7rem;
  border-radius: 0.5rem;
  text-decoration: none;
  color: inherit;
  transition: background-color 0.15s ease;
}

.subsite-menu-item:hover,
.subsite-menu-item:focus-visible {
  background: color-mix(in srgb, var(--color-brand-500) 12%, transparent);
  outline: none;
}

.subsite-menu-item.is-active {
  background: color-mix(in srgb, var(--color-brand-500) 8%, transparent);
}

.subsite-menu-icon {
  flex: 0 0 auto;
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.1rem;
  color: var(--site-accent);
}

.subsite-menu-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.subsite-menu-label {
  font-weight: 700;
  line-height: 1.2;
  color: var(--site-accent);
}

.subsite-menu-desc {
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--ui-text-muted);
}

.subsite-menu-check {
  width: 1rem;
  height: 1rem;
  margin-top: 0.15rem;
  color: var(--site-accent);
}
</style>
