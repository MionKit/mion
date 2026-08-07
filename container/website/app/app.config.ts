export default defineAppConfig({
  // Docus' AppHeader/AppFooterRight read this top-level `github` (not `docus.github`)
  // to render the GitHub icon in the top nav and footer. Docus normally auto-derives
  // it from the local `.git/config`, but the site runs inside a container that only
  // bind-mounts container/website/, so the .git dir is invisible from Nuxt's rootDir
  // and the auto-derivation returns undefined. Set it explicitly here.
  github: {
    owner: 'MionKit',
    name: 'ts-run-types',
    url: 'https://github.com/MionKit/ts-run-types',
    branch: 'main',
  },
  seo: {
    title: 'RunTypes — TypeScript types that show up at runtime',
    description:
      'Validation, JSON + binary serialization, mock data and reflection — generated straight from your TypeScript types. No schemas, no drift.',
    image: '/banners/runtypes-banner.png',
  },
  docus: {
    title: 'ts-runtypes',
    description:
      'TypeScript decided it is "just a linter". We respectfully bolted the runtime back on.',
    image: '/banners/runtypes-banner.png',
    socials: {
      github: 'MionKit/ts-run-types',
      twitter: '@Ma_jrz',
    },
    github: {
      dir: 'container/website/content',
      branch: 'main',
      repo: 'ts-run-types',
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
          text: 'Built by Ma Jerez & Contributors',
          href: 'https://github.com/M-jerez',
          target: '_blank'
        },
      ],
      credits: {
        icon: 'icon-park-outline:copyright',
        text: `MIT license - Copyright ${new Date().getFullYear()} RunTypes`,
        href: 'https://github.com/MionKit/ts-run-types/blob/main/LICENSE',
      },
    }
  },
  ui: {
    // Map the "Type Definition" / "Builder" code-group tab labels to file-type
    // icons. The code is TypeScript in both — the JS icon on "Builder" is just a
    // visual cue for the builder/runtime form, without the misleading `.js` text.
    // CodeIcon.vue keys this map by the LOWERCASED TAB LABEL, so renaming a tab
    // means renaming the key here in the same change or the icon silently drops.
    prose: {
      codeIcon: {
        'type definition': 'i-vscode-icons:file-type-typescript',
        builder: 'i-vscode-icons:file-type-js',
      },
    },
    colors: {
      primary: 'green',
      white: {
        value: "#f7f7ff",
        raw: "#f7f7ff"
      },
      black: {
        value: "#15131a",
        raw: "#15131a"
      },
  }
  },
})
