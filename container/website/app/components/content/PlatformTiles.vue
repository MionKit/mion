<script setup lang="ts">
// A black-ink logo ships a light-ink twin (`dark`) that swaps in on the dark theme.
type Platform = {name: string; to: string; logo: string; dark?: string};

const PLATFORMS: Platform[] = [
  {name: 'Bun', to: '/rpc/platforms/bun', logo: '/platforms/bun.svg'},
  {name: 'Node.js', to: '/rpc/platforms/node-js', logo: '/platforms/node.svg', dark: '/platforms/node-dark.svg'},
  {name: 'AWS Lambda', to: '/rpc/platforms/aws-lambda', logo: '/platforms/aws-lambda.svg'},
  {name: 'Google Cloud Functions', to: '/rpc/platforms/google-cloud-functions', logo: '/platforms/google-cloud-functions.svg'},
  {name: 'Cloudflare Workers', to: '/rpc/platforms/cloudflare', logo: '/platforms/cloudflare.svg'},
  {name: 'Vercel', to: '/rpc/platforms/vercel', logo: '/platforms/vercel.svg', dark: '/platforms/vercel-dark.svg'},
];
</script>

<template>
  <ul class="platform-tiles">
    <li v-for="platform in PLATFORMS" :key="platform.name">
      <NuxtLink :to="platform.to" class="platform-tile">
        <img :src="platform.logo" alt="" class="platform-logo" :class="{'is-light-only': platform.dark}" loading="lazy" />
        <img v-if="platform.dark" :src="platform.dark" alt="" class="platform-logo is-dark-only" loading="lazy" />
        <span class="platform-name">{{ platform.name }}</span>
      </NuxtLink>
    </li>
  </ul>
</template>

<style scoped>
.platform-tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  justify-content: space-between;
  gap: 1rem 2rem;
  max-width: 48rem;
  margin: 0.5rem auto 1.25rem;
  padding: 0;
  list-style: none;
}

.platform-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1rem 0.5rem 0.75rem;
  border-radius: 0.75rem;
  text-decoration: none;
  transition: background-color 0.2s;
}

.platform-tile:hover,
.platform-tile:focus-visible {
  background: color-mix(in srgb, var(--ui-text-muted) 8%, transparent);
}

.platform-logo {
  height: 4.5rem;
  width: auto;
  max-width: 9rem;
  margin: 0;
  object-fit: contain;
  transition: transform 0.2s;
}

.platform-tile:hover .platform-logo {
  transform: translateY(-2px);
}

.platform-name {
  font-size: 0.8rem;
  color: var(--ui-text-dimmed);
}

.platform-tile:hover .platform-name {
  color: var(--ui-text-highlighted);
}

.is-dark-only,
.dark .is-light-only {
  display: none;
}

.dark .is-dark-only {
  display: block;
}

@media (max-width: 480px) {
  .platform-logo {
    height: 3rem;
  }
}
</style>
