import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, getRunTypeId} from '@mionjs/run-types';

// start-array
// Everything you can say about an array beyond its element type rides one
// options bag, whichever way you write it.
type Tags = TF.FormattedArray<
  string[],
  {minItems: 1; maxItems: 5; uniqueItems: true}
>;

const isTags = createValidateFn<Tags>();
const isTagsBuilt = createValidateFn(
  RT.array(TF.string(), {minItems: 1, maxItems: 5, uniqueItems: true})
);

isTags(['ada', 'grace']); // true
isTags([]); // false, at least one entry
isTagsBuilt(['ada', 'ada']); // false, the entries repeat

// The two spellings are one generated function, not two that agree.
getRunTypeId<Tags>() ===
  getRunTypeId(
    RT.array(TF.string(), {minItems: 1, maxItems: 5, uniqueItems: true})
  ); // true
// end-array

// start-contains
// `contains` asks that at least one entry match a second type. The options bag
// takes the element TYPE when you write the type, and a runtype when you build.
type WithAdminId = TF.FormattedArray<
  string[],
  {contains: TF.UUID; minContains: 2}
>;

const hasTwoIds = createValidateFn<WithAdminId>();
const hasTwoIdsBuilt = createValidateFn(
  RT.array(TF.string(), {contains: TF.uuid(), minContains: 2})
);

hasTwoIds([
  'plain',
  '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e',
  '018f1b8c-2e3d-7b5c-8d6e-1f2a3b4c5d6e',
]); // true
hasTwoIdsBuilt(['plain', '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e']); // false, only one matches
// end-contains

// start-object
// Objects work the same way: the shape is the type, and everything else about
// the keys is an option.
interface Settings {
  theme: string;
  locale?: string;
}

type BoundedSettings = TF.FormattedObject<
  Settings,
  {minProperties: 1; maxProperties: 2}
>;

const isSettings = createValidateFn<BoundedSettings>();
const isSettingsBuilt = createValidateFn(
  RT.object(
    {theme: TF.string(), locale: RT.optional(TF.string())},
    {minProperties: 1, maxProperties: 2}
  )
);

isSettings({theme: 'dark'}); // true
isSettingsBuilt({theme: 'dark', locale: 'en'}); // true
// end-object

// start-keys
// Key patterns and key formats are options too. `patternProperties` maps a
// pattern to the type its matching keys carry; `propertyNames` constrains every
// key at once.
type Columns = TF.FormattedObject<
  Record<string, unknown>,
  {patternProperties: {'^col_': number}}
>;
type LowercaseKeys = TF.FormattedObject<
  Record<string, string>,
  {propertyNames: TF.Alpha}
>;

const isColumns = createValidateFn<Columns>();
const isLowercaseKeys = createValidateFn<LowercaseKeys>();

isColumns({col_width: 40}); // true
isColumns({col_width: 'wide'}); // false, a col_ key must hold a number
isLowercaseKeys({theme: 'dark'}); // true
isLowercaseKeys({'theme-2': 'dark'}); // false, the key is not alphabetic
// end-keys
