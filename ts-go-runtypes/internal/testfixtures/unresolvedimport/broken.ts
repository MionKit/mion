// A file whose import does NOT resolve in the scan program (the runtime
// bundler might resolve it fine — the module-resolution-skew trap). Marker
// sites over the unresolved type check as `any` and must diagnose MKR007.
// Both getRunTypeId call shapes (marker rule); the explicit `any` keyword
// site is DELIBERATE and must stay silent.
import {User} from './missing-module';
import {getRunTypeId} from '@ts-runtypes/core';

export const idStatic = getRunTypeId<User>();

declare const user: User;
export const idReflect = getRunTypeId(user);

export const idExplicitAny = getRunTypeId<any>();
