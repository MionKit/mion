import {createJsonDecoderFn, type DataOnly} from '@mionjs/run-types';

// start-data-only
interface Task {
  title: string;
  done: boolean;
  onDone: () => void; // dropped, with a build warning
  toggle(): void; // dropped, with a build warning
}

const decodeTask = createJsonDecoderFn<Task>();

// DataOnly<Task> is {title: string; done: boolean}
const task: DataOnly<Task> = decodeTask('{"title":"Write docs","done":false}');
// end-data-only

export {decodeTask, task};
