// The one app config for the whole site. Nuxt merges app configs with `defu` (project
// first, per key, recursively), so whatever is left out still falls through to Docus'
// own defaults. Per-subsite differences (the header word, the colour scheme, the docs
// title template, the SEO of each landing page) come from the route, never from here:
// see app/utils/subsites.ts.
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
  // `sub: 'aside'` is what gives every subsite its OWN sidebar: Docus' useSubNavigation
  // then scopes the sidebar to the top-level section the route is in instead of
  // showing the whole tree. The section anchors it would add at the top of the sidebar
  // are replaced by the header tabs (DocsAsideLeftTop.vue is overridden to nothing).
  navigation: {
    sub: 'aside',
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
    aside: {
      level: 0,
      collapsed: false,
      exclude: []
    },
    main: {
      padded: true,
      fluid: false
    },
    header: {
      padded: true,
      logo: true,
      showLinkIcon: true,
      exclude: [],
      fluid: false
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
  ui: {
    // Map the "Type Definition" / "Type Builder" code-group tab labels (the runtypes
    // pages) to file-type icons. The code is TypeScript in both: the JS icon on
    // "Type Builder" is just a visual cue for the builder/runtime form, without
    // the misleading `.js` text. CodeIcon.vue keys this map by the LOWERCASED
    // TAB LABEL, so renaming a tab means renaming the key here in the same
    // change or the icon silently drops.
    prose: {
      codeIcon: {
        'type definition': 'i-vscode-icons:file-type-typescript',
        'type builder': 'i-vscode-icons:file-type-js',
      },
    },
    colors: {
      // The `brand` palette every subsite fills in (sites/<id>/theme.css --site-brand-*).
      primary: 'brand',
    },
  },
});
