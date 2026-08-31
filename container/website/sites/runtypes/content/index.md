---
seo:
  title: 'RunTypes: The evolution of validation libraries'
  description: Validation, JSON + binary serialization, mock data and reflection, generated straight from your TypeScript types. No schemas, no drift.
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
leading: "The evolution of validation libraries"
titles:
  - 'High Perf Validation'
  - 'Automatic Json Roundtrip'
  - 'Automatic Data Mocking'
  - 'RunTime Types Reflection'
  - 'Say hello to ts-runtypes'
---
#description
**Why stop at validation?**
<br/>Your validator already knows the exact shape of your data. RunTypes turns that same knowledge into validation, serialization, mocking and reflection, straight from your TypeScript types.
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
One type, many functions.

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
:::card{class="rt-standard-card"}
::::div{class="rt-standard-split"}
:::::div{class="rt-feature-card rt-standard-prose"}
### The whole toolbelt, in one box
Stop gluing many libraries together. Every function RunTypes generates comes from the same type, so they all agree on what your data looks like.

[One type in, multiple compiled functions out →](/guide/json-serialization)
:::::

<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-type" commentEnd="// end-type" />
::::
:::

:::div{class="rt-object-fns"}
::::div{class="rt-row-intro"}
### Validation
Like any other validation library, but here TypeScript is the source of truth. RunTypes generates highly optimised functions at build time, so it keeps up with the fastest validators with no runtime dependencies. [See the benchmarks →](/benchmarks/validation)

The same type is also a Standard Schema, the shared `~standard` contract that tRPC, TanStack Form and Router, Hono and many more accept directly. One call, no adapter to write.
::::

::::div{class="rt-object-fn"}
#### Type guard and error list
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-validate" commentEnd="// end-validate" />

[How validation works →](/guide/validation)
::::

::::div{class="rt-object-fn"}
#### Standard Schema
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-standard" commentEnd="// end-standard" />

[One spec, every framework →](/guide/validation#standard-schema)
::::
:::

:::div{class="rt-object-fns"}
::::div{class="rt-row-intro"}
### JSON roundtrip
**No hand written coercion, no transforms to keep in sync. It also makes RPC calls in JavaScript just work.**

Your type compiles into two functions, one that writes JSON and one that reads it back. Date, bigint, Set, Temporal and more come back as real values, with no coerce or transform code to write by hand.
::::

::::div{class="rt-object-fn"}
#### RunTypes
<code-import path="packages/examples/src/_homepage/json-roundtrip.ts" lang="ts" commentStart="// start-roundtrip" commentEnd="// end-roundtrip" />
::::

::::div{class="rt-object-fn"}
#### Zod (hand maintained coercion and transform)
```ts
const sessionSchema = z.object({
  user: z.string(),
  // manually revive the Date
  expiresAt: z.coerce.date(),
  // manual Set revive
  roles: z.array(z.string()).transform((a) => new Set(a)), 
});

// encoding is also yours: JSON.stringify writes a Set as {}
const toJson = (session: Session) =>
  JSON.stringify({...session, roles: [...session.roles]});

const wire = toJson({user: 'ada', expiresAt: new Date(), roles: new Set(['admin'])});
const back = sessionSchema.parse(JSON.parse(wire));

// nothing checks toJson and sessionSchema agree:
// Devs must manually keep the two directions in sync
```
::::

[JSON that keeps your types →](/guide/json-serialization)
:::

:::div{class="rt-object-fns rt-section-titles"}
::::div{class="rt-object-fn"}
### Mocking that conforms to your types
Sample data generated from your type, so every value always has the right shape. Great for tests, demos and seeding a database.

<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-mock" commentEnd="// end-mock" />

[Mock data from your types →](/guide/mocking)
::::

::::div{class="rt-object-fn"}
### Binary serialization
A compact binary format as an alternative to JSON. It shines when your data is heavy on numbers and floats, where it saves the most space and time.

<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-binary" commentEnd="// end-binary" />

[Compact bytes on the wire →](/guide/binary-serialization)
::::
:::

::

::u-page-section
#title
Two ways to describe a shape, one source of truth.

#body
We support **native TypeScript types** (fastest, zero ceremony) **or** the `RT.*` type builders if you like the Zod / TypeBox feel. Both compile to the exact same validator, so pick whichever you fancy and mix them in the same file. And when you only take the type back out of a builder, the schema itself adds nothing to your bundle.

:::div{class="rt-define-cols"}
::::code-group
<code-import path="packages/examples/src/_homepage/define-type.ts" lang="ts [Type Definition]" />
::::

::::code-group
<code-import path="packages/examples/src/_homepage/define-builder.ts" lang="ts [Type Builder]" />
::::
:::

[Types and type builders, side by side →](/guide/type-builders)
::

::u-page-section
#title
Formats baked into your types

#body
:::div{class="rt-formats-cols"}
::::card{class="rt-feature-card"}
### TypeFormats
Ensure type safety with formats like:    
`email`, `uuidv4`, `ipv4`, `int32`, `positive` and more. 

The validator checks its exact shape, not just its kind. No regex to wire up, no separate schema to keep in sync.

:::::div{class="rt-formats-tile"}
#### Temporal Support
Full TC39 Temporal (`PlainDate`, `ZonedDateTime`, `Duration` and the rest), validated and serialized like any built-in.
:::::

[Every format you can use →](/guide/type-formats)
::::

::::code-group
<code-import path="packages/examples/src/_homepage/formats-type.ts" lang="ts [Type Definition]" />
::::

::::code-group
<code-import path="packages/examples/src/_homepage/formats-builder.ts" lang="ts [Type Builder]" />
::::
:::
::


::u-page-section
#title
Your types, available at runtime

#body
:::div{class="rt-feature-row rt-stack-reverse"}
<code-import path="packages/examples/src/_homepage/reflection.ts" lang="ts" />

::::card{class="rt-feature-card"}
### Walk your type's structure
Get back a RunType node you can walk, the same one the library uses internally: kind, property names, nested children, format annotations and more. Bring a type or infer it from a value, then read it however you need, to drive codegen, build forms, or power your own tooling.

<br>

[Reflection you can actually walk →](/guide/reflection)
::::
:::

:::div{class="rt-feature-row rt-stack-reverse"}
<code-import path="packages/examples/src/_homepage/reflection-value.ts" lang="ts" commentStart="// start-value" commentEnd="// end-value" />

::::card{class="rt-feature-card"}
### Infer types from values
You don't have to write the type out. Hand `getRunType` any value and it reflects that value's static type, so `getRunType(order)` returns the same node as `getRunType<Order>()`. Reach for it when you already hold the data and just want its shape.
::::
:::
::

::u-page-section
#title
High performance compiled code

#body
:::div{class="rt-feature-row rt-feature-row--top"}
::::card{class="rt-feature-card"}
### Every library says they are the fastest, we back it up!
Our performance matches and surpasses the fastest validators (AJV, TypeBox, Typia) 
and we have the most comprehensive benchmark suite to back it up.

:::::perf-bars
---
caption: Validation throughput, is-valid check (ops/sec, higher is better)
footnote: Zod has no fast is-valid path. It validates by parsing to errors, so its bar is the error-reporting result.
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
[See the full benchmarks results →](/benchmarks/validation)
:::::
::::

::::card{class="rt-feature-card"}
### Tested to the highest standard
:::::stat-tiles
---
tiles:
  - source: frontEndTests
    label: front-end tests
    sub: Vitest (marker + plugin)
    hue: 145
  - source: goTests
    label: Go tests
    sub: go test ./internal
    hue: 198
  - value: "∞"
    label: Fuzzy Testing
    sub: Random inputs and randomly-generated types, checked against invariants, with every finding replayable from a seed.
    hue: 280
    wide: true
---
:::::

Every transform, cache shape and generated function is covered, on top of an extensive structured suite spanning validation, JSON, binary, mocks and reflection.
::::
:::
::

::u-page-section
#title
Compile time code generation

#body
:::div{class="rt-treeshake-cols"}
::::card{class="rt-feature-card"}
### Ship only what you use
Generated code is demand-driven and every entry is its own module, so bundlers split and tree-shake natively. A file that only reflects an id ships zero validation code, and the Vite plugin adds zero runtime dependencies.

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
// shown as a function for clarity, the real emit is a positional
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

::u-page-section
---
class: ai-section
---
#title
:u-icon{name="i-lucide-sparkles" class="ai-title-icon"} AI Agents meets Deterministic

#body

:::div{class="ai-experimental"}
[Experimental]{.rt-badge-experimental}
:::

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
  Friendly field labels and error messages for your forms and UI, written for people, kept in sync with your type.
  ::::

  ::::card
  ---
  title: AI-generated real-world mock data
  icon: i-lucide-dices
  to: /ai-integration/mock-data
  ---
  Believable sample data (real names, emails, addresses) for your tests and demos, with every value valid for its field.
  ::::
:::

:::div{class="ai-steps-head"}
### The compiler writes the code, your agent fills the blanks
Some values the compiler can't invent: a clear field label, a friendly error message, a believable sample name. So it does the hard part: it scaffolds a real, type-accurate source file, your agent fills in the blanks, and the compiler keeps it all in sync.
:::

:::div{class="ai-steps"}
::::div{class="ai-step"}
[1]{.ai-step-num}[The compiler scaffolds]{.ai-step-title}

From your type it writes a real source file, every field in place, correctly typed, with each blank marked.
::::

::::div{class="ai-step"}
[2]{.ai-step-num}[The AI agent fills the gaps]{.ai-step-title}

Guided by the type, the agent writes the labels, messages and sample values into the blanks.
::::

::::div{class="ai-step"}
[3]{.ai-step-num}[The compiler checks & keeps in sync]{.ai-step-title}

It checks every value against the type and updates the file as your type changes, keeping your edits.
::::
:::

:::card
---
title: FriendlyText
icon: i-lucide-message-square-text
class: rt-ai-example
---
::::div{class="rt-ai-example-cols"}
:::::code-group

```ts [Your type]
import type * as TF from '@mionjs/run-types/formats';

// models/user.ts
export interface User {
  name: TF.String<{ minLength: 2; maxLength: 60 }>;
  age: TF.Number<{ min: 0; max: 120 }>;
  email: TF.Email;
}
```

:::::

:::::code-group

```ts [Generated by the compiler]
import type { FriendlyText } from '@mionjs/run-types';
import type { User } from './user';

// scaffolded by `enrich`: every field in place, each blank marked @todo
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

:::::

:::::code-group

```ts [Filled by the agent]
import type { FriendlyText } from '@mionjs/run-types';
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
:::

:::card
---
title: MockData
icon: i-lucide-dices
class: rt-ai-example
---
::::div{class="rt-ai-example-cols"}
:::::code-group

```ts [Your type]
import type * as TF from '@mionjs/run-types/formats';

// models/user.ts
export interface User {
  name: TF.String<{ minLength: 2; maxLength: 60 }>;
  age: TF.Number<{ min: 0; max: 120 }>;
  email: TF.Email;
}
```

:::::

:::::code-group

```ts [Generated by the compiler]
import type { MockData } from '@mionjs/run-types';
import type { User } from './user';

// scaffolded by `enrich`: one entry per field, each blank marked @todo
export const userMock: MockData<User> = {
  name: { pool: [] },       // @todo believable names
  age: { min: 0, max: 0 },  // @todo realistic range
  email: { pool: [] },      // @todo real-looking addresses
};
```

:::::

:::::code-group

```ts [Filled by the agent]
import type { MockData } from '@mionjs/run-types';
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

[&nbsp;]{style="padding-bottom: 6rem;"}

<!-- code-import-timestamp 1786913265716 -->
