import {createGetValidationErrorsFn} from '@mionjs/run-types';
import type * as TF from '@mionjs/run-types/formats';

type SignUp = {email: TF.EmailAddress; card: TF.CreditCard};

// start-switch
const signUpErrors = createGetValidationErrorsFn<SignUp>();

export function explain(input: unknown): string[] {
  const messages: string[] = [];
  for (const error of signUpErrors(input)) {
    // `format.name` narrows `errorType` to that format's own modes, so a typo
    // in a mode name is a compile error.
    switch (error.format?.name) {
      case 'email':
        messages.push(
          error.format.errorType === 'localPart'
            ? 'Check the part before the @'
            : 'Check the email address'
        );
        break;
      case 'creditCard':
        messages.push(
          error.format.errorType === 'checksum'
            ? 'Check the card digits'
            : 'That is not a card we take'
        );
        break;
      default:
        messages.push(`${error.path.join('.')}: expected ${error.expected}`);
    }
  }
  return messages;
}
// end-switch
