# `@mionkit/ui` — Package Specification

## Context

Mion is a type-driven framework where TypeScript types are the single source of truth. The `@mionkit/drizze` package already maps types to database columns via `toDrizzlePGTable<T>()` using a `extractTypeInfo` + base mapper + override merge pattern. This spec applies the same architectural pattern to generate Vue 3 form schemas from TypeScript types.

**Goal**: Define a type once, get a fully functional form with validation, labels, input types, and HTML attributes — all inferred automatically.

**Stack decisions**: Vue 3 (Composition API, slot model), Pico CSS (semantic HTML, CSS variables only).

---

## API Design

### Main Entry Point

```ts
function toUiVueForm<T>(
  overrides?: UiFormOverrides<T>,
  config?: UiFormConfig,
  type?: ReceiveType<T> // auto-injected type metadata
): UiFormSchema<T>;
```

- **Synchronous** at runtime — reads from a pre-filled cache (populated at startup/build time)
- Falls back to deterministic defaults if no cache exists
- Follows the same pattern as `toDrizzlePGTable<T>()` in `packages/drizze/src/postgres.ts`

### Schema Types

```ts
interface UiFormSchema<T> {
  typeId: string; // unique type ID from RunType.getTypeID()
  typeName: string;
  fields: {[K in keyof T as K extends string ? K : never]-?: FieldSchema};
  groups?: FieldGroup[];
  submitLabel?: string;
  layout?: 'vertical' | 'horizontal' | 'inline';
}

interface FieldSchema {
  typeId: string; // unique type ID from RunType.getTypeID()
  inputType: InputType;
  label: string;
  placeholder?: string;
  icon?: string;
  required: boolean;
  disabled?: boolean;
  hidden?: boolean;
  readonly?: boolean;
  order?: number;
  group?: string;
  htmlAttributes?: Record<string, string | number | boolean>;
  options?: {label: string; value: string | number | boolean}[];
  children?: UiFormSchema<any>; // nested objects
  arrayItemSchema?: FieldSchema; // array items
  runType: BaseRunType;
  propertyName: string;
  formatName?: string;
  formatParams?: Record<string, any>;
}

type InputType =
  | 'text'
  | 'email'
  | 'url'
  | 'number'
  | 'date'
  | 'datetime-local'
  | 'time'
  | 'checkbox'
  | 'select'
  | 'radio'
  | 'textarea'
  | 'hidden'
  | 'password'
  | 'tel'
  | 'color'
  | 'fieldset'
  | 'array';

interface FieldGroup {
  id: string;
  label: string;
  icon?: string;
  order?: number;
}
```

### Override Types

```ts
type UiFormOverrides<T> = {
  [K in keyof T as K extends string ? K : never]?: Partial<Omit<FieldSchema, 'runType' | 'propertyName'>>;
};

interface UiFormConfig {
  groups?: FieldGroup[];
  submitLabel?: string;
  layout?: 'vertical' | 'horizontal' | 'inline';
}
```

---

## Type → Input Mapping

Priority order (mirrors `BaseColumnMapper.mapProperty()` in `packages/drizze/src/mappers/base.mapper.ts`):

| Priority | Type / Format                  | inputType        | HTML Attributes                       |
| :------: | ------------------------------ | ---------------- | ------------------------------------- |
|    1     | `Date` class                   | `date`           | —                                     |
|    2     | Nested object                  | `fieldset`       | — (recursive sub-form)                |
|    3     | Array                          | `array`          | — (repeatable group)                  |
|    4     | `FormatEmail`                  | `email`          | `maxlength` from params               |
|    5     | `FormatURL`                    | `url`            | `maxlength` from params               |
|    6     | `FormatStringDate`             | `date`           | —                                     |
|    7     | `FormatDateTime`               | `datetime-local` | —                                     |
|    8     | `FormatTime`                   | `time`           | —                                     |
|    9     | `FormatIP`                     | `text`           | `pattern` from IP version             |
|    10    | `FormatUUID`                   | `hidden`         | — (auto-generated, not user-editable) |
|    11    | `FormatDomain`                 | `text`           | `maxlength` from params               |
|    12    | `FormatString`                 | `text`           | `maxlength`, `minlength`, `pattern`   |
|    13    | `FormatNumber` (integer)       | `number`         | `step=1`, `min`, `max`                |
|    14    | `FormatNumber` (float/default) | `number`         | `step=any`, `min`, `max`              |
|    15    | `FormatBigInt`                 | `number`         | `step=1`, `min`, `max`                |
|    16    | Enum / union of literals       | `select`         | — (options extracted)                 |
|    17    | `string` (primitive)           | `text`           | —                                     |
|    18    | `number` (primitive)           | `number`         | `step=any`                            |
|    19    | `boolean` (primitive)          | `checkbox`       | —                                     |
|    20    | `bigint` (primitive)           | `number`         | `step=1`                              |

Format names come from `FormatNames` in `packages/type-formats/src/constants.ts`.
HTML attribute extraction reuses utilities from `packages/drizze/src/core/utils.ts` (`getMaxLengthFromParams`, `isIntegerFormat`, etc.).

---

## Vue Component Architecture

### Component Hierarchy

```
FormRenderer
  └─ FieldWrapper (label + icon + error)
       ├─ MionInput (text, email, url, number, date, time, etc.)
       ├─ MionCheckbox
       ├─ MionSelect
       ├─ MionTextarea
       ├─ MionFieldset → recursive FormRenderer
       └─ MionArrayField (repeatable group with add/remove)
```

### FormRenderer

Top-level component. Renders `<form>` from `UiFormSchema<T>`.

- **Props**: `schema`, `modelValue`, `disabled`, `readonly`, `friendlyErrors`
- **Events**: `update:modelValue`, `submit`, `valid`, `invalid`
- **Named slots per field**: `#email`, `#birthDate`, etc. — complete field replacement
- **`#actions` slot**: submit button area
- Renders fields sorted by `order`, grouped if `groups` are present

```vue
<FormRenderer :schema="userForm" v-model="formData" @submit="handleSubmit">
  <!-- Slot override: full control over one field -->
  <template #birthDate="{ field, modelValue, updateValue }">
    <MyFancyDatePicker :value="modelValue" @update="updateValue" />
  </template>
</FormRenderer>
```

### Priority chain

1. **Slot** — if provided, renders the slot (full component replacement)
2. **Override** — data-level customization (label, icon, placeholder, inputType)
3. **Cache** — LLM-enriched defaults (paid tier)
4. **Deterministic** — camelCase split labels, format-derived attributes (free tier)

### Pico CSS Integration

Components render semantic HTML — Pico CSS auto-styles them without classes:

```html
<label for="email">
  Email Address
  <input type="email" id="email" placeholder="..." required />
  <small>Please enter a valid email</small>
  <!-- error message -->
</label>
```

Error states use `aria-invalid="true"` (Pico CSS supports this natively).
Users can swap Pico for any CSS targeting the same semantic structure.

---

## Validation Integration

Reuses RunType JIT validators — no separate validation library needed.

### Composable: `useFormValidation<T>()`

```ts
function useFormValidation<T>(
  schema: UiFormSchema<T>,
  friendlyErrors?: FriendlyErrors<T>
): {
  errors: Ref<Partial<Record<keyof T, string>>>;
  validateField: (name: keyof T, value: unknown) => string | undefined;
  validateForm: (value: T) => boolean;
  isValid: Ref<boolean>;
  resetValidation: () => void;
};
```

- **Per-field**: on `blur`, validate field's RunType
- **Full form**: on `submit`, validate entire type via `createTypeErrorsFn<T>()`
- **Error messages**: through `getFriendlyErrors<T>()` from `packages/core/` or default error printer

### Composable: `useFormState<T>()`

```ts
function useFormState<T>(initial: T): {
  formData: Ref<T>;
  isDirty: Ref<boolean>;
  touched: Ref<Partial<Record<keyof T, boolean>>>;
  resetForm: (values?: Partial<T>) => void;
  setFieldValue: (field: keyof T, value: unknown) => void;
};
```

---

## Cache System

### Purpose

`toUiVueForm` is synchronous. The cache holds pre-computed schema data (labels, placeholders, icons, groups) so no async work happens at render time.

### Cache Lifecycle

**Without LLM (deterministic only)**:

- `toUiVueForm` calls `extractTypeInfo<T>()` + `UiFieldMapper` inline
- Deterministic defaults are cheap to compute — cache is optional but beneficial

**With LLM enrichment (paid)**:

1. At dev startup / build time: Vite plugin scans `toUiVueForm<T>()` call sites
2. Runs deterministic extraction, sends to LLM API for enrichment
3. Merges results, caches to disk (`node_modules/.vite/mion-ui-cache.json`)
4. At runtime: `toUiVueForm` reads from cache synchronously
5. Cache invalidated when type structure changes (hash comparison)

### Cache Structure

```ts
interface UiSchemaCache {
  version: string;
  schemas: Record<
    string,
    {
      // keyed by type ID
      typeName: string;
      fields: Record<string, CachedFieldSchema>;
      groups?: FieldGroup[];
    }
  >;
}
```

Follows the disk cache pattern from `packages/devtools/src/vite-plugin/aotDiskCache.ts`.

---

## Deterministic Defaults (Free Tier)

### Label Generation

```ts
camelToLabel("birthDate")    → "Birth Date"
camelToLabel("emailAddress") → "Email Address"
camelToLabel("ipAddress")    → "IP Address"
camelToLabel("userId")       → "User ID"
```

Known abbreviations expanded: `url→URL`, `ip→IP`, `id→ID`, `uuid→UUID`, `html→HTML`, `api→API`, `json→JSON`.

### HTML Attributes

Extracted from format params (reusing drizze utilities):

- `maxLength` → `maxlength`
- `minLength` → `minlength`
- `length` → `maxlength` + `minlength`
- `min`/`max` → `min`/`max`
- `integer` → `step=1`
- `float` → `step=any`
- `multipleOf` → `step`
- `pattern` → `pattern` (regex source)

### Enum/Union Options

- Enum values → `{label: camelToLabel(value), value}`
- Union of literals → same treatment
- Mixed unions → fall back to first matching type's input

---

## LLM Enrichment (Paid Tier)

### What it fills

| Property    | Deterministic      | LLM-enriched                                 |
| ----------- | ------------------ | -------------------------------------------- |
| label       | "Birth Date"       | "Date of Birth"                              |
| placeholder | empty              | "e.g. 25/12/1990"                            |
| icon        | none               | "calendar"                                   |
| group       | none               | "Personal Information"                       |
| order       | declaration order  | logical UX order                             |
| inputType   | from mapping table | may override (e.g. `textarea` for long text) |

### API Shape

```ts
// Request: type info + deterministic schema (tiny payload, no source code)
interface LlmEnrichmentRequest {
  typeName: string;
  fields: {
    propertyName: string;
    typescriptType: string;
    inputType: InputType;
    currentLabel: string;
    required: boolean;
    formatName?: string;
  }[];
}

// Response: enhanced metadata only
interface LlmEnrichmentResponse {
  fields: {
    propertyName: string;
    label?: string;
    placeholder?: string;
    icon?: string;
    group?: string;
    order?: number;
    inputType?: InputType;
  }[];
  groups?: FieldGroup[];
}
```

- Results cached server-side (consistent across requests)
- Results cached locally on disk (no repeated API calls)
- If API unavailable → deterministic fallback (never blocks)
- API key via `MION_UI_API_KEY` env var

---

## Package Structure

```
packages/ui/
  src/
    index.ts                     # public exports
    core/
      typeTraverser.ts           # reuse/import extractTypeInfo from drizze
      uiMapper.ts                # base mapper: PropertyInfo → FieldSchema
      defaults.ts                # camelToLabel, extractHtmlAttributes, extractOptions
      validator.ts               # override validation
      cache.ts                   # cache read/write
      utils.ts                   # shared utilities
    schema/
      toUiVueForm.ts             # main entry point
      types.ts                   # all type definitions
    components/
      FormRenderer.vue
      FieldWrapper.vue
      MionInput.vue
      MionCheckbox.vue
      MionSelect.vue
      MionTextarea.vue
      MionFieldset.vue
      MionArrayField.vue
    composables/
      useFormValidation.ts
      useFormState.ts
    enrichment/
      llmClient.ts               # LLM API client
      mergeEnrichment.ts          # merge LLM results with deterministic
    vite/
      uiVitePlugin.ts            # Vite plugin for cache generation
  vitest.config.ts
  package.json
  vite.config.ts
```

### Dependencies

```json
{
  "dependencies": {
    "@mionkit/core": "workspace:*",
    "@mionkit/run-types": "workspace:*",
    "@mionkit/type-formats": "workspace:*"
  },
  "peerDependencies": {
    "vue": "^3.4.0",
    "@iconify/vue": "^4.0.0"
  },
  "peerDependenciesMeta": {
    "@iconify/vue": {"optional": true}
  }
}
```

---

## Key Files to Reuse/Reference

| What                | File                                                      | Why                                               |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Type traversal      | `packages/drizze/src/core/typeTraverser.ts`               | `extractTypeInfo<T>()` — same logic needed        |
| Base mapper pattern | `packages/drizze/src/mappers/base.mapper.ts`              | Priority-ordered `mapProperty()` routing          |
| Override merge      | `packages/drizze/src/postgres.ts`                         | `MergedColumns` type + config-or-generate loop    |
| Format names        | `packages/type-formats/src/constants.ts`                  | `FormatNames` constant for mapping                |
| Param utilities     | `packages/drizze/src/core/utils.ts`                       | `getMaxLengthFromParams`, `isIntegerFormat`, etc. |
| PropertyInfo type   | `packages/drizze/src/types/common.types.ts`               | Shared property info structure                    |
| Friendly errors     | `packages/core/src/types/formats/friendlyErrors.types.ts` | Error display integration                         |
| Disk cache pattern  | `packages/devtools/src/vite-plugin/aotDiskCache.ts`       | Cache invalidation via hash                       |

**Note**: `extractTypeInfo` and `PropertyInfo` should ideally be extracted to `@mionkit/run-types` so both drizze and ui can import from there without cross-dependency.

---

## Resolved Decisions

1. **Shared code**: Duplicate `extractTypeInfo` + `PropertyInfo` into ui for now. Refactor to shared location later.
2. **Icons**: Use Iconify via `@iconify/vue` as optional peer dependency. Users can use any icon collection (Lucide, Material, Heroicons, etc.) through Iconify's unified `icon` string format (e.g. `"lucide:mail"`, `"mdi:email"`, `"heroicons:envelope"`).
3. **V1 scope**: Full support for nested objects (fieldset) and arrays (repeatable groups) from v1.
4. **Enum/union detection**: UI's traverser extends the duplicated `PropertyInfo` with enum/union-of-literals detection.

## Remaining Open Questions

1. **Textarea heuristic**: Without LLM, when to use textarea? Proposed: `FormatString` with `maxLength > 200`
2. **Array item defaults**: When user clicks "Add" — use `mock()` from RunType, empty values, or configurable?
3. **Pico CSS version**: Target v2 specifically or stay version-agnostic via semantic HTML?
4. **i18n**: Support label i18n keys from start, or defer?

---

## Future Considerations (out of scope for v1)

- SSR compatibility
- Conditional fields (discriminated unions show/hide)
- Multi-step wizard forms (leveraging groups)
- File upload inputs
- Rich text editors
- React/Svelte ports (schema layer is framework-agnostic)
- Form generation from router method signatures
