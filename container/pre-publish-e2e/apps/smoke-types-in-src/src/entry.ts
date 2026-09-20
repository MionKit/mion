// The twin of smoke-source: the same src/-definitions fixture, resolved through `types`.
import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
import type {SrcTypedUser} from '@acme/src-types';

export const isSrcTypedUser = createValidateFn<SrcTypedUser>();

// Both marker call shapes (CLAUDE.md marker rule).
export const srcUserIdStatic = getRunTypeId<SrcTypedUser>();
const sample: SrcTypedUser = {id: 1, label: 'u', since: new Date('2026-01-01T00:00:00Z')};
export const srcUserIdFromValue = getRunTypeId(sample);

export {selfCheck} from '../../shared/src/minimal';
