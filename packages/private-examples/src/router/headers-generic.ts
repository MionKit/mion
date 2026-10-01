import {HeadersSubset} from '@mionjs/core';

function withHeader<Name extends string>(
  headers: Record<Name, string>
): HeadersSubset<Name> {
  return new HeadersSubset<Name>(headers, undefined);
}

export {withHeader};
