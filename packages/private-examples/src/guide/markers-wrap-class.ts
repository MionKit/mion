import {type InjectRunTypeId} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';

class Described<T> {
  readonly text: string;
  constructor(value?: T, id?: InjectRunTypeId<T>) {
    const runType = getRunType<T>(undefined, id);
    this.text = `type #${runType.id} (kind ${runType.kind})`;
  }
}

new Described<{id: number; name: string}>(); // explicit T
const tags: string[] = ['a', 'b'];
new Described(tags); // inferred T, still gets the id

export {Described};
