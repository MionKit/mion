// Control: everything resolves — no MKR007 regardless of shapes.
import {getRunTypeId} from '@mionjs/run-types';

interface Person {
  name: string;
}

export const idStatic = getRunTypeId<Person>();

const person: Person = {name: 'Ada'};
export const idReflect = getRunTypeId(person);
