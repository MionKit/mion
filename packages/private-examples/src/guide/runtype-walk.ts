import {RunTypeKind, type RunType} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';

type Order = {
  id: string;
  total: number;
  items: {sku: string; qty: number}[];
  status: 'open' | 'shipped' | 'cancelled';
};

// start-walk
function describe(rt: RunType): string {
  switch (rt.kind as number) {
    // leaves: no inner types
    case RunTypeKind.string:
      return 'string';
    case RunTypeKind.number:
      return 'number';
    case RunTypeKind.boolean:
      return 'boolean';
    case RunTypeKind.bigint:
      return 'bigint';
    case RunTypeKind.symbol:
      return 'symbol';
    case RunTypeKind.null:
      return 'null';
    case RunTypeKind.undefined:
      return 'undefined';
    case RunTypeKind.void:
      return 'void';
    case RunTypeKind.never:
      return 'never';
    case RunTypeKind.any:
      return 'any';
    case RunTypeKind.unknown:
      return 'unknown';
    case RunTypeKind.object:
      return 'object';
    case RunTypeKind.regexp:
      return 'RegExp';
    case RunTypeKind.templateLiteral:
      return 'string'; // a `${...}` template
    case RunTypeKind.literal:
      return JSON.stringify(rt.literal); // the value itself
    case RunTypeKind.enum:
      return (rt.values as unknown[])
        .map((value) => JSON.stringify(value))
        .join(' | ');

    // single child: recurse into `child`
    case RunTypeKind.array:
      return `${describe(rt.child as RunType)}[]`;
    case RunTypeKind.promise:
      return `Promise<${describe(rt.child as RunType)}>`;
    case RunTypeKind.rest:
      return `...${describe(rt.child as RunType)}[]`;
    case RunTypeKind.tupleMember:
      return `${describe(rt.child as RunType)}${rt.optional ? '?' : ''}`;

    // containers: recurse over `children`
    case RunTypeKind.tuple:
      return `[${(rt.children as RunType[]).map(describe).join(', ')}]`;
    case RunTypeKind.union:
      return (rt.children as RunType[]).map(describe).join(' | ');
    case RunTypeKind.intersection:
      return (rt.children as RunType[]).map(describe).join(' & ');
    case RunTypeKind.objectLiteral:
      return `{ ${(rt.children as RunType[]).map(describe).join('; ')} }`;

    // members: `name`, `optional` and the member's own `child`
    case RunTypeKind.property:
    case RunTypeKind.propertySignature:
    case RunTypeKind.parameter:
      return `${rt.name as string}${rt.optional ? '?' : ''}: ${describe(rt.child as RunType)}`;

    // a key type and a value type
    case RunTypeKind.indexSignature:
      return `[key: ${describe(rt.index as RunType)}]: ${describe(rt.child as RunType)}`;

    // callables: recurse over `parameters` and `return`
    case RunTypeKind.function:
    case RunTypeKind.method:
    case RunTypeKind.methodSignature:
    case RunTypeKind.callSignature:
      return `(${(rt.parameters as RunType[]).map(describe).join(', ')}) => ${describe(rt.return as RunType)}`;

    // builtins (Date, Map, Set, Temporal) have no children: print the name
    case RunTypeKind.class:
      return rt.children
        ? `{ ${(rt.children as RunType[]).map(describe).join('; ')} }`
        : String(rt.typeName ?? 'object');

    // typeParameter, infer, ref, enumMember: rare in data shapes
    default:
      return `/* kind ${rt.kind} */`;
  }
}

const orderRT = getRunType<Order>();
console.log(describe(orderRT));
// { id: string; total: number; items: { sku: string; qty: number }[]; status: "open" | "shipped" | "cancelled" }
// end-walk
