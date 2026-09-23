import {type InjectRunTypeId} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';

function describe<T>(id?: InjectRunTypeId<T>): string {
  // id is an opaque handle: forward it as the last argument to resolve T
  const runType = getRunType<T>(undefined, id);
  return `type #${runType.id} (kind ${runType.kind})`;
}

describe<{id: number; name: string}>();
describe<string[]>();

export {describe};
