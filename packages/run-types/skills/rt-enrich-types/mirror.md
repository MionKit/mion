# Mirror directory + JSDoc tags

Where enrichment files live, how consumers import them, who owns each tag.

## Mirror directory: one file per family

- Enrichment is committed to a **mirror directory**: its tree shadows your source, split **per family**.
- Type defined in `src/models/user.ts`:
  - `friendly<Name>` consts (`FriendlyText<Name>`) → `<genDir>/enriched/friendly/src/models/user.ts`.
  - `mock<Name>` consts (`MockData<Name>`) → `<genDir>/enriched/mock/src/models/user.ts`.
- Path follows the source file from the tsconfig folder, or from `rootDir` when set.
  `rootDir: "src"` gives `friendly/models/user.ts`.
- Default `genDir`: `.mion` in the source folder (`rootDir`, else the folder all program files share).
- Configure it via the `mion` entry under `compilerOptions.plugins` in `tsconfig.json`.
- One mirror file per family per source file. Anchored at the type's **definition**, not its call sites.
- One `export` per enriched type defined there: one enrichment home per type, however many files consume it.
- The two families never share a file. Each family file imports only its own wrapper type.
- First committed RunTypes artifact (every other output is gitignored cache). Hand-editable.
- `enrich --no-emit` flags a mirror outside its family folder: enrich-mirror-moved (location drift).
- `--out` writes one combined file instead: explicit escape hatch.
- Each family file: strict `import type` back to the source (the rename **breadcrumb**)
  - committed consts you import by name.
- The `import type` is best-effort: consumed type not exported → file fails to compile → fix the export.

```ts
// src/.mion/enriched/mock/src/models/user.ts: GENERATED, COMMITTED, hand-editable
import type {User} from '../../../../../models/user';
import type {MockData} from '@mionjs/run-types';

/** @rtType User#9f3a @rtIds {age: b2, name: a1} */
// @todo: generated skeleton — fill in real data, then delete this line
export const mockUser: MockData<User> = {name: {pool: []}, age: {pool: []}};
```

Consumers use a **real, committed import**. Never plugin-injected (enrichment is committed, so its link is too).

```ts
// src/services/userForm.ts
import {createMockDataFn} from '@mionjs/run-types/mocking';
import {friendlyUser} from '../.mion/enriched/friendly/src/models/user';
import {mockUser} from '../.mion/enriched/mock/src/models/user';
import type {User} from '../models/user';

createMockDataFn<User>(undefined, {data: mockUser});
```

## The JSDoc tags

| Tag                     | Owner    | Meaning                                                                       |
| ----------------------- | -------- | ----------------------------------------------------------------------------- |
| `@rtType <Name>#<id>`   | compiler | const's stable structural identity; reconcile matches by this, not var name   |
| `@rtIds {field: id, …}` | compiler | each field's child type id: lets `--update` detect a **rename**, carry value  |
| `@rtOrphan …`           | compiler | whole const whose source type is gone: commented out (value kept), `--prune`d |
| `@rtOrphanChild …`      | compiler | one field removed from the type: commented out (value kept), `--prune`d       |
| `@todo …`               | **you**  | a blank the compiler scaffolded: fill it in, then **delete the line**         |

- Hand-authored comments survive `--update` and travel with a renamed field.
- `--update` only adds blanks, flags stale values, orphans gone fields.
