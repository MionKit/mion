// mion.io's identity: Nuxt merges it with `defu` over site-layers/shared/app/app.config.ts, this file first.
export default defineAppConfig({
  // Docus' AppHeader/AppFooterRight read this top-level `github` (not `docus.github`)
  // to render the GitHub icon in the top nav and footer. Docus normally auto-derives
  // it from the local `.git/config`, but the site runs inside a container that only
  // bind-mounts container/website/, so the .git dir is invisible from Nuxt's rootDir
  // and the auto-derivation returns undefined. Set it explicitly here. `rootDir` is
  // what makes the "Edit this page" link point at container/website/content/….
  github: {
    owner: 'MionKit',
    name: 'mion',
    url: 'https://github.com/MionKit/mion',
    branch: 'main',
    rootDir: 'container/website',
  },
  seo: {
    title: 'mion - Full Stack APIs at the speed of light',
    description: 'mion is the definitive TypeScript framework for Full Stack APIs, built for exceptional developer experience.',
    image: '/banners/mion-v2-website-banner.png',
  },
  shared: {
    sections: [
      {
        id: 'rpc',
        label: 'RPC',
        title: 'RPC',
        url: 'https://mion.io/rpc',
        homeTitle: 'About mion RPC',
        icon: 'icon-park-outline:lightning',
        description: 'Full stack TypeScript APIs. A plain function is a validated route, called from a fully typed client.',
      },
      {
        id: 'runtypes',
        label: 'RunTypes',
        title: 'RunTypes',
        url: 'https://mion.io/runtypes',
        homeTitle: 'About mion RunTypes',
        icon: 'i-lucide-braces',
        description: 'Validation, JSON round trip, mock data and reflection, generated from your TypeScript types.',
      },
      {
        id: 'benchmarks',
        label: 'Benchmarks',
        title: 'Benchmarks',
        url: 'https://mion.io/benchmarks',
        homeTitle: 'mion Benchmarks',
        icon: 'i-lucide-gauge',
        description: 'The RPC server and RunTypes measured against other frameworks and validators, regenerated on every deploy.',
      },
    ],
    // Section home pages are wide without a pattern; flush pages keep the rail.
    widePages: ['^/runtypes/(introduction|guide)(/|$)'],
    flushPages: ['^/benchmarks/.+'],
    menuLabel: 'Switch between RPC, RunTypes and Benchmarks',
  },
  docus: {
    title: 'Full Stack APIs at the speed of light 🚀',
    description: 'Speed up API development and say hello to a smoother development experience.',
    image: '/banners/mion-v2-website-banner.png',
    socials: {
      github: 'MionKit/mion',
      twitter: '@Ma_jrz',
    },
    github: {
      dir: 'container/website/content',
      branch: 'main',
      repo: 'mion',
      owner: 'MionKit',
      edit: false
    },
    footer: {
      textLinks: [
        {
          text: 'Developed by Ma Jerez & Contributors',
          href: 'https://github.com/M-jerez',
          target: '_blank'
        },
      ],
      credits: {
        icon: 'icon-park-outline:copyright',
        text: `MIT license - Copyright ${new Date().getFullYear()} mion`,
        href: 'https://github.com/MionKit/mion/blob/main/LICENSE',
      },
    }
  },
});
