// Control: everything resolves — no marker-any-from-unresolved-import regardless of shapes.
import {getRunTypeId} from '@mionjs/run-types';

interface Person {
  name: string;
}

export const idStatic = getRunTypeId<Person>();

const person: Person = {name: 'Ada'};
export const idReflect = getRunTypeId(person);
