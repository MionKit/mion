import {getRunTypeId} from '@ts-runtypes/core';

// getRunTypeId reads the STATIC type of what you hand it. If the value
// has no useful type, there's nothing to read.

const typed = {id: 1, name: 'Ada'}; // inferred {id: number; name: string}
getRunTypeId(typed); // resolves a precise id

// Annotate (or assert) when the type would otherwise be lost.
const fromApi = JSON.parse('{"id":1}'); // any: type info is gone
getRunTypeId(fromApi); // resolves, but as `any` (a noop, accepts-all id)

type User = {id: number; name: string};
const asUser = JSON.parse('{"id":1,"name":"Ada"}') as User; // give it a type
getRunTypeId(asUser); // now you get User's id

export {typed, fromApi, asUser};
