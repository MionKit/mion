# Mion  Documentations

Mion documentation site is based on:

*  [nuxt-content](https://content.nuxtjs.org/)
*  [docus](https://docus.dev/)
*  [embedme](https://www.npmjs.com/package/embedme)

Some source code is embeded into the documentation using [embedme](https://www.npmjs.com/package/embedme).
Run `npm run auto-readme` to automatically embed source code into docs after updating any mion package.

Be sure to disable Prettier in markdown files as it is not compatible with [Nuxt MDC syntax](https://content.nuxtjs.org/guide/writing/mdc#attributes).
## Setup

Install dependencies:

```bash
npm install
```

## Development

```bash
npm run dev
```

## Static Generation

Use the `generate` command to build your application.

The HTML files will be generated in the .output/public directory and ready to be deployed to any static compatible hosting.

```bash
npm run generate
```

## Preview build

You might want to preview the result of your build locally, to do so, run the following command:

```bash
npm run preview
```

---

For a detailed explanation of how things work, check out [Docus](https://docus.dev).
