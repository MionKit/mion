---
seo:
  title: RunTypes — TypeScript types that show up at runtime
  description: Validation, JSON + binary serialization, mock data and reflection — generated straight from your TypeScript types. No schemas, no drift.
pageClass: home-page
---

:home-page-body

::gradient-bg
---
angle: 70
opacity: 0.2
blur: 150px
---
::

::u-page-hero{class="home-hero"}
#header
:::typed-title
---
leading: "We fixed TypeScript"
strikeWord: "fixed"
enhancedWord: "Enhanced"
titles:
  - 'Types reflection'
  - 'Automatic validation'
  - 'Automatic data mocking'
  - 'Same type roundtrip serialization'
  - 'Say hello to TsRunTypes'
---
#description
TypeScript decided it is **(Just a Linter)** and to ditch your types at run-time.
<br/>We respectfully **put them back in the run-time** in a way that's reliable and makes sense.
:::

:::div{class="tsgo-kicker"}
[Built on top of Typescript 7 · **100% compatible**](/introduction/built-on-typescript-go){.tsgo-badge}
:::

#links
:::u-button
---
color: neutral
size: xl
to: /introduction/about-ts-runtypes
icon: icon-park-outline:book-one
variant: outline
---
Read the Docs
:::

:::u-button
---
color: neutral
icon: i-lucide-flask-conical
size: xl
to: /playground
variant: outline
---
Playground
:::

:::u-button
---
color: neutral
icon: i-lucide-zap
size: xl
to: /benchmarks/validation
variant: outline
---
Benchmarks
:::

:::u-button
---
color: neutral
icon: i-simple-icons-github
size: xl
to: https://github.com/MionKit/ts-run-types
target: "_blank"
rel: noopener noreferrer
variant: outline
---
GitHub
:::
::

::u-page-section
---
class: home-features
---
#title
Two ways to describe a shape, One source of truth.

#root
:::gradient-bg
---
angle: 70
opacity: 0.15
top: 10rem
blur: 140px
---
:::

#body
Write a plain TypeScript type (fastest, zero ceremony) **or** reach for the `RT.*` schema builders if you like the Zod / TypeBox feel. Both compile to the exact same validator — pick whichever you fancy, mix them in the same file.

:::div{class="rt-define-cols"}
::::code-group
<code-import path="packages/examples/src/_homepage/define-type.ts" lang="ts [Type definition]" />
::::

::::code-group
<code-import path="packages/examples/src/_homepage/define-schema.ts" lang="ts [Schema]" />
::::
:::
::

::u-page-section
#title
Formats baked into your types

#body
:::div{class="rt-formats-cols"}
::::card{class="rt-feature-card"}
### TypeFormats®
Ensure type safety with formats like:    
`email`, `uuidv4`, `ipv4`, `int32`, `positive` and more. 

The validator checks its exact shape, not just its kind. No regex to wire up, no separate schema to keep in sync.

:::::div{class="rt-formats-tile"}
#### Temporal Support
Full TC39 Temporal — `PlainDate`, `ZonedDateTime`, `Duration`… validated and serialized like any built-in.
:::::
::::

::::code-group
<code-import path="packages/examples/src/_homepage/formats-type.ts" lang="ts [Type definition]" />
::::

::::code-group
<code-import path="packages/examples/src/_homepage/formats-schema.ts" lang="ts [Schema]" />
::::
:::
::


::u-page-section
#title
One Type, Multiple functionality.

#body
:::card{class="rt-standard-card"}
::::div{class="rt-standard-split"}
:::::div{class="rt-feature-card rt-standard-prose"}
### The whole toolbelt, in one box
Stop gluing five libraries together. RunTypes shares a single type graph across everything it generates, so the validator and the serializer always agree on what your type means.

[One type in, multiple compiled functions out →](/guide/serialization)
:::::

<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-type" commentEnd="// end-type" />
::::
:::

:::div{class="rt-object-fns"}
::::div{class="rt-object-fn"}
### Validation
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-validate" commentEnd="// end-validate" />
::::

::::div{class="rt-object-fn"}
### JSON roundtrip to the original type
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-json" commentEnd="// end-json" />
::::

::::div{class="rt-object-fn"}
### Binary serialization
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-binary" commentEnd="// end-binary" />
::::

::::div{class="rt-object-fn"}
### Mocking that conforms to your types
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-mock" commentEnd="// end-mock" />
::::
:::

:::card{class="rt-standard-card"}
::::div{class="rt-standard-split rt-stack-reverse"}
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-standard" commentEnd="// end-standard" />

:::::div{class="rt-feature-card rt-standard-prose"}
### Speaks Standard Schema
The same type becomes a [Standard Schema](https://github.com/standard-schema/standard-schema), the shared `~standard` contract that tRPC, TanStack Form and Router, Hono and many more accept directly. One call, no adapter to write.

[One spec, every framework →](/guide/validation#standard-schema)
:::::
::::
:::
::

::u-page-section
#title
The reflection TypeScript never shipped

#body
:::div{class="rt-feature-row rt-stack-reverse"}
<code-import path="packages/examples/src/_homepage/reflection.ts" lang="ts" />

::::card{class="rt-feature-card"}
### Recover the type graph
Get back a traversable RunType node — the same graph the library walks internally: kind, property names, nested children, format annotations and more. Bring a type or infer it from a runtime value, then read it however you need — to drive codegen, build forms, or power your own tooling.

<br>

[Reflection you can actually walk →](/guide/reflection)
::::
:::

:::div{class="rt-feature-row rt-stack-reverse"}
<code-import path="packages/examples/src/_homepage/reflection-value.ts" lang="ts" commentStart="// start-value" commentEnd="// end-value" />

::::card{class="rt-feature-card"}
### Infer types from a values
You don't have to write the type out. Hand `getRunType` any value and it reflects that value's static type, so `getRunType(order)` returns the same node as `getRunType<Order>()`. Reach for it when you already hold the data and just want its shape.
::::
:::
::


::u-page-section
---
class: ai-section
---
#title
:u-icon{name="i-lucide-sparkles" class="ai-title-icon"} AI Agents meets Deterministic

#body

:::card-group
---
class: sm:grid-cols-2 ai-artifacts
---
  ::::card
  ---
  title: AI-generated human-readable labels & errors
  icon: i-lucide-message-square-text
  to: /ai-integration/friendly-type
  ---
  Friendly field labels and error messages for your forms and UI — written for people, kept in sync with your type.
  ::::

  ::::card
  ---
  title: AI-generated real-world mock data
  icon: i-lucide-dices
  to: /ai-integration/mock-data
  ---
  Believable sample data — real names, emails, addresses — for your tests and demos, with every value valid for its field.
  ::::
:::

:::div{class="ai-steps-head"}
### The compiler writes the code, your agent fills the blanks
Some values the compiler can't invent — a clear field label, a friendly error message, a believable sample name. So it does the hard part: it scaffolds a real, type-accurate source file, your agent fills in the blanks, and the compiler keeps it all in sync.
:::

:::div{class="ai-steps"}
::::div{class="ai-step"}
[1]{.ai-step-num}[The compiler scaffolds]{.ai-step-title}

From your type it writes a real source file — every field in place, correctly typed, with each blank marked.
::::

::::div{class="ai-step"}
[2]{.ai-step-num}[The AI agent fills the gaps]{.ai-step-title}

Guided by the type, the agent writes the labels, messages and sample values into the blanks.
::::

::::div{class="ai-step"}
[3]{.ai-step-num}[The compiler checks & keeps in sync]{.ai-step-title}

It checks every value against the type and updates the file as your type changes — your edits kept.
::::
:::

:::tabs

::::tabs-item{label="FriendlyText" icon="i-lucide-message-square-text"}
:::::code-group

```ts [Your type]
import type * as TF from '@ts-runtypes/core/formats';

// models/user.ts
export interface User {
  name: TF.String<{ minLength: 2; maxLength: 60 }>;
  age: TF.Number<{ min: 0; max: 120 }>;
  email: TF.Email;
}
```

```ts [Generated by the compiler]
import type { FriendlyText } from '@ts-runtypes/core';
import type { User } from './user';

// scaffolded by `gen`: every field in place, each blank marked @todo
export const userFriendly: FriendlyText<User> = {
  rt$label: '', // @todo
  rt$errors: { type: '' }, // @todo
  name: {
    rt$label: '', // @todo
    rt$errors: {
      type: '',      // @todo
      minLength: '', // @todo
      maxLength: '', // @todo
    },
  },
  age: {
    rt$label: '', // @todo
    rt$errors: {
      type: '', // @todo
      min: '',  // @todo
      max: '',  // @todo
    },
  },
  email: { rt$label: '', rt$errors: { type: '', pattern: '' } },   // @todo
};
```

```ts [Filled by the agent]
import type { FriendlyText } from '@ts-runtypes/core';
import type { User } from './user';

export const userFriendly: FriendlyText<User> = {
  rt$label: 'User account',
  rt$errors: { type: '' },
  name: {
    rt$label: 'Full name',
    rt$errors: {
      type: '$[label] must be a valid name',
      minLength: '$[label] needs at least $[val] characters',
      maxLength: '$[label] allows at most $[val] characters',
    },
  },
  age: {
    rt$label: 'Age',
    rt$errors: {
      type: '$[label] must be a number',
      min: '$[label] must be at least $[val]',
      max: '$[label] must be no more than $[val]',
    },
  },
  email: { rt$label: 'Email', rt$errors: { type: '', pattern: 'Enter a valid email address' } },
};
```

:::::
::::

::::tabs-item{label="MockData" icon="i-lucide-dices"}
:::::code-group

```ts [Your type]
import type * as TF from '@ts-runtypes/core/formats';

// models/user.ts
export interface User {
  name: TF.String<{ minLength: 2; maxLength: 60 }>;
  age: TF.Number<{ min: 0; max: 120 }>;
  email: TF.Email;
}
```

```ts [Generated by the compiler]
import type { MockData } from '@ts-runtypes/core';
import type { User } from './user';

// scaffolded by `gen`: one entry per field, each blank marked @todo
export const userMock: MockData<User> = {
  name: { pool: [] },       // @todo believable names
  age: { min: 0, max: 0 },  // @todo realistic range
  email: { pool: [] },      // @todo real-looking addresses
};
```

```ts [Filled by the agent]
import type { MockData } from '@ts-runtypes/core';
import type { User } from './user';

export const userMock: MockData<User> = {
  name: { pool: ['Alice Martin', 'Liang Wei', 'Fatima Noor', /* …50+ */] },
  age: { min: 18, max: 95 },
  email: { pool: ['alice@example.com', 'liang@corp.io', /* … */] },
};
```

:::::
::::

:::

:::div{class="ai-explore"}
[Explore AI integration →](/ai-integration/workflow-and-commands)
:::
::


::u-page-section
#title
Performance is nothing without control

#body
:::div{class="rt-feature-row rt-feature-row--top"}
::::card{class="rt-feature-card"}
### Toe to Toe with the fastest
Our performance matches the fastest validators (AJV, TypeBox, Typia)    
Even in their faster JIT mode, but without any JIT compilation cost.

:::::perf-bars
---
caption: Validation throughput — is-valid check (ops/sec, higher is better)
footnote: Zod has no fast is-valid path — it validates by parsing to errors, so its bar is the error-reporting result.
bars:
  - name: ts-runtypes
    score: 40.6
    label: 40.6M
    highlight: true
  - name: typia
    score: 39.7
    label: 39.7M
  - name: typebox-Jit
    score: 38.2
    label: 38.2M
  - name: ajv-Jit
    score: 36.9
    label: 36.9M
  - name: zod
    score: 7.9
    label: 7.9M
    muted: true
---
:::::

:::::div{class="rt-card-footer"}
[See the full head-to-head →](/benchmarks/validation)
:::::
::::

::::card{class="rt-feature-card"}
### Tested to the highest standard
:::::stat-tiles
---
tiles:
  - value: "7,073"
    label: front-end tests
    sub: Vitest — marker + plugin
    hue: 145
  - value: "1,007"
    label: Go tests
    sub: go test ./internal
    hue: 198
  - value: "∞"
    label: Fuzzy Testing
    sub: Random inputs and randomly-generated types, checked against invariants — every finding replayable from a seed.
    hue: 280
    wide: true
---
:::::

Every transform, cache shape and generated function is covered — on top of an extensive structured suite spanning validation, JSON, binary, mocks and reflection.
::::
:::
::

::u-page-section
#title
Tree-shaken to the bone

#body
:::div{class="rt-treeshake-cols"}
::::card{class="rt-feature-card"}
### Ship only what you call
Caches are demand-driven and every entry is its own module, so bundlers split and tree-shake natively. A file that only reflects an id ships zero validation code — and the Vite plugin adds zero runtime dependencies.

<br>

[Build-time, not run-time →](/introduction/about-ts-runtypes#build-time-not-run-time)
::::

::::code-group
```ts [Source Code]
type Order = {
  id: string;
  name: number;
  email: string;
};

const isUser = createValidateFn<User>();
```
::::

::::code-group
```ts [Transformed]
import {__rt_a1b_Xk7} from './__runtypes/types/a1b_Xk7.js';

type Order = {
  id: string;
  name: number;
  email: string;
};

const isUser = createValidateFn<User>(__rt_a1b_Xk7);
```
::::

::::code-group
```js [__runtypes/types/a1b_Xk7.js]
// shown as a function for clarity — the real emit is a positional
// tuple: faster to initialise, fewer bytes on the wire
export function __rt_a1b_Xk7(value) {
  return typeof value === "object" && value !== null &&
  typeof value.id === "number" &&
  typeof value.name === "string" &&
  typeof value.email === "string";
}
```
::::
:::
::

[&nbsp;]{style="padding-bottom: 6rem;"}

<!-- code-import-timestamp 1782040053177 -->
