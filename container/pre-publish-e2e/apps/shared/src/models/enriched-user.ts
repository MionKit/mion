import type * as TF from '@ts-runtypes/core/formats';

// The source type the enrichment mirrors derive from. Lives under src/models/;
// its FriendlyText<T> + MockData<T> mirrors are GENERATED (by `ts-runtypes gen`)
// into src/__runtypes/enriched/{friendly,mock,i18n}/models/ — never hand-written next
// to this file.
export interface EnrichedUser {
  name: TF.String<{minLength: 2; maxLength: 60}>;
  age: number;
  isActive: boolean;
  tags: string[];
}
