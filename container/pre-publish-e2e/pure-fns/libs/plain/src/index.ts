import {registerPureFn} from '@mionjs/run-types';

export const padId = registerPureFn((n: number): string => String(n).padStart(4, '0'));
