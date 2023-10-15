<script setup>
</script>
<template>
  <div class="platform-tiles">
    <div class="tile">
      <nuxt-img src="/platforms/bun-logo.svg" class="platform-img" loading="lazy" />
    </div>
    <div class="tile">
      <nuxt-img src="/platforms/node-logo.svg" class="platform-img" loading="lazy" />
    </div>
    <div class="tile">
      <nuxt-img src="/platforms/aws-lambda-logo.svg" class="platform-img" loading="lazy" />
    </div>
    <div class="tile">
      <nuxt-img src="/platforms/azure-functions-logo.svg" class="platform-img" loading="lazy" />
    </div>
    <div class="tile">
      <nuxt-img src="/platforms/google-cloud-functions-logo.svg" class="platform-img" loading="lazy" />
    </div>
  </div>
</template>
<style scoped>
.platform-tiles {
  display: flex;
  flex-direction: row;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
}
.tile {
  width: 200px;
  padding: 2rem;
}

@media screen and (max-width: 600px) {
  .platform-tiles {
    flex-wrap: wrap;
  }
}

@media screen and (max-width: 400px) {
  .tile {
    width: 120px;
    padding: 0.5rem;
  }
}
</style>