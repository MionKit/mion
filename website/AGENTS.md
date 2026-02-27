# Mion Website Documentation Guidelines

## Tech Stack
- Framework: Nuxt 4 with Docus v5 theme
- Syntax: MDC (Markdown Components) - use Vue components directly in markdown
- Styling: Tailwind CSS classes

## Directory Structure
- `website/content/` - Documentation pages as markdown files with MDC syntax
  - Files numbered for ordering: `1.introduction/`, `2.server/`
  - `index.md` is the homepage, `0.overview.md` is section index
  - Use lowercase with hyphens: `1.about-mion.md`
- `website/app/` - Nuxt application code
  - `app.config.ts` - Docus theme config (colors, SEO, header, footer)
  - `components/content/` - Custom MDC components (`:component-name` syntax)
  - `components/global/` - Global Vue components

## Generating Documentation about packages
- when generating documentation about some feature, please always check that feature's tests for examples and guidance on how to use that feature.
- notes, tips, warnings, components should be added after code examples when possible 

## MDC Syntax

### Inline Components
- Use bracket syntax: `:spacer`, `:bench-chart{id='hello-requests'}`

### Block Components (prefer FRONT MATTER headers style)
- Use `::component` with FRONT MATTER headers between `---` for props using YAML syntax
- Avoid bracket syntax for block components
- Nesting: `:` inline, `::` block, `:::` nested, `::::` deeply nested
- Named slots: use `#slotName` syntax

Example (preferred):
```md
::u-button
---
color: primary
size: xl
to: /introduction/about-mion
---
Read the Docs
::
```

Example (nested with slots):
```md
::u-page-section
#title
Features

#body
  :::u-page-grid
    ::::u-page-card
    ---
    icon: icon-park-outline:flash-payment
    ---
    #title
    Fast
    ::::
  :::
::
```

## Tailwind Customization
- Use `class` prop in YAML headers: `class: flex items-center justify-center`

## Page Headers
- Every page needs YAML frontmatter with `title` and `description`
- Optional: `toc: false` to disable table of contents
- Homepage uses `seo:` block with title, description, image

## Type Reference Section
- Technical pages should have `## Type Reference` at bottom
- Use `:spacer` component before the section to visually separate it
- Display TypeScript types used in the page examples

## External Links
- Use `{target="_blank"}` or `{blank}` for external links

## Code Import
Use the `<code-import>` tag to import code examples from packages rather tha writing them manually. This ensures the examples are always up to date and accurate.
prefer start and end comment markers to delimit the code to import.

<!-- Full file import -->
<code-import path="packages/router/examples/routes-definition.routes.ts" lang="ts" />

<!-- Line range (1-10) -->
<code-import path="packages/router/examples/middleFns-definition.routes.ts" lang="ts" lines="1,10" />

<!-- Comment markers -->
<code-import path="packages/router/examples/example.ts" lang="ts" commentStart="start-routes" commentEnd="end-routes" />



