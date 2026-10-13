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
    prose: {
      // Inline code sits in the line like a word: inline (not inline-block, which
      // makes the line taller), a font size relative to the text around it, a tight
      // padding, and a faint wash of the subsite's colour so it still reads as code.
      code: {
        base: 'px-[0.3em] py-0 text-[0.86em] leading-none font-mono font-normal rounded-[0.35em] inline',
        variants: {
          color: {
            neutral: 'border border-primary/20 bg-primary/10 text-brand-700 dark:text-brand-200',
          },
        },
      },
      // Code blocks: one rounded panel with the benchmark cards' look (--mion-panel-bg
      // surface, the default border, mion.css).
      // A file name or tab label is plain small text at the top of the panel: no tab
      // box, no icon, no line between it and the code. TwoslashCode.vue reads this
      // same `pre` config, so every code block looks alike.
      // Alerts (::note info, ::tip success, ::warning, ::caution error): the panel
      // surface washed with the type's colour, one thick left border and the icon in
      // it; text, links and inline code stay neutral so they read on every wash.
      // Class lists are literal per colour: Tailwind only builds classes it can read.
      callout: {
        variants: {
          color: {
            info: {
              base: 'border-0 border-s-4 border-info bg-[color-mix(in_srgb,var(--ui-info)_12%,var(--mion-panel-bg))] text-default dark:text-default [&_a]:text-brand-800 dark:[&_a]:text-primary [&_a]:hover:border-primary [&_a]:focus-visible:outline-primary [&_code]:text-highlighted dark:[&_code]:text-highlighted [&_code]:border-info/25',
              icon: 'text-info-700 dark:text-info',
            },
            success: {
              base: 'border-0 border-s-4 border-success bg-[color-mix(in_srgb,var(--ui-success)_12%,var(--mion-panel-bg))] text-default dark:text-default [&_a]:text-brand-800 dark:[&_a]:text-primary [&_a]:hover:border-primary [&_a]:focus-visible:outline-primary [&_code]:text-highlighted dark:[&_code]:text-highlighted [&_code]:border-success/25',
              icon: 'text-success-700 dark:text-success',
            },
            warning: {
              base: 'border-0 border-s-4 border-warning bg-[color-mix(in_srgb,var(--ui-warning)_12%,var(--mion-panel-bg))] text-default dark:text-default [&_a]:text-brand-800 dark:[&_a]:text-primary [&_a]:hover:border-primary [&_a]:focus-visible:outline-primary [&_code]:text-highlighted dark:[&_code]:text-highlighted [&_code]:border-warning/25',
              icon: 'text-warning-700 dark:text-warning',
            },
            error: {
              base: 'border-0 border-s-4 border-error bg-[color-mix(in_srgb,var(--ui-error)_12%,var(--mion-panel-bg))] text-default dark:text-default [&_a]:text-brand-800 dark:[&_a]:text-primary [&_a]:hover:border-primary [&_a]:focus-visible:outline-primary [&_code]:text-highlighted dark:[&_code]:text-highlighted [&_code]:border-error/25',
              icon: 'text-error-700 dark:text-error',
            },
          },
        },
      },
      pre: {
        slots: {
          header: 'border-default bg-(--mion-panel-head-bg) px-4 py-2',
          filename: 'text-muted text-xs/5 font-mono',
          icon: 'hidden',
          base: 'border-default bg-(--mion-panel-bg)',
        },
        variants: {
          filename: {
            true: {
              root: '[&>pre]:border-t-0',
            },
          },
        },
      },
      codeGroup: {
        slots: {
          list: 'border-default bg-(--mion-panel-head-bg) gap-3 px-4 py-2',
          indicator: 'hidden',
          trigger: 'px-0 py-0 text-xs/5 font-mono text-dimmed data-[state=active]:text-muted hover:bg-transparent hover:text-muted',
          triggerIcon: 'hidden',
        },
      },
    },
    colors: {
      // The `brand` palette every subsite fills in (sites/<id>/theme.css --site-brand-*).
      primary: 'brand',
    },
  },
});
