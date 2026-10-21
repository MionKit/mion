import {registerPureFn} from '@mionjs/run-types/runtime';

export const double = registerPureFn((input: number): number => input * 2);
