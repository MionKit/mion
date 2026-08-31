import type * as TF from '@mionjs/run-types/formats';
import type {FriendlyText} from '@mionjs/run-types';

interface Signup {
  name: TF.String<{minLength: 2; maxLength: 60}>;
}

// rt$default as the node's ONLY key: one message for every failure of the field.
export const friendlySignup: FriendlyText<Signup> = {
  rt$label: 'Signup',
  rt$errors: {type: ''},
  name: {
    rt$label: 'Full name',
    rt$errors: {rt$default: 'Enter a name between 2 and 60 characters'},
  },
};
