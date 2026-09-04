// The unresolved import one object deeper: the marker's root type is a healthy
// interface declared here, and only its `user` member degrades to `any`. Both
// getRunTypeId call shapes (marker rule); the hand-written `any` member is
// DELIBERATE and must stay silent.
import {User} from './missing-module';
import {getRunTypeId} from '@mionjs/run-types';

export interface Payload {
  id: string;
  user: User;
}

export const idStatic = getRunTypeId<Payload>();

declare const payload: Payload;
export const idReflect = getRunTypeId(payload);

export interface Loose {
  id: string;
  data: any;
}
export const idLoose = getRunTypeId<Loose>();
