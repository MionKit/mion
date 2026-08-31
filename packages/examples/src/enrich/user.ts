import type * as TF from '@mionjs/run-types/formats';

// models/user.ts: the source type every enrichment example derives from.
export interface User {
  name: TF.String<{minLength: 2; maxLength: 60}>;
  age: TF.Number<{min: 0; max: 120}>;
  isActive: boolean;
  tags: string[];
  profile: {
    email: TF.Email;
    score: TF.Number<{min: 0; max: 100}>;
  };
}
