import type * as TF from '@mionjs/run-types/formats';

// The source type the enrichment mirrors derive from. Lives under src/models/;
// its FriendlyText<T> + MockData<T> mirrors are GENERATED (by `mion gen`)
// into src/.mion/enriched/{friendly,mock,i18n}/models/ — never hand-written next
// to this file.
export interface EnrichedUser {
  name: TF.String<{minLength: 2; maxLength: 60}>;
  age: number;
  isActive: boolean;
  tags: string[];
}
